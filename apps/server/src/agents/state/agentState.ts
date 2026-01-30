import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type {
	AgentPhase,
	ExecutionStep,
	HumanInputRequest,
} from "../../types";

export const BaseAgentStateAnnotation = Annotation.Root({
	...MessagesAnnotation.spec,

	sessionId: Annotation<string>({
		reducer: (_, next) => next,
		default: () => "",
	}),

	taskId: Annotation<string>({
		reducer: (_, next) => next,
		default: () => "",
	}),

	currentPhase: Annotation<AgentPhase>({
		reducer: (_, next) => next,
		default: () => "clarification",
	}),

	hasSufficientInfo: Annotation<boolean>({
		reducer: (_, next) => next,
		default: () => false,
	}),

	gatheredInfo: Annotation<Record<string, unknown>>({
		reducer: (prev, next) => ({ ...prev, ...next }),
		default: () => ({}),
	}),

	executionPlan: Annotation<ExecutionStep[] | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),

	currentStepIndex: Annotation<number>({
		reducer: (_, next) => next,
		default: () => 0,
	}),

	error: Annotation<string | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),

	requiresHumanInput: Annotation<boolean>({
		reducer: (_, next) => next,
		default: () => false,
	}),

	humanInputRequest: Annotation<HumanInputRequest | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),

	finalResponse: Annotation<string | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),
});

export type BaseAgentState = typeof BaseAgentStateAnnotation.State;

export type BaseAgentStateInput = Partial<BaseAgentState>;

export function createInitialBaseState(
	sessionId: string,
	taskId: string
): BaseAgentStateInput {
	return {
		sessionId,
		taskId,
		currentPhase: "clarification",
		hasSufficientInfo: false,
		gatheredInfo: {},
		executionPlan: null,
		currentStepIndex: 0,
		error: null,
		requiresHumanInput: false,
		humanInputRequest: null,
		finalResponse: null,
	};
}
