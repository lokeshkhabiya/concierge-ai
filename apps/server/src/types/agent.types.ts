import type { BaseMessage } from "@langchain/core/messages";

export type IntentType = "medicine" | "travel" | "unknown";

export type AgentPhase =
  | "clarification"
  | "gathering"
  | "planning"
  | "execution"
  | "validation"
  | "complete"
  | "error";

export type StepStatus = "pending" | "in_progress" | "completed" | "failed";

export type HumanInputType = "clarification" | "confirmation" | "selection";

export interface HumanInputRequest {
  type: HumanInputType;
  message: string;
  options?: string[];
  required: boolean;
}

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

export interface BaseAgentState {
  sessionId: string;
  taskId: string;

  messages: BaseMessage[];

  currentPhase: AgentPhase;

  hasSufficientInfo: boolean;

  gatheredInfo: Record<string, unknown>;

  executionPlan: ExecutionStep[] | null;

  currentStepIndex: number;

  error: string | null;

  requiresHumanInput: boolean;
  humanInputRequest: HumanInputRequest | null;

  finalResponse?: string;
}

export interface OrchestratorResponse {
  sessionId: string;
  taskId?: string;
  response: string;
  requiresInput: boolean;
  inputRequest?: HumanInputRequest;
  isComplete: boolean;
  progress?: number;
  sessionToken?: string;
  isNewGuestSession?: boolean;
}

export interface StreamChunk {
  type: "progress" | "message" | "error" | "complete" | "session";
  node?: string;
  data?: unknown;
  message?: string;
  sessionToken?: string;
  userId?: string;
  sessionId?: string;
  isNewGuestSession?: boolean;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}
