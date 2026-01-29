import { AIMessage } from "@langchain/core/messages";
import { toolRegistry } from "../tools";
import { logger } from "../../logger";
import type { BaseAgentState } from "../state";
import type { AgentPhase, ExecutionStep } from "../../types";

/**
 * Result from execution node
 */
interface ExecutionResult {
  currentPhase?: AgentPhase;
  executionPlan?: ExecutionStep[];
  currentStepIndex?: number;
  messages?: AIMessage[];
  error?: string;
  gatheredInfo?: Record<string, unknown>;
}

/**
 * Create an execution node that runs tools from the plan
 */
export function createExecutionNode() {
  return async (state: BaseAgentState): Promise<ExecutionResult> => {
    const logContext = {
      sessionId: state.sessionId,
      taskId: state.taskId,
    };

    const { executionPlan, currentStepIndex } = state;

    // Check if we have a plan to execute
    if (!executionPlan || executionPlan.length === 0) {
      logger.warn("No execution plan to execute", logContext);
      return {
        currentPhase: "validation",
      };
    }

    // Check if all steps are done
    if (currentStepIndex >= executionPlan.length) {
      logger.info("All execution steps completed", logContext);
      return {
        currentPhase: "validation",
      };
    }

    const currentStep = executionPlan[currentStepIndex];
    if (!currentStep) {
      logger.warn("Current step not found", logContext);
      return {
        currentPhase: "validation",
      };
    }

    logger.agentStep(
      `execution: ${currentStep.name}`,
      "execution",
      { ...logContext, node: currentStep.toolName }
    );

    // Get the tool
    const tool = toolRegistry.getTool(currentStep.toolName);

    if (!tool) {
      logger.warn(`Tool not found: ${currentStep.toolName}`, logContext);

      // Mark step as failed and move to next
      const updatedPlan = updateStepStatus(
        executionPlan,
        currentStepIndex,
        "failed",
        { error: `Tool not found: ${currentStep.toolName}` }
      );

      return {
        executionPlan: updatedPlan,
        currentStepIndex: currentStepIndex + 1,
      };
    }

    try {
      // Mark step as in progress
      const inProgressPlan = updateStepStatus(
        executionPlan,
        currentStepIndex,
        "in_progress"
      );

      // Execute the tool
      const result = await tool.invoke(currentStep.toolArgs);

      // Parse the result
      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = result;
      }

      // Check for tool-level errors
      const resultObj = parsedResult as Record<string, unknown>;
      if (resultObj.error === true || resultObj.success === false) {
        logger.warn(`Tool execution returned error: ${currentStep.toolName}`, logContext);

        const failedPlan = updateStepStatus(
          inProgressPlan,
          currentStepIndex,
          "failed",
          parsedResult
        );

        return {
          executionPlan: failedPlan,
          currentStepIndex: currentStepIndex + 1,
          messages: [
            new AIMessage(`Step "${currentStep.name}" encountered an issue. Continuing...`),
          ],
        };
      }

      // Mark step as completed with result
      const completedPlan = updateStepStatus(
        inProgressPlan,
        currentStepIndex,
        "completed",
        parsedResult
      );

      logger.info(`Step completed: ${currentStep.name}`, logContext);

      // Extract relevant info to add to gathered info
      const newInfo = extractInfoFromResult(currentStep.toolName, parsedResult);

      return {
        executionPlan: completedPlan,
        currentStepIndex: currentStepIndex + 1,
        gatheredInfo: newInfo,
        messages: [
          new AIMessage(
            `Completed: ${currentStep.name}. ${summarizeResult(currentStep.toolName, parsedResult)}`
          ),
        ],
      };
    } catch (error) {
      logger.error(`Tool execution failed: ${currentStep.toolName}`, error as Error, logContext);

      // Mark step as failed
      const failedPlan = updateStepStatus(
        executionPlan,
        currentStepIndex,
        "failed",
        { error: (error as Error).message }
      );

      return {
        executionPlan: failedPlan,
        currentStepIndex: currentStepIndex + 1,
        messages: [
          new AIMessage(`Step "${currentStep.name}" failed. Continuing with next step...`),
        ],
      };
    }
  };
}

/**
 * Update the status of a step in the plan
 */
function updateStepStatus(
  plan: ExecutionStep[],
  index: number,
  status: ExecutionStep["status"],
  result?: unknown
): ExecutionStep[] {
  return plan.map((step, i) => {
    if (i === index) {
      return {
        ...step,
        status,
        result: result ?? step.result,
      };
    }
    return step;
  });
}

/**
 * Extract relevant information from tool result
 */
function extractInfoFromResult(
  toolName: string,
  result: unknown
): Record<string, unknown> {
  const resultObj = result as Record<string, unknown>;

  switch (toolName) {
    case "web_search": {
      const data = resultObj.data as Record<string, unknown>;
      if (data?.results) {
        return { searchResults: data.results };
      }
      return {};
    }

    case "geocoding": {
      const data = resultObj.data as Record<string, unknown>;
      return {
        geocodingResult: data,
        nearbyPlaces: data?.nearbyPlaces,
      };
    }

    case "call_pharmacy": {
      const data = resultObj.data as Record<string, unknown>;
      return { callResult: data };
    }

    case "book_activity": {
      const data = resultObj.data as Record<string, unknown>;
      return { bookingResult: data };
    }

    default:
      return {};
  }
}

/**
 * Summarize tool result for user message
 */
function summarizeResult(toolName: string, result: unknown): string {
  const resultObj = result as Record<string, unknown>;
  const data = resultObj.data as Record<string, unknown>;

  switch (toolName) {
    case "web_search": {
      const count = (data?.results as unknown[])?.length || 0;
      return `Found ${count} results.`;
    }

    case "geocoding": {
      const places = (data?.nearbyPlaces as unknown[])?.length || 0;
      return places > 0 ? `Found ${places} nearby places.` : "Location identified.";
    }

    case "call_pharmacy": {
      const status = data?.status as string;
      const availability = data?.availability as string;
      if (status === "success" && availability === "available") {
        return "Medicine is available!";
      } else if (status === "success") {
        return "Medicine not available at this pharmacy.";
      }
      return "Could not reach pharmacy.";
    }

    case "book_activity": {
      const bookingStatus = data?.status as string;
      return bookingStatus === "confirmed" ? "Booking confirmed!" : "Booking could not be completed.";
    }

    default:
      return "";
  }
}

/**
 * Default execution node
 */
export const executionNode = createExecutionNode();
