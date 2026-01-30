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

/** Health check API response */
export interface HealthCheckResponse {
  status: "ok" | "degraded" | "error";
  database: boolean;
  timestamp: string;
}

/** Chat request payload */
export interface ChatRequest {
  userId?: string;
  message: string;
  sessionId?: string;
  sessionToken?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
}

/** Continue task request payload */
export interface ContinueTaskRequest {
  taskId: string;
  userInput: string;
  selectedOption?: string;
}

/** Orchestrator / chat API response */
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

/** Task details API response */
export interface TaskDetailsResponse {
  task: {
    id: string;
    type: string;
    status: string;
    phase: string;
    progress: number;
    createdAt: string;
    completedAt: string | null;
  };
  steps: Array<{
    id: string;
    name: string;
    status: string;
    sequenceNumber: number;
  }>;
}

/** Task progress summary API response */
export interface ProgressSummaryResponse {
  phase: string;
  progress: number;
  completedSteps: number;
  totalSteps: number;
  isComplete: boolean;
}

/** Guest login API response */
export interface GuestLoginResponse {
  sessionToken: string;
  userId: string;
  sessionId: string;
  expiresIn: number;
}
