import { AIMessage } from "@langchain/core/messages";
import { llm } from "../../llm";
import { medicineValidationPrompt } from "../../llm/templates/medicinePlanningPrompt";
import { travelValidationPrompt } from "../../llm/templates/travelPlanningPrompt";
import { finalResponsePrompt } from "../../llm/templates/validationPrompts";
import { logger } from "../../logger";
import type { BaseAgentState } from "../state";
import type { AgentPhase, IntentType } from "../../types";

/**
 * Result from validation node
 */
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

/**
 * Create a validation node for a specific task type
 */
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
      // Check execution results
      const { executionPlan, gatheredInfo } = state;

      // Validate the results
      const validationResponse = await llm.invoke(
        await validationPrompt.formatMessages({
          executionPlan: JSON.stringify(executionPlan, null, 2),
          gatheredInfo: JSON.stringify(gatheredInfo, null, 2),
        })
      );

      const validationContent = validationResponse.content as string;

      logger.debug("Validation response", { validationContent }, logContext);

      const trimmed = validationContent.trim();
      const upper = trimmed.toUpperCase();

      // Require explicit NEEDS_REFINEMENT at the start (so prose like "can be marked VALID" doesn't trigger refinement)
      if (upper.startsWith("NEEDS_REFINEMENT")) {
        const reasonMatch = trimmed.match(/NEEDS_REFINEMENT\s*:\s*(.+)/is);
        const reason = reasonMatch?.[1]?.trim() ?? "Results need improvement";

        logger.info(`Validation needs refinement: ${reason}`, logContext);

        // For travel, we might want user input for refinement
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

        // For medicine, try planning again with more info
        return {
          currentPhase: "planning",
          messages: [new AIMessage(`Refining results... ${reason}`)],
        };
      }

      // Require explicit VALID at the start (so prose like "the result can be marked VALID" doesn't pass)
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

      // Default: generate response even if validation is ambiguous
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

/**
 * Generate final response for user
 */
async function generateFinalResponse(
  taskType: string,
  state: BaseAgentState,
  _validationContext: string
): Promise<string> {
  try {
    // Build results object from execution plan
    const results = buildResultsFromPlan(state);

    // Get original request from first message
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

    // Fallback response
    return taskType === "medicine"
      ? formatMedicineResults(state)
      : formatTravelResults(state);
  }
}

/**
 * Build results object from execution plan
 */
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

/**
 * Fallback: Format medicine results
 */
function formatMedicineResults(state: BaseAgentState): string {
  const { gatheredInfo, executionPlan } = state;
  const medicineName = gatheredInfo.medicineName || "the medicine";

  const lines: string[] = [
    `## Medicine Search Results`,
    "",
    `I searched for **${medicineName}** near your location.`,
    "",
  ];

  // Extract pharmacy results from execution plan
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

/**
 * Fallback: Format travel results
 */
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

/**
 * Medicine-specific validation node
 */
export const medicineValidationNode = createValidationNode("medicine");

/**
 * Travel-specific validation node
 */
export const travelValidationNode = createValidationNode("travel");
