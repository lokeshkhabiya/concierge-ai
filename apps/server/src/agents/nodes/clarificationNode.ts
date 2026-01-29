import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { llm } from "../../llm";
import {
  medicineInfoGatheringPrompt,
  travelPreferenceGatheringPrompt,
  informationExtractionPrompt,
} from "../../llm/prompts";
import { logger } from "../../logger";
import { detectLocation } from "../../services/locationService";
import type { BaseAgentState } from "../state";
import type { AgentPhase, HumanInputRequest, IntentType } from "../../types";

/**
 * Result from clarification node
 */
interface ClarificationResult {
  hasSufficientInfo?: boolean;
  currentPhase?: AgentPhase;
  gatheredInfo?: Record<string, unknown>;
  messages?: (AIMessage | HumanMessage)[];
  requiresHumanInput?: boolean;
  humanInputRequest?: HumanInputRequest | null;
}

/**
 * Create a clarification node for a specific task type
 */
export function createClarificationNode(taskType: IntentType) {
  const prompt =
    taskType === "medicine"
      ? medicineInfoGatheringPrompt
      : travelPreferenceGatheringPrompt;

  return async (state: BaseAgentState): Promise<ClarificationResult> => {
    const logContext = {
      sessionId: state.sessionId,
      taskId: state.taskId,
      agentType: taskType,
    };

    logger.agentStep("clarification", "clarification", logContext);

    // Get the last user message
    const lastMessage = state.messages[state.messages.length - 1];
    const userInput =
      lastMessage && lastMessage._getType() === "human"
        ? (lastMessage.content as string)
        : "";

    // Extract information from user input
    const extractedInfo = await extractInformation(userInput, taskType, state.gatheredInfo);
    let mergedInfo = { ...state.gatheredInfo, ...extractedInfo };

    // Medicine: try auto-detect location if missing (IP or browser already set in orchestrator; fallback here)
    if (taskType === "medicine") {
      const hasLocation =
        mergedInfo.location != null ||
        (state as { location?: unknown }).location != null;
      if (!hasLocation) {
        const detected = await detectLocation();
        if (detected) {
          mergedInfo = { ...mergedInfo, location: detected };
          logger.info("Location auto-detected in clarification", logContext);
        }
      }
    }

    // Check if we have sufficient info
    const response = await llm.invoke(
      await prompt.formatMessages({
        gatheredInfo: JSON.stringify(mergedInfo, null, 2),
        input: userInput,
      })
    );

    const responseContent = response.content as string;

    logger.debug("Clarification response", { responseContent }, logContext);

    // Check if sufficient info gathered
    if (responseContent.includes("SUFFICIENT_INFO")) {
      logger.info("Sufficient info gathered, moving to planning", logContext);

      return {
        hasSufficientInfo: true,
        currentPhase: "planning",
        gatheredInfo: mergedInfo,
        requiresHumanInput: false,
        humanInputRequest: null,
      };
    }

    // Need more info - return clarification request
    logger.info("Need more info, requesting clarification", logContext);

    return {
      hasSufficientInfo: false,
      gatheredInfo: mergedInfo,
      messages: [new AIMessage(responseContent)],
      requiresHumanInput: true,
      humanInputRequest: {
        type: "clarification",
        message: responseContent,
        required: true,
      },
    };
  };
}

/**
 * Extract structured information from user message
 */
async function extractInformation(
  userInput: string,
  taskType: IntentType,
  currentInfo: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!userInput.trim()) {
    return {};
  }

  try {
    const response = await llm.invoke(
      await informationExtractionPrompt.formatMessages({
        taskType,
        gatheredInfo: JSON.stringify(currentInfo, null, 2),
        input: userInput,
      })
    );

    const content = response.content as string;

    // Try to parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Filter out null/undefined values
      return Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => v != null && v !== "")
      );
    }

    return {};
  } catch (error) {
    logger.warn("Failed to extract information", { error });
    return {};
  }
}

/**
 * Medicine-specific clarification node
 */
export const medicineClarificationNode = createClarificationNode("medicine");

/**
 * Travel-specific clarification node
 */
export const travelClarificationNode = createClarificationNode("travel");
