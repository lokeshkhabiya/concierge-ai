import { AIMessage } from "@langchain/core/messages";
import { llm } from "../../llm";
import { medicineValidationPrompt } from "../../llm/templates/medicinePlanningPrompt";
import { travelValidationPrompt } from "../../llm/templates/travelPlanningPrompt";
import { finalResponsePrompt } from "../../llm/templates/validationPrompts";
import { logger } from "../../logger";
import type { BaseAgentState } from "../state";
import type { AgentPhase, IntentType } from "../../types";

const MAX_VALIDATION_JSON_CHARS = 200_000;

interface ValidationResult {
	currentPhase?: AgentPhase;
	finalResponse?: string;
	messages?: AIMessage[];
	requiresHumanInput?: boolean;
	humanInputRequest?: {
		type: "confirmation";
		message: string;
		options: string[];
		required: boolean;
	} | null;
	error?: string;
}

export function createValidationNode(taskType: Exclude<IntentType, "unknown">) {
	const validationPrompt =
		taskType === "medicine" ? medicineValidationPrompt : travelValidationPrompt;

	return async (state: BaseAgentState): Promise<ValidationResult> => {
		const logContext = {
			sessionId: state.sessionId,
			taskId: state.taskId,
			agentType: taskType,
		};

		logger.agentStep("validation", "validation", logContext);

		try {
			const { executionPlan, gatheredInfo } = state;

			const isTravel = taskType === "travel";
			const primaryPayload = isTravel
				? JSON.stringify(
					(state as unknown as { itinerary?: unknown }).itinerary ?? [],
					null,
					2
				)
				: JSON.stringify(executionPlan, null, 2);
			const gatheredJson = JSON.stringify(gatheredInfo, null, 2);
			const totalChars = primaryPayload.length + gatheredJson.length;

			if (totalChars > MAX_VALIDATION_JSON_CHARS) {
				logger.warn("Skipping LLM validation – payload too large", {
					...logContext,
					totalChars,
					maxChars: MAX_VALIDATION_JSON_CHARS,
				});

				const finalResponse = await generateFinalResponse(taskType, state, "");

				return {
					currentPhase: "complete",
					finalResponse,
					messages: [new AIMessage(finalResponse)],
					requiresHumanInput: false,
					humanInputRequest: null,
				};
			}

			const validationResponse = await llm.invoke(
				await validationPrompt.formatMessages(
					isTravel
						? {
							itinerary: primaryPayload,
							gatheredInfo: gatheredJson,
						}
						: {
							executionPlan: primaryPayload,
							gatheredInfo: gatheredJson,
						}
				)
			);

			const validationContent = validationResponse.content as string;

			logger.debug("Validation response", { validationContent }, logContext);

			const trimmed = validationContent.trim();
			const upper = trimmed.toUpperCase();

			if (upper.startsWith("NEEDS_REFINEMENT")) {
				const reasonMatch = trimmed.match(/NEEDS_REFINEMENT\s*:\s*(.+)/is);
				const reason = reasonMatch?.[1]?.trim() ?? "Results need improvement";

				logger.info(`Validation needs refinement: ${reason}`, logContext);

				if (taskType === "travel") {
					return {
						currentPhase: "clarification",
						messages: [
							new AIMessage(
								`I've created an initial plan. ${reason}\n\nWould you like me to adjust anything?`
							),
						],
						requiresHumanInput: true,
						humanInputRequest: {
							type: "confirmation",
							message: `Here's what I've planned so far. ${reason}\n\nWould you like to proceed or make changes?`,
							options: ["Looks good!", "Make changes", "Start over"],
							required: true,
						},
					};
				}

				return {
					currentPhase: "planning",
					messages: [new AIMessage(`Refining results... ${reason}`)],
				};
			}

			if (upper.startsWith("VALID")) {
				const finalResponse = await generateFinalResponse(
					taskType,
					state,
					validationContent
				);

				logger.info("Validation passed, task complete", logContext);

				return {
					currentPhase: "complete",
					finalResponse,
					messages: [new AIMessage(finalResponse)],
					requiresHumanInput: false,
					humanInputRequest: null,
				};
			}

			const finalResponse = await generateFinalResponse(taskType, state, "");

			return {
				currentPhase: "complete",
				finalResponse,
				messages: [new AIMessage(finalResponse)],
			};
		} catch (error) {
			logger.error("Validation failed", error as Error, logContext);

			return {
				error: (error as Error).message,
				currentPhase: "error",
			};
		}
	};
}

