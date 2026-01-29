import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type {
  AgentPhase,
  ExecutionStep,
  HumanInputRequest,
} from "../../types";

/**
 * Base agent state annotation for LangGraph
 * All agent-specific states extend from this
 */
export const BaseAgentStateAnnotation = Annotation.Root({
  // Include message history from LangGraph's built-in annotation
  ...MessagesAnnotation.spec,

  // Session and task identifiers
  sessionId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  taskId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  // Current execution phase
  currentPhase: Annotation<AgentPhase>({
    reducer: (_, next) => next,
    default: () => "clarification",
  }),

  // Whether we have sufficient info to proceed
  hasSufficientInfo: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // Gathered information from user and tools
  // Uses merge reducer to accumulate info
  gatheredInfo: Annotation<Record<string, unknown>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Execution plan with steps
  executionPlan: Annotation<ExecutionStep[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Current step index in execution plan
  currentStepIndex: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Error state
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Human-in-the-loop state
  requiresHumanInput: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  humanInputRequest: Annotation<HumanInputRequest | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Final response for user
  finalResponse: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

/**
 * Type helper for the base agent state
 */
export type BaseAgentState = typeof BaseAgentStateAnnotation.State;

/**
 * Input type for base agent state (partial)
 */
export type BaseAgentStateInput = Partial<BaseAgentState>;

/**
 * Helper to create initial state
 */
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
