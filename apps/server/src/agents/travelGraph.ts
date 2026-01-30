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
import { createLlm } from "../llm";
import {
	travelItineraryGenerationPrompt,
	travelRefinementPrompt,
} from "../llm/templates/travelPlanningPrompt";

const itineraryLlm = createLlm({
	temperature: 1,
	maxTokens: 8192,
	timeout: 120000, // 2 minute timeout
});
import { logger, type LogContext } from "../logger";
import type { ItineraryDay, RichTravelPlan, QuickLogistics, BudgetSnapshot, TransportInfo, AccommodationStrategy, BookingAdvice } from "../types";

type TravelNodeFunction = (
	state: TravelAgentState
) => Promise<Partial<TravelAgentState>>;

const travelClarificationWrapper: TravelNodeFunction = async (state) => {
	const logContext = {
		sessionId: state.sessionId,
		taskId: state.taskId,
		agentType: "travel" as const,
	};

	if (state.skipToConfirmation && state.refinementFeedback) {
		logger.info("Skipping clarification - resuming to confirmItinerary", logContext);
		return {
			skipToConfirmation: true,
			hasSufficientInfo: true,
		};
	}

	return travelClarificationNode(state);
};

const MAX_DESCRIPTION_CHARS = 500;

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
		const numberOfTravelers = state.numberOfTravelers || 1;

		const trimmedResearch = trimResearchResultsForPrompt(
			state.researchResults ?? {}
		);

		const researchJson = JSON.stringify(trimmedResearch, null, 2);
		const truncatedResearch = researchJson.length > 8000
			? researchJson.slice(0, 8000) + "...(truncated)"
			: researchJson;

		logger.debug("Invoking LLM for itinerary generation", {
			...logContext,
			destination,
			startDate,
			endDate,
			researchResultsLength: researchJson.length,
			truncated: researchJson.length > 8000,
		});

		const messages = await travelItineraryGenerationPrompt.formatMessages({
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
			researchResults: truncatedResearch,
			numberOfTravelers: numberOfTravelers.toString(),
		});

		logger.debug("Formatted prompt, calling LLM...", {
			...logContext,
			messageCount: messages.length,
		});

		const response = await itineraryLlm.invoke(messages);

		const content = response.content as string;

		logger.debug("LLM response received", {
			...logContext,
			contentLength: content?.length || 0,
			contentPreview: content?.slice(0, 200) || "(empty)",
		});

		const tripDays = getTripDuration(state) || 2;
		const { itinerary, richPlan } = parseRichTravelPlan(
			content,
			startDate,
			tripDays,
			destination,
			logContext
		);

		logger.info(`Generated ${itinerary.length}-day itinerary${richPlan ? ' with rich plan' : ''}`, logContext);

		return {
			itinerary,
			richPlan,
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

function repairTruncatedJson(raw: string): string {
	const stack: string[] = [];
	let inString = false;
	let escape = false;
	let quote: string | null = null;
	for (let i = 0; i < raw.length; i++) {
		const c = raw[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (c === "\\" && inString) {
			escape = true;
			continue;
		}
		if (!inString) {
			if (c === '"' || c === "'") {
				inString = true;
				quote = c;
				continue;
			}
			if (c === "{") stack.push("}");
			else if (c === "[") stack.push("]");
			else if (c === "}" || c === "]") stack.pop();
			continue;
		}
		if (c === quote) inString = false;
	}
	let out = raw.trimEnd();
	const last = out.slice(-1);
	if (last === ",") out = out.slice(0, -1);
	while (stack.length > 0) {
		out += stack.pop();
	}
	return out;
}

function extractOutermostJson(content: string): string | null {
	const start = content.indexOf("{");
	if (start === -1) return null;
	let depth = 0;
	for (let i = start; i < content.length; i++) {
		const c = content[i];
		if (c === "{") depth++;
		else if (c === "}") {
			depth--;
			if (depth === 0) return content.slice(start, i + 1);
		}
	}
	return content.slice(start);
}

function parseRichTravelPlan(
	content: string,
	startDate: string,
	fallbackDays: number = 3,
	destination: string,
	logContext?: LogContext
): { itinerary: ItineraryDay[]; richPlan: RichTravelPlan | null } {
	let parsed: Record<string, unknown> | null = null;
	const trimmed = content.trim();

	try {
		parsed = JSON.parse(trimmed);
	} catch {
		parsed = null;
	}

	if (!parsed) {
		const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (codeBlockMatch && codeBlockMatch[1]) {
			const blockContent = codeBlockMatch[1].trim();
			try {
				parsed = JSON.parse(blockContent);
			} catch {
				try {
					parsed = JSON.parse(repairTruncatedJson(blockContent));
				} catch {
					const outer = extractOutermostJson(blockContent);
					if (outer) {
						try {
							parsed = JSON.parse(repairTruncatedJson(outer));
						} catch {
						}
					}
				}
			}
		}
	}

	if (!parsed) {
		const outer = extractOutermostJson(trimmed);
		if (outer) {
			try {
				parsed = JSON.parse(outer);
			} catch {
				try {
					parsed = JSON.parse(repairTruncatedJson(outer));
				} catch (parseError) {
					logger.warn("Failed to parse extracted JSON from LLM response", {
						error: parseError,
						contentPreview: trimmed.substring(0, 500),
						logContext,
					});
				}
			}
		}
	}

	if (!parsed) {
		logger.warn("Could not extract JSON from LLM response", {
			contentLength: content.length,
			contentPreview: content.substring(0, 500),
			logContext,
		});
	}

	if (parsed) {
		try {
			const days = parsed.itinerary || [];

			if (Array.isArray(days) && days.length > 0) {
				const itinerary = days.map((day: Record<string, unknown>, index: number) => {
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
						weatherConsiderations: (day.weatherConsiderations as string) || undefined,
					};
				}) as ItineraryDay[];

				const richPlan: RichTravelPlan = {
					quickLogistics: (parsed.quickLogistics as QuickLogistics) || createDefaultLogistics(destination, startDate),
					accommodation: (parsed.accommodation as AccommodationStrategy) || { areaStrategy: "", recommendations: [] },
					itinerary,
					transportAndFlights: (parsed.transportAndFlights as TransportInfo) || createDefaultTransport(),
					budgetSnapshot: (parsed.budgetSnapshot as BudgetSnapshot) || createDefaultBudget(fallbackDays),
					bookingAdvice: (parsed.bookingAdvice as BookingAdvice) || { bookNow: [], bookSoon: [], bookOnArrival: [] },
					tips: (parsed.tips as string[]) || [],
					packingList: (parsed.packingList as string[]) || [],
				};

				logger.info(`Successfully parsed rich travel plan with ${itinerary.length} days`, logContext ?? {});
				return { itinerary, richPlan };
			} else {
				logger.warn("Parsed JSON but itinerary array is empty or invalid", {
					hasItinerary: !!parsed.itinerary,
					itineraryType: typeof parsed.itinerary,
					logContext,
				});
			}
		} catch (error) {
			logger.warn("Failed to process parsed JSON", {
				error,
				parsedKeys: parsed ? Object.keys(parsed) : [],
				logContext,
			});
		}
	}

	// Fallback with destination-aware defaults
	const days = fallbackDays > 0 ? fallbackDays : 3;
	logger.warn(
		`Using destination-aware fallback for ${destination} (${days} days)`,
		logContext ?? {}
	);
	return {
		itinerary: createDestinationAwareItinerary(destination, startDate, days),
		richPlan: null,
	};
}

/**
 * Create default logistics when not provided by LLM
 */
function createDefaultLogistics(destination: string, startDate: string): QuickLogistics {
	return {
		dates: startDate,
		weather: `Check current weather forecast for ${destination}`,
		visaInfo: `Check visa requirements for ${destination} based on your nationality`,
		currency: `Research local currency and payment methods for ${destination}`,
		mustHaves: ["Travel insurance", "Passport with 6+ months validity", "Return ticket"],
	};
}

/**
 * Create default transport info when not provided by LLM
 */
function createDefaultTransport(): TransportInfo {
	return {
		gettingThere: "Research flight options from your departure city",
		gettingAround: "Use ride-hailing apps (Grab, Uber) or local taxis",
		airportTransfer: "Arrange airport transfer through your hotel or use ride-hailing apps",
	};
}

/**
 * Create default budget snapshot when not provided by LLM
 */
function createDefaultBudget(days: number): BudgetSnapshot {
	return {
		perPersonPerDay: {
			backpacker: { total: 50, breakdown: { accommodation: 20, food: 15, activities: 10, transport: 5 } },
			midRange: { total: 120, breakdown: { accommodation: 60, food: 30, activities: 20, transport: 10 } },
			comfortable: { total: 250, breakdown: { accommodation: 130, food: 60, activities: 40, transport: 20 } },
		},
		currency: "USD",
		totalTripEstimate: {
			backpacker: 50 * days,
			midRange: 120 * days,
			comfortable: 250 * days,
		},
	};
}

/**
 * Create a destination-aware itinerary when LLM parsing fails
 * This provides structure while acknowledging detailed recommendations couldn't be generated
 */
function createDestinationAwareItinerary(
	destination: string,
	startDate: string,
	days: number
): ItineraryDay[] {
	const result: ItineraryDay[] = [];

	for (let i = 0; i < days; i++) {
		const date = new Date(startDate);
		date.setDate(date.getDate() + i);

		const theme = i === 0
			? `Arrival in ${destination}`
			: i === days - 1
				? `Departure from ${destination}`
				: `Exploring ${destination} - Day ${i + 1}`;

		result.push({
			dayNumber: i + 1,
			date,
			theme,
			activities: [
				{
					id: `act_${i}_1`,
					name: `Discover ${destination}`,
					description: `Explore the unique attractions and experiences that ${destination} has to offer. For specific recommendations, please try again or provide more details about your interests.`,
					location: destination,
					duration: 240,
					cost: 50,
					currency: "USD",
					category: "sightseeing",
					bookingRequired: false,
					tips: [
						`Research top attractions in ${destination} before your visit`,
						"Ask your hotel concierge for local recommendations",
					],
				},
			],
			accommodation: i < days - 1 ? {
				id: `acc_${i}`,
				name: `Accommodation in ${destination}`,
				type: "hotel",
				address: `Central ${destination}`,
				pricePerNight: 80,
				currency: "USD",
				amenities: ["WiFi", "Air Conditioning"],
			} : null,
			meals: [
				{
					id: `meal_${i}_1`,
					type: "lunch",
					restaurantName: `Local cuisine in ${destination}`,
					cuisine: "Local",
					location: destination,
					priceRange: "$$",
					estimatedCost: 20,
					mustTry: ["Ask locals for signature dishes"],
				},
				{
					id: `meal_${i}_2`,
					type: "dinner",
					restaurantName: `Evening dining in ${destination}`,
					cuisine: "Local/International",
					location: destination,
					priceRange: "$$",
					estimatedCost: 30,
				},
			],
			transportation: [],
			estimatedCost: 150,
			notes: [
				`This is a basic itinerary structure for ${destination}.`,
				"For detailed, specific recommendations, please try generating the itinerary again.",
			],
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

	// Debug logging
	logger.debug("ConfirmItinerary node executing", {
		...logContext,
		inputPhase: state.currentPhase,
		refinementFeedback: state.refinementFeedback,
		awaitingRefinement: state.awaitingRefinement,
		skipToConfirmation: state.skipToConfirmation,
	});

	if (state.refinementFeedback) {
		const feedback = state.refinementFeedback.toLowerCase();

		if (
			feedback.includes("yes") ||
			feedback.includes("good") ||
			feedback.includes("proceed") ||
			feedback.includes("ok") ||
			feedback.includes("looks great") ||
			feedback.includes("perfect")
		) {
			const itinerarySummary = formatRichTravelPlanSummary(state.richPlan, state.itinerary || []);

			const result = {
				awaitingRefinement: false,
				refinementFeedback: null,
				skipToConfirmation: false,
				requiresHumanInput: false,
				currentPhase: "complete" as const,
				finalResponse: `Great! Your trip is confirmed.\n\n${itinerarySummary}\n\nHave a wonderful trip! 🌴`,
			};

			logger.info("Itinerary confirmed by user, marking complete", logContext);
			logger.debug("ConfirmItinerary node output", {
				...logContext,
				outputPhase: result.currentPhase,
				requiresInput: false,
				decision: "approved",
			});

			return result;
		}

		const result = {
			awaitingRefinement: false,
			refinementFeedback: state.refinementFeedback,
			skipToConfirmation: false,
			currentPhase: "execution" as const,
			gatheredInfo: {
				...state.gatheredInfo,
				refinementRequest: state.refinementFeedback,
			},
		};

		logger.debug("ConfirmItinerary node output", {
			...logContext,
			outputPhase: result.currentPhase,
			requiresInput: false,
			decision: "changes",
		});

		return result;
	}

	const itinerarySummary = formatRichTravelPlanSummary(state.richPlan, state.itinerary || []);

	const result = {
		awaitingRefinement: true,
		currentPhase: "planning" as const,
		requiresHumanInput: true,
		humanInputRequest: {
			type: "confirmation" as const,
			message: `Here's your travel itinerary:\n\n${itinerarySummary}\n\nWould you like me to proceed with this plan or make any changes?`,
			options: ["Looks great!", "Make changes", "More activities", "Simpler plan"],
			required: true,
		},
	};

	logger.debug("ConfirmItinerary node output", {
		...logContext,
		outputPhase: result.currentPhase,
		requiresInput: result.requiresHumanInput,
		decision: "awaiting",
	});

	return result;
};

function formatRichTravelPlanSummary(
	richPlan: RichTravelPlan | null,
	itinerary: ItineraryDay[]
): string {
	if (!richPlan && itinerary.length === 0) {
		return "No itinerary generated yet.";
	}

	const lines: string[] = [];

	if (richPlan?.quickLogistics) {
		const ql = richPlan.quickLogistics;
		lines.push("## Quick Logistics");
		lines.push(`- **Dates**: ${ql.dates}`);
		lines.push(`- **Weather**: ${ql.weather}`);
		lines.push(`- **Visa**: ${ql.visaInfo}`);
		lines.push(`- **Currency**: ${ql.currency}`);
		if (ql.mustHaves?.length) {
			lines.push(`- **Must-haves**: ${ql.mustHaves.join(", ")}`);
		}
		lines.push("");
	}

	if (richPlan?.accommodation?.areaStrategy) {
		lines.push("## Where to Stay");
		lines.push(richPlan.accommodation.areaStrategy);
		lines.push("");
		for (const rec of richPlan.accommodation.recommendations || []) {
			const budget = rec.nightlyBudget;
			lines.push(`- **${rec.area}**: ${rec.whyStayHere}`);
			lines.push(`  Budget: ~$${budget.budget}/night | Mid-range: ~$${budget.midRange}/night | Luxury: ~$${budget.luxury}/night`);
			if (rec.specificPlaces?.length) {
				lines.push(`  Try: ${rec.specificPlaces.slice(0, 3).join(", ")}`);
			}
		}
		lines.push("");
	}

	lines.push("## Day-by-Day Itinerary");
	lines.push("");

	for (const day of itinerary) {
		lines.push(`### Day ${day.dayNumber}: ${day.theme}`);

		if (day.activities.length > 0) {
			for (const act of day.activities) {
				const actWithTime = act as typeof act & { startTime?: string };
				const time = actWithTime.startTime ? `${actWithTime.startTime} - ` : "";
				lines.push(`- ${time}**${act.name}** @ ${act.location}`);
				if (act.description && act.description.length < 150) {
					lines.push(`  ${act.description}`);
				}
				if (act.tips?.length) {
					lines.push(`  _Tip: ${act.tips[0]}_`);
				}
			}
		}

		if (day.meals.length > 0) {
			const mealsList = day.meals
				.map((m) => `${m.type}: ${m.restaurantName}`)
				.join(" | ");
			lines.push(`- **Meals**: ${mealsList}`);
		}

		const dayWithWeather = day as typeof day & { weatherConsiderations?: string };
		if (dayWithWeather.weatherConsiderations) {
			lines.push(`- _Weather: ${dayWithWeather.weatherConsiderations}_`);
		}

		lines.push(`- **Daily cost**: ~$${day.estimatedCost}`);
		lines.push("");
	}

	if (richPlan?.budgetSnapshot) {
		const bs = richPlan.budgetSnapshot;
		lines.push("## Budget Snapshot (per person/day)");
		lines.push(`- **Backpacker**: ~$${bs.perPersonPerDay.backpacker.total}/day`);
		lines.push(`- **Mid-range**: ~$${bs.perPersonPerDay.midRange.total}/day`);
		lines.push(`- **Comfortable**: ~$${bs.perPersonPerDay.comfortable.total}/day`);
		lines.push("");
		lines.push(`**Total trip estimate**: $${bs.totalTripEstimate.backpacker} - $${bs.totalTripEstimate.comfortable}`);
		lines.push("");
	}

	if (richPlan?.transportAndFlights) {
		const tf = richPlan.transportAndFlights;
		lines.push("## Getting There & Around");
		if (tf.gettingThere) lines.push(`- **Flights**: ${tf.gettingThere}`);
		if (tf.gettingAround) lines.push(`- **Local transport**: ${tf.gettingAround}`);
		if (tf.airportTransfer) lines.push(`- **Airport transfer**: ${tf.airportTransfer}`);
		lines.push("");
	}

	if (richPlan?.bookingAdvice) {
		const ba = richPlan.bookingAdvice;
		lines.push("## What to Book");
		if (ba.bookNow?.length) lines.push(`- **Book now**: ${ba.bookNow.join(", ")}`);
		if (ba.bookSoon?.length) lines.push(`- **Book soon**: ${ba.bookSoon.join(", ")}`);
		if (ba.bookOnArrival?.length) lines.push(`- **Book on arrival**: ${ba.bookOnArrival.join(", ")}`);
		lines.push("");
	}

	if (richPlan?.tips?.length) {
		lines.push("## Pro Tips");
		for (const tip of richPlan.tips.slice(0, 5)) {
			lines.push(`- ${tip}`);
		}
		lines.push("");
	}

	if (richPlan?.packingList?.length) {
		lines.push("## Packing Essentials");
		lines.push(richPlan.packingList.slice(0, 8).join(", "));
		lines.push("");
	}

	if (!richPlan) {
		const totalCost = itinerary.reduce((sum, day) => sum + day.estimatedCost, 0);
		lines.push(`**Total Estimated Cost: $${totalCost}**`);
	}

	return lines.join("\n");
}

const adjustItineraryNode: TravelNodeFunction = async (state) => {
	const logContext = {
		sessionId: state.sessionId,
		taskId: state.taskId,
		agentType: "travel" as const,
	};

	logger.agentStep("adjustItinerary", "execution", logContext);

	try {
		const feedback =
			state.refinementFeedback ||
			(state.gatheredInfo.refinementRequest as string) ||
			"";

		const currentItinerary = state.itinerary || [];
		const startDate =
			state.startDate?.toString() ||
			(state.gatheredInfo.startDate as string) ||
			new Date().toISOString();

		const preferences = {
			destination:
				state.destination || (state.gatheredInfo.destination as string),
			startDate:
				state.startDate?.toString() ||
				(state.gatheredInfo.startDate as string) ||
				null,
			endDate:
				state.endDate?.toString() ||
				(state.gatheredInfo.endDate as string) ||
				null,
			budget: state.budget ?? {
				min: state.gatheredInfo.budgetMin,
				max: state.gatheredInfo.budgetMax,
				currency: state.gatheredInfo.currency,
			},
			travelStyle:
				state.preferences.travelStyle.length > 0
					? state.preferences.travelStyle
					: ((state.gatheredInfo.travelStyle as string[]) || []),
			interests:
				state.preferences.interests.length > 0
					? state.preferences.interests
					: ((state.gatheredInfo.interests as string[]) || []),
		};
		const currentRichPlan = state.richPlan;
		const refinementContext = currentRichPlan
			? JSON.stringify({ ...currentRichPlan, itinerary: currentItinerary }, null, 2)
			: JSON.stringify(currentItinerary ?? [], null, 2);

		const response = await itineraryLlm.invoke(
			await travelRefinementPrompt.formatMessages({
				currentItinerary: refinementContext,
				feedback,
				preferences: JSON.stringify(preferences, null, 2),
			})
		);

		const content = response.content as string;
		const tripDays =
			getTripDuration(state) ||
			(Array.isArray(currentItinerary) ? currentItinerary.length : 0) ||
			3;
		const destination =
			state.destination || (state.gatheredInfo.destination as string) || "destination";

		const { itinerary, richPlan } = parseRichTravelPlan(
			content,
			startDate,
			tripDays,
			destination,
			logContext
		);

		logger.info(
			`Adjusted itinerary with ${itinerary.length}-day plan`,
			logContext
		);

		return {
			itinerary,
			richPlan: richPlan || state.richPlan,
			refinementFeedback: null,
			skipToConfirmation: false,
			awaitingRefinement: false,
			gatheredInfo: {
				...state.gatheredInfo,
				refinementRequest: feedback,
				itineraryDays: itinerary.length,
				totalEstimatedCost: itinerary.reduce(
					(sum, day) => sum + day.estimatedCost,
					0
				),
			},
		};
	} catch (error) {
		logger.error("Adjust itinerary failed", error as Error, logContext);
		return { error: (error as Error).message };
	}
};

export function createTravelGraph() {
	const graph = new StateGraph(TravelStateAnnotation)
		// Core nodes
		.addNode("clarification", travelClarificationWrapper as unknown as TravelNodeFunction)
		.addNode("planning", travelPlanningNode as unknown as TravelNodeFunction)
		.addNode("execution", executionNode as unknown as TravelNodeFunction)
		.addNode("validation", travelValidationNode as unknown as TravelNodeFunction)

		// Travel-specific nodes
		.addNode("generateItinerary", generateItineraryNode)
		.addNode("confirmItinerary", confirmItineraryNode)
		.addNode("adjustItinerary", adjustItineraryNode)

		// Edges
		.addEdge(START, "clarification")

		.addConditionalEdges("clarification", (state: TravelAgentState) => {
			if (state.error) return END;

			if (state.skipToConfirmation && state.refinementFeedback) {
				return "confirmItinerary";
			}

			if (state.hasSufficientInfo) return "planning";
			if (state.requiresHumanInput) return END;
			return "clarification";
		})

		.addConditionalEdges("planning", (state: TravelAgentState) => {
			if (state.error) return END;
			return "execution";
		})

		.addConditionalEdges("execution", (state: TravelAgentState) => {
			if (state.error) return END;

			const { executionPlan, currentStepIndex } = state;

			if (!executionPlan || currentStepIndex >= (executionPlan?.length || 0)) {
				return "generateItinerary";
			}

			return "execution";
		})

		.addConditionalEdges("generateItinerary", (state: TravelAgentState) => {
			if (state.error) return END;
			return "confirmItinerary";
		})

		.addConditionalEdges("confirmItinerary", (state: TravelAgentState) => {
			if (state.error) return END;

			if (
				state.currentPhase === "execution" &&
				(state.gatheredInfo?.refinementRequest || state.refinementFeedback)
			) {
				return "adjustItinerary";
			}

			if (state.requiresHumanInput) return END;

			if (state.currentPhase === "complete") {
				return END;
			}

			if (state.currentPhase === "planning") {
				return "planning";
			}

			if (state.currentPhase === "validation") {
				return "validation";
			}

			return END;
		})

		.addConditionalEdges("adjustItinerary", (state: TravelAgentState) => {
			if (state.error) return END;
			return "confirmItinerary";
		})

		.addConditionalEdges("validation", (state: TravelAgentState) => {
			if (state.error) return END;
			if (state.currentPhase === "complete") return END;
			if (state.requiresHumanInput) return END;
			if (state.currentPhase === "planning") return "planning";
			return END;
		});

	return graph;
}

export function compileTravelGraph(checkpointSaver?: MemorySaver) {
	const graph = createTravelGraph();
	const saver = checkpointSaver || new MemorySaver();

	return graph.compile({
		checkpointer: saver,
	});
}

export type CompiledTravelGraph = ReturnType<typeof compileTravelGraph>;

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
