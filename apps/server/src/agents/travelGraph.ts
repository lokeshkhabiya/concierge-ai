import { END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
import {
  TravelStateAnnotation,
  type TravelAgentState,
  createInitialTravelState,
  getTripDuration,
} from "./state";
import {
  travelClarificationNode,
  travelPlanningNode,
  executionNode,
  travelValidationNode,
} from "./nodes";
import { llm } from "../llm";
import { travelItineraryGenerationPrompt } from "../llm/templates/travelPlanningPrompt";
import { toolRegistry } from "./tools";
import { logger } from "../logger";
import type { ItineraryDay } from "../types";

/**
 * Node function type for travel state
 */
type TravelNodeFunction = (
  state: TravelAgentState
) => Promise<Partial<TravelAgentState>>;

/**
 * Research destination node - searches for destination info
 */
const researchDestinationNode: TravelNodeFunction = async (state) => {
  const logContext = {
    sessionId: state.sessionId,
    taskId: state.taskId,
    agentType: "travel" as const,
  };

  logger.agentStep("researchDestination", "execution", logContext);

  const searchTool = toolRegistry.getTool("web_search");
  if (!searchTool) {
    return { error: "Web search tool not found" };
  }

  const destination =
    state.destination || (state.gatheredInfo.destination as string);

  try {
    // Search for activities
    const activitiesResult = await searchTool.invoke({
      query: `things to do in ${destination}`,
      category: "activity",
      maxResults: 10,
    });

    // Search for restaurants
    const restaurantsResult = await searchTool.invoke({
      query: `best restaurants in ${destination}`,
      category: "restaurant",
      maxResults: 5,
    });

    // Search for hotels
    const hotelsResult = await searchTool.invoke({
      query: `hotels in ${destination}`,
      category: "hotel",
      maxResults: 5,
    });

    const parseResult = (result: string) => {
      try {
        const parsed = JSON.parse(result);
        return (parsed.data?.results || []);
      } catch {
        return [];
      }
    };

    const researchResults = {
      activities: parseResult(activitiesResult),
      restaurants: parseResult(restaurantsResult),
      hotels: parseResult(hotelsResult),
    };

    logger.info(
      `Research complete: ${researchResults.activities.length} activities, ${researchResults.restaurants.length} restaurants, ${researchResults.hotels.length} hotels`,
      logContext
    );

    return {
      researchResults,
      gatheredInfo: {
        activitiesFound: researchResults.activities.length,
        restaurantsFound: researchResults.restaurants.length,
        hotelsFound: researchResults.hotels.length,
      },
    };
  } catch (error) {
    logger.error("Research destination failed", error as Error, logContext);
    return { error: (error as Error).message };
  }
};

/** Max chars per description to keep prompt under token limit (avoids full-page markdown) */
const MAX_DESCRIPTION_CHARS = 500;

/**
 * Trim research results for LLM: remove full-page markdown and cap description length
 * so the prompt stays under the model's token limit (e.g. 272K).
 */
function trimResearchResultsForPrompt(
  researchResults: Record<string, unknown>
): Record<string, unknown> {
  const trimmed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(researchResults)) {
    if (!Array.isArray(value)) {
      trimmed[key] = value;
      continue;
    }
    trimmed[key] = value.map((item: unknown) => {
      if (item === null || typeof item !== "object") return item;
      const obj = item as Record<string, unknown>;
      const { id, title, description, url, address, phone, rating, priceRange } =
        obj;
      const desc =
        typeof description === "string"
          ? description.slice(0, MAX_DESCRIPTION_CHARS) +
            (description.length > MAX_DESCRIPTION_CHARS ? "…" : "")
          : description;
      return {
        id,
        title,
        description: desc,
        url,
        address,
        phone,
        rating,
        priceRange,
      };
    });
  }
  return trimmed;
}

/**
 * Generate itinerary node - creates a day-by-day plan
 */
