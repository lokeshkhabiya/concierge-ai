import type { AppState, AppAction, CurrentTask } from "../types";

const initialTask: CurrentTask = {
  taskId: null,
  phase: null,
  progress: 0,
  steps: [],
  currentStepIndex: 0,
};

export const initialState: AppState = {
  sessionId: null,
  userId: "",
  sessionToken: null,
  connectionStatus: "disconnected",
  messages: [],
  currentTask: initialTask,
  inputMode: "text",
  inputRequest: null,
  isProcessing: false,
  error: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_SESSION":
      return {
        ...state,
        sessionId: action.sessionId,
      };

    case "SET_USER_ID":
      return {
        ...state,
        userId: action.userId,
      };

    case "SET_SESSION_TOKEN":
      return {
        ...state,
        sessionToken: action.sessionToken,
      };

    case "SET_GUEST_CREDENTIALS":
      return {
        ...state,
        sessionId: action.sessionId,
        userId: action.userId,
        sessionToken: action.sessionToken,
      };

    case "SET_CONNECTION_STATUS":
      return {
        ...state,
        connectionStatus: action.status,
      };

    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.message],
      };

    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === action.messageId
            ? {
                ...msg,
                content: action.content,
                metadata: action.metadata !== undefined ? action.metadata : msg.metadata,
              }
            : msg
        ),
      };

    case "CLEAR_MESSAGES":
      return {
        ...state,
        messages: [],
      };

    case "UPDATE_TASK":
      return {
        ...state,
        currentTask: {
          ...state.currentTask,
          ...action.task,
        },
      };

    case "RESET_TASK":
      return {
        ...state,
        currentTask: initialTask,
      };

    case "SET_INPUT_MODE":
      return {
        ...state,
        inputMode: action.mode,
        inputRequest: action.request ?? null,
      };

    case "SET_PROCESSING":
      return {
        ...state,
        isProcessing: action.isProcessing,
        inputMode: action.isProcessing ? "disabled" : state.inputMode,
      };

    case "SET_ERROR":
      return {
        ...state,
        error: action.error,
        isProcessing: false,
        inputMode: "text",
      };

    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
}