async function generateFinalResponse(
	taskType: string,
	state: BaseAgentState,
	_validationContext: string
): Promise<string> {
	try {
		const results = buildResultsFromPlan(state);

		const firstMessage = state.messages.find((m) => m._getType() === "human");
		const originalRequest = firstMessage
			? (firstMessage.content as string)
			: "User request";

		const response = await llm.invoke(
			await finalResponsePrompt.formatMessages({
				taskType,
				results: JSON.stringify(results, null, 2),
				originalRequest,
			})
		);

		return response.content as string;
	} catch (error) {
		logger.warn("Failed to generate final response", { error });

		return taskType === "medicine"
			? formatMedicineResults(state)
			: formatTravelResults(state);
	}
}

function buildResultsFromPlan(state: BaseAgentState): Record<string, unknown> {
	const { executionPlan, gatheredInfo } = state;

	const completedSteps =
		executionPlan?.filter((s) => s.status === "completed") || [];
	const stepResults = completedSteps.map((s) => ({
		name: s.name,
		result: s.result,
	}));

	return {
		gatheredInfo,
		executionResults: stepResults,
		completedSteps: completedSteps.length,
		totalSteps: executionPlan?.length || 0,
	};
}

function formatMedicineResults(state: BaseAgentState): string {
	const { gatheredInfo, executionPlan } = state;
	const medicineName = gatheredInfo.medicineName || "the medicine";

	const lines: string[] = [
		`## Medicine Search Results`,
		"",
		`I searched for **${medicineName}** near your location.`,
		"",
	];

	const callResults = executionPlan
		?.filter((s) => s.toolName === "call_pharmacy" && s.result)
		.map((s) => s.result as Record<string, unknown>) || [];

	if (callResults.length > 0) {
		const available = callResults.filter(
			(r) => (r.data as Record<string, unknown>)?.availability === "available"
		);
		const unavailable = callResults.filter(
			(r) => (r.data as Record<string, unknown>)?.availability === "unavailable"
		);

		if (available.length > 0) {
			lines.push("### Available at:");
			available.forEach((r) => {
				const data = r.data as Record<string, unknown>;
				lines.push(`- **${data.pharmacyName}** - ₹${data.price || "N/A"}`);
			});
			lines.push("");
		}

		if (unavailable.length > 0) {
			lines.push("### Not available at:");
			unavailable.forEach((r) => {
				const data = r.data as Record<string, unknown>;
				lines.push(`- ${data.pharmacyName}`);
			});
			lines.push("");
		}
	}

	lines.push(
		"",
		"---",
		"*Note: These are simulated results. Please confirm availability directly with the pharmacy.*"
	);

	return lines.join("\n");
}

function formatTravelResults(state: BaseAgentState): string {
	const { gatheredInfo } = state;
	const destination = gatheredInfo.destination || "your destination";

	const lines: string[] = [
		`## Your Trip to ${destination}`,
		"",
		"I've created a travel itinerary based on your preferences.",
		"",
	];

	if (gatheredInfo.startDate && gatheredInfo.endDate) {
		lines.push(`**Dates:** ${gatheredInfo.startDate} to ${gatheredInfo.endDate}`);
		lines.push("");
	}

	if (gatheredInfo.budget) {
		lines.push(`**Budget:** ${gatheredInfo.budgetMin} - ${gatheredInfo.budgetMax} ${gatheredInfo.currency || "USD"}`);
		lines.push("");
	}

	lines.push(
		"The detailed itinerary includes activities, dining recommendations, and practical tips.",
		"",
		"---",
		"*Note: This is a simulated itinerary. Please verify and book directly with providers.*"
	);

	return lines.join("\n");
}

export const medicineValidationNode = createValidationNode("medicine");

export const travelValidationNode = createValidationNode("travel");