const generateItineraryNode: TravelNodeFunction = async (state) => {
  const logContext = {
    sessionId: state.sessionId,
    taskId: state.taskId,
    agentType: "travel" as const,
  };

  logger.agentStep("generateItinerary", "execution", logContext);

  try {
    const destination =
      state.destination || (state.gatheredInfo.destination as string);
    const startDate =
      state.startDate?.toString() ||
      (state.gatheredInfo.startDate as string) ||
      new Date().toISOString();
    const endDate =
      state.endDate?.toString() ||
      (state.gatheredInfo.endDate as string) ||
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const trimmedResearch = trimResearchResultsForPrompt(
      state.researchResults ?? {}
    );

    const response = await llm.invoke(
      await travelItineraryGenerationPrompt.formatMessages({
        destination,
        startDate,
        endDate,
        budget: state.budget
          ? `${state.budget.min}-${state.budget.max} ${state.budget.currency}`
          : state.gatheredInfo.budgetMax
          ? `up to ${state.gatheredInfo.budgetMax}`
          : "flexible",
        travelStyle:
          state.preferences.travelStyle.join(", ") ||
          (state.gatheredInfo.travelStyle as string[])?.join(", ") ||
          "general",
        interests:
          state.preferences.interests.join(", ") ||
          (state.gatheredInfo.interests as string[])?.join(", ") ||
          "sightseeing, local cuisine",
        researchResults: JSON.stringify(trimmedResearch, null, 2),
      })
    );

    const content = response.content as string;

    const tripDays = getTripDuration(state) || 2;
    const itinerary = parseItinerary(content, startDate, tripDays, logContext);

    logger.info(`Generated ${itinerary.length}-day itinerary`, logContext);

    return {
      itinerary,
      gatheredInfo: {
        itineraryDays: itinerary.length,
        totalEstimatedCost: itinerary.reduce(
          (sum, day) => sum + day.estimatedCost,
          0
        ),
      },
    };
  } catch (error) {
    logger.error("Generate itinerary failed", error as Error, logContext);
    return { error: (error as Error).message };
  }
};

/**
 * Parse itinerary from LLM response
 */
function parseItinerary(
  content: string,
  startDate: string,
  fallbackDays: number = 3,
  logContext?: { sessionId?: string; taskId?: string; agentType?: string }
): ItineraryDay[] {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const days = parsed.itinerary || [];

      if (Array.isArray(days) && days.length > 0) {
        return days.map((day: Record<string, unknown>, index: number) => {
          const date = new Date(startDate);
          date.setDate(date.getDate() + index);

          return {
            dayNumber: (day.dayNumber as number) || index + 1,
            date,
            theme: (day.theme as string) || `Day ${index + 1}`,
            activities: (day.activities as ItineraryDay["activities"]) || [],
            accommodation: (day.accommodation as ItineraryDay["accommodation"]) ?? null,
            meals: (day.meals as ItineraryDay["meals"]) || [],
            transportation: (day.transportation as ItineraryDay["transportation"]) || [],
            estimatedCost: (day.estimatedCost as number) || 100,
            notes: (day.notes as string[]) || [],
          };
        }) as ItineraryDay[];
      }
    }
  } catch (error) {
    logger.warn("Failed to parse itinerary JSON", { error });
  }

  const days = fallbackDays > 0 ? fallbackDays : 3;
  logger.warn(
    `Using default ${days}-day itinerary (LLM response did not contain valid itinerary JSON)`,
    logContext ?? {}
  );
  return createDefaultItinerary(startDate, days);
}

/**
 * Create a default itinerary
 */
function createDefaultItinerary(startDate: string, days: number): ItineraryDay[] {
  const result: ItineraryDay[] = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    result.push({
      dayNumber: i + 1,
      date,
      theme: i === 0 ? "Arrival & Exploration" : i === days - 1 ? "Departure Day" : `Day ${i + 1} Adventures`,
      activities: [
        {
          id: `act_${i}_1`,
          name: "Morning Activity",
          description: "Explore local attractions",
          location: "City Center",
          duration: 180,
          cost: 50,
          currency: "USD",
          category: "sightseeing",
          bookingRequired: false,
        },
      ],
      accommodation: i < days - 1 ? {
        id: `acc_${i}`,
        name: "Recommended Hotel",
        type: "hotel",
        address: "Central Location",
        pricePerNight: 100,
        currency: "USD",
        amenities: ["WiFi", "Breakfast"],
      } : null,
      meals: [
        {
          id: `meal_${i}_1`,
          type: "lunch",
          restaurantName: "Local Restaurant",
          cuisine: "Local",
          location: "Near attractions",
          priceRange: "$$",
          estimatedCost: 25,
        },
      ],
      transportation: [],
      estimatedCost: 200,
    });
  }

  return result;
}

/**
 * Confirm itinerary node - asks user for confirmation
 */
