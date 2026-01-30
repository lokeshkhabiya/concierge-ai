import type {
  AgentPhase,
  ExecutionStep,
  HumanInputRequest,
} from "./api";

// Re-export for consumers that import from types/state
export type { HumanInputRequest } from "./api";

/**
 * Connection status
 */
export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

/**
 * Input mode for the input handler
 */
export type InputMode = "text" | "select" | "confirm" | "disabled";

/**
 * Message role
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * A message in the conversation
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  metadata?: {
    phase?: AgentPhase;
    isComplete?: boolean;
  };
}

/**
 * Current task state
 */
export interface CurrentTask {
  taskId: string | null;
  phase: AgentPhase | null;
  progress: number;
  steps: ExecutionStep[];
  currentStepIndex: number;
}

/**
 * Main application state
 */
export interface AppState {
  // Session
  sessionId: string | null;
  userId: string;
  sessionToken: string | null;

  // Connection
  connectionStatus: ConnectionStatus;

  // Messages
  messages: Message[];

  // Current task
  currentTask: CurrentTask;

  // Input state
  inputMode: InputMode;
  inputRequest: HumanInputRequest | null;
  isProcessing: boolean;

  // Error
  error: string | null;
}

/**
 * App state actions
 */
export type AppAction =
  | { type: "SET_SESSION"; sessionId: string }
  | { type: "SET_USER_ID"; userId: string }
  | { type: "SET_SESSION_TOKEN"; sessionToken: string | null }
  | { type: "SET_GUEST_CREDENTIALS"; sessionId: string; userId: string; sessionToken: string }
  | { type: "SET_CONNECTION_STATUS"; status: ConnectionStatus }
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "UPDATE_MESSAGE"; messageId: string; content: string; metadata?: Message["metadata"] }
  | { type: "CLEAR_MESSAGES" }
  | { type: "UPDATE_TASK"; task: Partial<CurrentTask> }
  | { type: "RESET_TASK" }
  | { type: "SET_INPUT_MODE"; mode: InputMode; request?: HumanInputRequest }
  | { type: "SET_PROCESSING"; isProcessing: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "CLEAR_ERROR" };

/**
 * Stored session data for persistence
 */
export interface StoredSession {
  sessionId: string;
  userId: string;
  sessionToken: string;
  lastActive: string;
}
