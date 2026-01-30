import { useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAppState } from "../state";
import { useSession } from "./useSession";
import { formatErrorMessage, apiClient } from "../api";
import { streamChat } from "../api/stream";
import type { Message } from "../types/state";
import type { AgentPhase, HumanInputRequest } from "../types/api";

/**
 * Hook for chat functionality
 */
export function useChat() {
  const { state, dispatch } = useAppState();
  const { sessionId, userId, setSession } = useSession();
  const assistantMessageIdRef = useRef<string | null>(null);

  /**
   * Add a message to the conversation
   */
  const addMessage = useCallback(
    (role: Message["role"], content: string, metadata?: Message["metadata"]) => {
      const message: Message = {
        id: uuidv4(),
        role,
        content,
        timestamp: new Date(),
        metadata,
      };
      dispatch({ type: "ADD_MESSAGE", message });
      return message.id;
    },
    [dispatch]
  );

  /**
   * Update an existing message (for streaming updates)
   */
  const updateMessage = useCallback(
    (messageId: string, content: string, metadata?: Message["metadata"]) => {
      dispatch({
        type: "UPDATE_MESSAGE",
        messageId,
        content,
        metadata,
      });
    },
    [dispatch]
  );

  /**
   * Send a new message using streaming API to show step-wise updates
   */
  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      dispatch({ type: "SET_PROCESSING", isProcessing: true });
      dispatch({ type: "CLEAR_ERROR" });

      // Add user message
      addMessage("user", message);

      // Create a placeholder assistant message for streaming updates
      const assistantMessageId = addMessage("assistant", "", {
        isComplete: false,
      });
      assistantMessageIdRef.current = assistantMessageId;

      try {
        dispatch({ type: "SET_CONNECTION_STATUS", status: "connecting" });

        // Use streaming API to get step-wise updates
        const abortController = new AbortController();
        let accumulatedContent = "";
        let finalResponse: string | null = null;
        let finalTaskId: string | null = null;
        let finalSessionId: string | null = null;
        let finalIsComplete = false;
        let finalRequiresInput = false;
        let finalInputRequest: HumanInputRequest | null = null;
        let finalProgress: number | undefined = undefined;

        try {
          for await (const chunk of streamChat(
            {
              userId: userId || undefined,
              message,
              sessionId: sessionId || undefined,
              sessionToken: state.sessionToken ?? undefined,
            },
            abortController.signal
          )) {
            // Handle session chunk (for guest users)
            if (chunk.type === "session") {
              if (chunk.data?.sessionId) {
                setSession(chunk.data.sessionId);
              }
              if (chunk.data?.sessionToken) {
                dispatch({
                  type: "SET_SESSION_TOKEN",
                  sessionToken: chunk.data.sessionToken,
                });
              }
              if (chunk.data?.isNewGuestSession && chunk.data?.userId) {
                dispatch({
                  type: "SET_USER_ID",
                  userId: chunk.data.userId,
                });
              }
              continue;
            }

            // Handle progress chunks (step updates)
            if (chunk.type === "progress") {
              dispatch({ type: "SET_CONNECTION_STATUS", status: "connected" });

              // Update task info
              if (chunk.data?.taskId) {
                finalTaskId = chunk.data.taskId;
                dispatch({
                  type: "UPDATE_TASK",
                  task: { taskId: chunk.data.taskId },
                });
              }

              // Update phase
              if (chunk.data?.phase) {
                dispatch({
                  type: "UPDATE_TASK",
                  task: { phase: chunk.data.phase as AgentPhase },
                });
              }

              // Update step progress
              if (
                chunk.data?.stepIndex !== undefined &&
                chunk.data?.totalSteps !== undefined
              ) {
                const progress =
                  chunk.data.totalSteps > 0
                    ? Math.round(
                        ((chunk.data.stepIndex + 1) / chunk.data.totalSteps) * 100
                      )
                    : 0;
                dispatch({
                  type: "UPDATE_TASK",
                  task: {
                    currentStepIndex: chunk.data.stepIndex,
                    progress,
                  },
                });
                finalProgress = progress;
              }

              // Update message with progress info
              const progressMessage = chunk.message || chunk.node || "";
              if (progressMessage && assistantMessageIdRef.current) {
                accumulatedContent = progressMessage;
                updateMessage(assistantMessageIdRef.current, accumulatedContent, {
                  phase: chunk.data?.phase as AgentPhase | undefined,
                  isComplete: false,
                });
              }
              continue;
            }

            // Handle complete chunk (final response)
            if (chunk.type === "complete") {
              dispatch({ type: "SET_CONNECTION_STATUS", status: "connected" });

              if (chunk.message) {
                finalResponse = chunk.message;
                accumulatedContent = chunk.message;
              }

              if (chunk.data) {
                if (chunk.data.taskId) {
                  finalTaskId = chunk.data.taskId;
                  dispatch({
                    type: "UPDATE_TASK",
                    task: { taskId: chunk.data.taskId },
                  });
                }

                if (chunk.data.sessionId) {
                  finalSessionId = chunk.data.sessionId;
                  setSession(chunk.data.sessionId);
                }

                finalIsComplete = chunk.data.isComplete ?? false;
                finalRequiresInput = chunk.data.requiresInput ?? false;

                if (chunk.data.progress !== undefined) {
                  finalProgress = chunk.data.progress;
                  dispatch({
                    type: "UPDATE_TASK",
                    task: { progress: chunk.data.progress },
                  });
                }

                // Handle input request
                if (
                  chunk.data.requiresInput &&
                  chunk.data.inputRequest &&
                  typeof chunk.data.inputRequest === "object"
                ) {
                  const inputReq = chunk.data.inputRequest as {
                    type?: string;
                    message?: string;
                    options?: string[];
                    required?: boolean;
                  };
                  finalInputRequest = {
                    type: (inputReq.type as HumanInputRequest["type"]) || "clarification",
                    message: inputReq.message || "",
                    options: inputReq.options,
                    required: inputReq.required ?? false,
                  };
                }
              }

              // Update final message
              if (assistantMessageIdRef.current && accumulatedContent) {
                updateMessage(assistantMessageIdRef.current, accumulatedContent, {
                  isComplete: finalIsComplete,
                });
              }
              continue;
            }

            // Handle error chunk
            if (chunk.type === "error") {
              dispatch({ type: "SET_CONNECTION_STATUS", status: "error" });
              dispatch({
                type: "SET_ERROR",
                error: chunk.message || "An error occurred",
              });
              break;
            }
          }
        } catch (error) {
          // Ignore abort errors (user cancelled)
          if (
            error instanceof Error &&
            (error.name === "AbortError" || error.message.includes("aborted"))
          ) {
            return;
          }

          throw error;
        }

        // Handle final state
        if (finalResponse && assistantMessageIdRef.current) {
          updateMessage(assistantMessageIdRef.current, finalResponse, {
            isComplete: finalIsComplete,
          });
        }

        // Handle input request
        if (finalRequiresInput && finalInputRequest) {
          let inputMode: "text" | "select" | "confirm" = "text";

          if (
            finalInputRequest.type === "selection" &&
            finalInputRequest.options?.length
          ) {
            inputMode = "select";
          } else if (finalInputRequest.type === "confirmation") {
            inputMode = "confirm";
          }

          dispatch({
            type: "SET_INPUT_MODE",
            mode: inputMode,
            request: finalInputRequest,
          });
        } else if (finalIsComplete) {
          dispatch({ type: "RESET_TASK" });
          dispatch({ type: "SET_INPUT_MODE", mode: "text" });
        } else {
          dispatch({ type: "SET_INPUT_MODE", mode: "text" });
        }

        dispatch({ type: "SET_PROCESSING", isProcessing: false });
        assistantMessageIdRef.current = null;
      } catch (error) {
        dispatch({ type: "SET_CONNECTION_STATUS", status: "error" });
        dispatch({
          type: "SET_ERROR",
          error: formatErrorMessage(error),
        });
        dispatch({ type: "SET_PROCESSING", isProcessing: false });
        assistantMessageIdRef.current = null;
      }
    },
    [
      userId,
      sessionId,
      state.sessionToken,
      dispatch,
      addMessage,
      updateMessage,
      setSession,
    ]
  );

  /**
   * Continue a task with user input
   */
  const continueTask = useCallback(
    async (userInput: string, selectedOption?: string) => {
      const taskId = state.currentTask.taskId;
      if (!taskId) {
        dispatch({ type: "SET_ERROR", error: "No active task to continue" });
        return;
      }

      dispatch({ type: "SET_PROCESSING", isProcessing: true });
      dispatch({ type: "CLEAR_ERROR" });

      // Add user message
      addMessage("user", userInput);

      try {
        const response = await apiClient.continueTask(
          taskId,
          userInput,
          selectedOption
        );

        // Update session
        if (response.sessionId) {
          setSession(response.sessionId);
        }

        // Add assistant response
        if (response.response) {
          addMessage("assistant", response.response, {
            isComplete: response.isComplete,
          });
        }

        // Update progress
        if (response.progress !== undefined) {
          dispatch({
            type: "UPDATE_TASK",
            task: { progress: response.progress },
          });
        }

        // Handle input request
        if (response.requiresInput && response.inputRequest) {
          let inputMode: "text" | "select" | "confirm" = "text";

          if (
            response.inputRequest.type === "selection" &&
            response.inputRequest.options?.length
          ) {
            inputMode = "select";
          } else if (response.inputRequest.type === "confirmation") {
            inputMode = "confirm";
          }

          dispatch({
            type: "SET_INPUT_MODE",
            mode: inputMode,
            request: response.inputRequest,
          });
        } else if (response.isComplete) {
          dispatch({ type: "RESET_TASK" });
          dispatch({ type: "SET_INPUT_MODE", mode: "text" });
        }

        dispatch({ type: "SET_PROCESSING", isProcessing: false });
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: formatErrorMessage(error),
        });
      }
    },
    [state.currentTask.taskId, dispatch, addMessage, setSession]
  );

  return {
    messages: state.messages,
    isProcessing: state.isProcessing,
    currentTask: state.currentTask,
    inputMode: state.inputMode,
    inputRequest: state.inputRequest,
    error: state.error,
    sendMessage,
    continueTask,
    addMessage,
  };
}