const confirmItineraryNode: TravelNodeFunction = async (state) => {
  const logContext = {
    sessionId: state.sessionId,
    taskId: state.taskId,
    agentType: "travel" as const,
  };

  logger.agentStep("confirmItinerary", "execution", logContext);

  // If user already provided feedback, process it
  if (state.refinementFeedback) {
    const feedback = state.refinementFeedback.toLowerCase();

    if (feedback.includes("good") || feedback.includes("proceed") || feedback.includes("ok")) {
      return {
        awaitingRefinement: false,
        currentPhase: "validation" as const,
      };
    }

    // User wants changes - go back to itinerary generation
    return {
      awaitingRefinement: false,
      currentPhase: "planning" as const,
      gatheredInfo: {
        refinementRequest: state.refinementFeedback,
      },
    };
  }

  // Ask for confirmation
  const itinerarySummary = formatItinerarySummary(state.itinerary || []);

  return {
    awaitingRefinement: true,
    requiresHumanInput: true,
    humanInputRequest: {
      type: "confirmation" as const,
      message: `Here's your travel itinerary:\n\n${itinerarySummary}\n\nWould you like me to proceed with this plan or make any changes?`,
      options: ["Looks great!", "Make changes", "More activities", "Simpler plan"],
      required: true,
    },
  };
};

/**
 * Format itinerary summary for display
 */
function formatItinerarySummary(itinerary: ItineraryDay[]): string {
  if (itinerary.length === 0) {
    return "No itinerary generated yet.";
  }

  const lines: string[] = [];

  for (const day of itinerary) {
    lines.push(`**Day ${day.dayNumber}: ${day.theme}**`);

    if (day.activities.length > 0) {
      lines.push(`  Activities: ${day.activities.map((a) => a.name).join(", ")}`);
    }

    if (day.meals.length > 0) {
      lines.push(`  Dining: ${day.meals.map((m) => m.restaurantName).join(", ")}`);
    }

    lines.push(`  Est. Cost: $${day.estimatedCost}`);
    lines.push("");
  }

  const totalCost = itinerary.reduce((sum, day) => sum + day.estimatedCost, 0);
  lines.push(`**Total Estimated Cost: $${totalCost}**`);

  return lines.join("\n");
}

/**
 * Create the travel planner graph
 */
export function createTravelGraph() {
  const graph = new StateGraph(TravelStateAnnotation)
    // Core nodes
    .addNode("clarification", travelClarificationNode as unknown as TravelNodeFunction)
    .addNode("planning", travelPlanningNode as unknown as TravelNodeFunction)
    .addNode("execution", executionNode as unknown as TravelNodeFunction)
    .addNode("validation", travelValidationNode as unknown as TravelNodeFunction)

    // Travel-specific nodes
    .addNode("researchDestination", researchDestinationNode)
    .addNode("generateItinerary", generateItineraryNode)
    .addNode("confirmItinerary", confirmItineraryNode)

    // Edges
    .addEdge(START, "clarification")

    // Clarification routing
    .addConditionalEdges("clarification", (state: TravelAgentState) => {
      if (state.error) return END;
      if (state.hasSufficientInfo) return "planning";
      if (state.requiresHumanInput) return END;
      return "clarification";
    })

    // Planning routing - go to research flow
    .addConditionalEdges("planning", (state: TravelAgentState) => {
      if (state.error) return END;
      return "researchDestination";
    })

    // Research -> Generate itinerary
    .addConditionalEdges("researchDestination", (state: TravelAgentState) => {
      if (state.error) return END;
      return "generateItinerary";
    })

    // Generate itinerary -> Confirm with user
    .addConditionalEdges("generateItinerary", (state: TravelAgentState) => {
      if (state.error) return END;
      return "confirmItinerary";
    })

    // Confirm itinerary routing
    .addConditionalEdges("confirmItinerary", (state: TravelAgentState) => {
      if (state.error) return END;
      if (state.requiresHumanInput) return END;
      if (state.currentPhase === "planning") return "researchDestination";
      return "validation";
    })

    // Validation routing
    .addConditionalEdges("validation", (state: TravelAgentState) => {
      if (state.error) return END;
      if (state.currentPhase === "complete") return END;
      if (state.requiresHumanInput) return END;
      if (state.currentPhase === "planning") return "planning";
      return END;
    });

  return graph;
}

/**
 * Compile the travel graph with checkpointing
 */
export function compileTravelGraph(checkpointSaver?: MemorySaver) {
  const graph = createTravelGraph();
  const saver = checkpointSaver || new MemorySaver();

  return graph.compile({
    checkpointer: saver,
  });
}

/**
 * Type for compiled travel graph
 */
export type CompiledTravelGraph = ReturnType<typeof compileTravelGraph>;

/**
 * Helper to create initial state and invoke the graph
 */
export async function runTravelGraph(
  graph: CompiledTravelGraph,
  sessionId: string,
  taskId: string,
  initialMessage: string
) {
  const { HumanMessage } = await import("@langchain/core/messages");

  const initialState = {
    ...createInitialTravelState(sessionId, taskId),
    messages: [new HumanMessage(initialMessage)],
  };

  return graph.invoke(initialState, {
    configurable: { thread_id: taskId },
  });
}
