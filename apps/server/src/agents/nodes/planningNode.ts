import { AIMessage } from "@langchain/core/messages";
import { planningLlm } from "../../llm";
import { medicinePlanningPrompt } from "../../llm/templates/medicinePlanningPrompt";
import { travelPlanningPrompt } from "../../llm/templates/travelPlanningPrompt";
import { toolRegistry } from "../tools";
import { logger } from "../../logger";
import type { BaseAgentState } from "../state";
import type { AgentPhase, ExecutionStep, IntentType } from "../../types";

interface PlanningResult {
	currentPhase?: AgentPhase;
	executionPlan?: ExecutionStep[];
	currentStepIndex?: number;
	messages?: AIMessage[];
	error?: string;
}

export function createPlanningNode(taskType: Exclude<IntentType, "unknown">) {
  const prompt =
    taskType === "medicine" ? medicinePlanningPrompt : travelPlanningPrompt;

  return async (state: BaseAgentState): Promise<PlanningResult> => {
    const logContext = {
      sessionId: state.sessionId,
      taskId: state.taskId,
      agentType: taskType,
    };

    logger.agentStep("planning", "planning", logContext);

    try {
      // Get available tools for this agent type
      const availableTools = toolRegistry.getToolDescriptionsForAgent(taskType);

      // Build prompt arguments based on task type
      const promptArgs = buildPromptArgs(taskType, state, availableTools);

      // Generate execution plan using gpt-5 for complex planning
      const response = await planningLlm.invoke(await prompt.formatMessages(promptArgs));

      const content = response.content as string;
      logger.debug("Planning response", { content }, logContext);

      // Parse the execution plan
      const plan = parseExecutionPlan(content);

      if (!plan || plan.length === 0) {
        logger.warn("Failed to parse execution plan", { content }, logContext);
        return {
          error: "Failed to create execution plan",
          currentPhase: "error",
        };
      }

      logger.info(`Created execution plan with ${plan.length} steps`, logContext);

      return {
        executionPlan: plan,
        currentStepIndex: 0,
        currentPhase: "execution",
        messages: [
          new AIMessage(`I've created a plan with ${plan.length} steps. Starting execution...`),
        ],
      };
    } catch (error) {
      logger.error("Planning failed", error as Error, logContext);

      return {
        error: (error as Error).message,
        currentPhase: "error",
      };
    }
  };
}

function buildPromptArgs(
	taskType: string,
	state: BaseAgentState,
	availableTools: Array<{ name: string; description: string }>
): Record<string, unknown> {
	const baseArgs = {
		gatheredInfo: JSON.stringify(state.gatheredInfo, null, 2),
		availableTools: JSON.stringify(availableTools, null, 2),
	};

	if (taskType === "medicine") {
		return {
			...baseArgs,
			medicineName: state.gatheredInfo.medicineName || "medicine",
			location: state.gatheredInfo.location || state.gatheredInfo.userAddress || "user location",
		};
	}

	if (taskType === "travel") {
		return {
			...baseArgs,
			destination: state.gatheredInfo.destination || "destination",
			startDate: state.gatheredInfo.startDate || "start date",
			endDate: state.gatheredInfo.endDate || "end date",
		};
	}

	return baseArgs;
}

function parseExecutionPlan(content: string): ExecutionStep[] {
	try {
		const jsonMatch = content.match(/\{[\s\S]*\}/);
		if (!jsonMatch) {
			return createDefaultPlan();
		}

		const parsed = JSON.parse(jsonMatch[0]);
		const steps = parsed.steps || [];

		return steps.map((step: Record<string, unknown>, index: number) => ({
			id: (step.id as string) || `step_${index + 1}`,
			name: (step.name as string) || `Step ${index + 1}`,
			description: (step.description as string) || "",
			toolName: (step.toolName as string) || "web_search",
			toolArgs: (step.toolArgs as Record<string, unknown>) || {},
			status: "pending" as const,
		}));
	} catch (error) {
		logger.warn("Failed to parse execution plan JSON", { error, content });
		return createDefaultPlan();
	}
}

function createDefaultPlan(): ExecutionStep[] {
	return [
		{
			id: "step_1",
			name: "Search for information",
			description: "Search the web for relevant information",
			toolName: "web_search",
			toolArgs: { query: "search query", maxResults: 5 },
			status: "pending",
		},
	];
}

export const medicinePlanningNode = createPlanningNode("medicine");

export const travelPlanningNode = createPlanningNode("travel");
