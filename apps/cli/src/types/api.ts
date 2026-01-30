/**
 * API types shared between client and server
 */

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
