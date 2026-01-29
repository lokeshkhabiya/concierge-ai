import type { BaseMessage } from "@langchain/core/messages";

/**
 * Intent types for routing to appropriate agent
 */
export type IntentType = "medicine" | "travel" | "unknown";

/**
 * Agent execution phases
 */
export type AgentPhase =
  | "clarification"
  | "gathering"
  | "planning"
  | "execution"
  | "validation"
  | "complete"
  | "error";

/**
 * Step status in execution plan
 */
export type StepStatus = "pending" | "in_progress" | "completed" | "failed";

/**
 * Human input request types
 */
export type HumanInputType = "clarification" | "confirmation" | "selection";

/**
 * Request for human input during agent execution
 */
export interface HumanInputRequest {
  type: HumanInputType;
  message: string;
  options?: string[];
  required: boolean;
}

/**
 * A single step in the execution plan
 */
export interface ExecutionStep {
  id: string;
  name: string;
  description: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  status: StepStatus;
  result?: unknown;
  error?: string;
}

/**
 * Base state interface shared by all agents
 */
export interface BaseAgentState {
  // Session and task identifiers
  sessionId: string;
  taskId: string;

  // Message history
  messages: BaseMessage[];

  // Current execution phase
  currentPhase: AgentPhase;

  // Whether we have enough info to proceed
  hasSufficientInfo: boolean;

  // Information gathered from user/tools
  gatheredInfo: Record<string, unknown>;

  // Execution plan with steps
  executionPlan: ExecutionStep[] | null;

  // Current step being executed
  currentStepIndex: number;

  // Error state
  error: string | null;

  // Human-in-the-loop state
  requiresHumanInput: boolean;
  humanInputRequest: HumanInputRequest | null;
}

/**
 * Response from the orchestrator
 */
export interface OrchestratorResponse {
  sessionId: string;
  taskId?: string;
  response: string;
  requiresInput: boolean;
  inputRequest?: HumanInputRequest;
  isComplete: boolean;
  progress?: number;
}

/**
 * Stream chunk for SSE streaming
 */
export interface StreamChunk {
  type: "progress" | "message" | "error" | "complete";
  node?: string;
  data?: unknown;
  message?: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
