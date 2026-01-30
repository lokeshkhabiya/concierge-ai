import { END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
import {
  MedicineStateAnnotation,
  type MedicineAgentState,
  createInitialMedicineState,
} from "./state";
import {
  medicineClarificationNode,
  medicinePlanningNode,
  executionNode,
  medicineValidationNode,
} from "./nodes";
import { toolRegistry } from "./tools";
import { logger } from "../logger";
import type { PharmacyResult, CallResult } from "../types";

/**
 * Node function type for medicine state
 */
type MedicineNodeFunction = (
  state: MedicineAgentState
) => Promise<Partial<MedicineAgentState>>;

/**
 * Create medicine-specific nodes
 */

/**
 * Try web_search as fallback when geocoding fails or returns no pharmacies.
 * Maps search results to PharmacyResult[] for downstream nodes.
 */
async function searchPharmaciesViaWebSearch(
  state: MedicineAgentState,
  logContext: { sessionId: string; taskId: string; agentType: "medicine" }
): Promise<{ pharmacies: PharmacyResult[]; source: "web_search" } | { error: string }> {
  const webSearchTool = toolRegistry.getTool("web_search");
  if (!webSearchTool) {
    return { error: "Web search tool not found" };
  }

  const medicineName =
    (state.medicineName || state.gatheredInfo.medicineName) as string;
  const location = state.location || state.gatheredInfo.location;
  const address =
    typeof location === "string"
      ? location
      : (location as { address?: string })?.address ||
        (state.gatheredInfo.userAddress as string) ||
        "area";

  const query = `${medicineName} pharmacy near ${address}`;
  logger.info("Geocoding failed or returned no results, trying web_search fallback", {
    ...logContext,
    query,
  });

  try {
    const result = await webSearchTool.invoke({
      query,
      maxResults: 10,
      location: address,
      category: "pharmacy",
    });

    const parsed = JSON.parse(result);
    if (parsed.success === false || parsed.error) {
      return {
        error: (parsed.message ?? parsed.error ?? "Web search failed") as string,
      };
    }

    const data = parsed.data ?? parsed;
    const results = Array.isArray(data?.results) ? data.results : [];
    const pharmacies: PharmacyResult[] = results.map(
      (item: Record<string, unknown>, index: number) => ({
        id: (item.id as string) || `pharmacy_${index + 1}`,
        name: (item.title as string) || "Pharmacy",
        address: (item.description as string) || (item.url as string) || "See search results",
        phone: "+91 XXXXX XXXXX",
        distance: (item.distance as number) ?? 2000,
        availability: "unknown" as const,
        openNow: item.openNow as boolean | undefined,
      })
    );

    logger.info(`Web search fallback found ${pharmacies.length} results`, logContext);
    return { pharmacies, source: "web_search" };
  } catch (err) {
    logger.error("Web search fallback failed", err as Error, logContext);
    return { error: (err as Error).message };
  }
}

/**
 * Search pharmacies node - uses geocoding first, falls back to web_search on failure or 0 results
 */
const searchPharmaciesNode: MedicineNodeFunction = async (state) => {
  const logContext = {
    sessionId: state.sessionId,
    taskId: state.taskId,
    agentType: "medicine" as const,
  };

  logger.agentStep("searchPharmacies", "execution", logContext);

  const geocodingTool = toolRegistry.getTool("geocoding");
  if (!geocodingTool) {
    return { error: "Geocoding tool not found" };
  }

  const location = state.location || state.gatheredInfo.location;
  const address =
    typeof location === "string"
      ? location
      : (location as { address?: string })?.address ||
        (state.gatheredInfo.userAddress as string);

  // Check if location has coordinates (Location object with lat/lng)
  const locationObj = typeof location === "object" && location !== null && "lat" in location && "lng" in location
    ? (location as { lat: number; lng: number })
    : null;

  let pharmacies: PharmacyResult[] = [];
  let gatheredInfo: {
    pharmaciesFound: number;
    geocodingResult?: unknown;
    webSearchFallback?: boolean;
  } = { pharmaciesFound: 0 };

  try {
    // Use coordinates if available for more accurate nearby search, otherwise use address
    const geocodingInput = locationObj
      ? {
          coordinates: { lat: locationObj.lat, lng: locationObj.lng },
          radius: state.searchRadius,
          searchType: "pharmacy" as const,
        }
      : {
          address,
          radius: state.searchRadius,
          searchType: "pharmacy" as const,
        };

    const result = await geocodingTool.invoke(geocodingInput);

    const parsed = JSON.parse(result);
    const data = parsed.data || parsed;
    const success = parsed.success !== false && !parsed.error;

    if (success && Array.isArray(data.nearbyPlaces) && data.nearbyPlaces.length > 0) {
      pharmacies = data.nearbyPlaces.map(
        (place: Record<string, unknown>, index: number) => ({
          id: (place.id as string) || `pharmacy_${index}`,
          name: place.name as string,
          address: place.address as string,
          phone: (place.phone as string) || "+91 98765 43210",
          distance: (place.distance as number) || 1000,
          availability: "unknown" as const,
          openNow: place.openNow as boolean,
        })
      );
      gatheredInfo = {
        pharmaciesFound: pharmacies.length,
        geocodingResult: data.location,
      };
      logger.info(`Found ${pharmacies.length} pharmacies via geocoding`, logContext);
    } else {
      const fallback = await searchPharmaciesViaWebSearch(state, logContext);
      if ("error" in fallback) {
        return { error: fallback.error };
      }
      pharmacies = fallback.pharmacies;
      gatheredInfo = {
        pharmaciesFound: pharmacies.length,
        webSearchFallback: true,
      };
    }
  } catch (error) {
    const fallback = await searchPharmaciesViaWebSearch(state, logContext);
    if ("error" in fallback) {
      logger.error("Search pharmacies failed", error as Error, logContext);
      return { error: (error as Error).message };
    }
    pharmacies = fallback.pharmacies;
    gatheredInfo = {
      pharmaciesFound: pharmacies.length,
      webSearchFallback: true,
    };
  }

  return {
    pharmacies,
    gatheredInfo,
  };
};

/**
 * Call pharmacies node - calls each pharmacy to check availability
 */
const callPharmaciesNode: MedicineNodeFunction = async (state) => {
  const logContext = {
    sessionId: state.sessionId,
    taskId: state.taskId,
    agentType: "medicine" as const,
  };

  logger.agentStep("callPharmacies", "execution", logContext);

  const callTool = toolRegistry.getTool("call_pharmacy");
  if (!callTool) {
    return { error: "Call simulator tool not found" };
  }

  const medicineName =
    state.medicineName || (state.gatheredInfo.medicineName as string);
  const pharmaciesToCall = state.pharmacies.slice(0, 5); // Limit to 5 calls

  const callResults: CallResult[] = [];

  for (const pharmacy of pharmaciesToCall) {
    try {
      const result = await callTool.invoke({
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        phoneNumber: pharmacy.phone,
        medicineName,
        quantity: (state.preferences.quantity as number) || 1,
      });

      const parsed = JSON.parse(result);
      const data = (parsed.data || parsed) as Record<string, unknown>;

      callResults.push({
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        status: data.status as CallResult["status"],
        availability: data.availability as CallResult["availability"],
        price: data.price as number | undefined,
        quantity: data.quantity as number | undefined,
        notes: data.notes as string,
        transcript: data.transcript as string,
        timestamp: new Date(),
      });
    } catch (error) {
      logger.warn(`Call to ${pharmacy.name} failed`, { error }, logContext);
      callResults.push({
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        status: "no_answer",
        availability: "unknown",
        notes: "Call failed",
        timestamp: new Date(),
      });
    }
  }

  // Update pharmacy availability based on call results
  const updatedPharmacies = state.pharmacies.map((pharmacy) => {
    const callResult = callResults.find((c) => c.pharmacyId === pharmacy.id);
    if (callResult) {
      return {
        ...pharmacy,
        availability: callResult.availability,
        price: callResult.price,
      };
    }
    return pharmacy;
  });

  // Find best pharmacy (available with lowest price)
  const availablePharmacies = updatedPharmacies.filter(
    (p) => p.availability === "available"
  );
  const selectedPharmacy =
    availablePharmacies.length > 0
      ? availablePharmacies.sort((a, b) => (a.price || 0) - (b.price || 0))[0]
      : null;

  logger.info(
    `Called ${callResults.length} pharmacies, ${availablePharmacies.length} have stock`,
    logContext
  );

  return {
    pharmacies: updatedPharmacies,
    callResults,
    selectedPharmacy,
    gatheredInfo: {
      callsMade: callResults.length,
      availableCount: availablePharmacies.length,
      pharmacies: updatedPharmacies,
      callResults,
    },
  };
};

/**
 * Create the medicine finder graph
 */
export function createMedicineGraph() {
  const graph = new StateGraph(MedicineStateAnnotation)
    // Core nodes (typed for medicine state)
    .addNode("clarification", medicineClarificationNode as unknown as MedicineNodeFunction)
    .addNode("planning", medicinePlanningNode as unknown as MedicineNodeFunction)
    .addNode("execution", executionNode as unknown as MedicineNodeFunction)
    .addNode("validation", medicineValidationNode as unknown as MedicineNodeFunction)

    // Medicine-specific nodes
    .addNode("searchPharmacies", searchPharmaciesNode)
    .addNode("callPharmacies", callPharmaciesNode)

    // Edges
    .addEdge(START, "clarification")

    // Clarification routing
    .addConditionalEdges("clarification", (state: MedicineAgentState) => {
      if (state.error) return END;
      if (state.hasSufficientInfo) return "planning";
      if (state.requiresHumanInput) return END;
      return "clarification";
    })

    // Planning routing - go to custom pharmacy search flow
    .addConditionalEdges("planning", (state: MedicineAgentState) => {
      if (state.error) return END;
      // Use our custom flow instead of generic execution
      return "searchPharmacies";
    })

    // Search pharmacies -> Call pharmacies
    .addConditionalEdges("searchPharmacies", (state: MedicineAgentState) => {
      if (state.error) return END;
      if (state.pharmacies.length === 0) {
        // No pharmacies found, go to validation with message
        return "validation";
      }
      return "callPharmacies";
    })

    // Call pharmacies -> Validation
    .addEdge("callPharmacies", "validation")

    // Validation routing
    .addConditionalEdges("validation", (state: MedicineAgentState) => {
      if (state.error) return END;
      if (state.currentPhase === "complete") return END;
      if (state.requiresHumanInput) return END;
      if (state.currentPhase === "planning") return "planning";
      return END;
    });

  return graph;
}

/**
 * Compile the medicine graph with checkpointing
 */
export function compileMedicineGraph(checkpointSaver?: MemorySaver) {
  const graph = createMedicineGraph();
  const saver = checkpointSaver || new MemorySaver();

  return graph.compile({
    checkpointer: saver,
  });
}

/**
 * Type for compiled medicine graph
 */
export type CompiledMedicineGraph = ReturnType<typeof compileMedicineGraph>;

/**
 * Helper to create initial state and invoke the graph
 */
export async function runMedicineGraph(
  graph: CompiledMedicineGraph,
  sessionId: string,
  taskId: string,
  initialMessage: string
) {
  const { HumanMessage } = await import("@langchain/core/messages");

  const initialState = {
    ...createInitialMedicineState(sessionId, taskId),
    messages: [new HumanMessage(initialMessage)],
  };

  return graph.invoke(initialState, {
    configurable: { thread_id: taskId },
  });
}
