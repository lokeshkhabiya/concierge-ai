import React, { useCallback } from "react";
import { Box } from "ink";
import { Header } from "./Header";
import { MessageList } from "./MessageList";
import { ProgressPanel } from "./ProgressPanel";
import { InputHandler } from "./InputHandler";
import { StatusBar } from "./StatusBar";
import { ErrorDisplay } from "./ErrorDisplay";
import { useChat, useKeyboard } from "../hooks";
import { useAppState } from "../state";

/**
 * Main chat interface component
 */
export function ChatInterface() {
  const { state } = useAppState();
  const {
    messages,
    isProcessing,
    currentTask,
    inputMode,
    inputRequest,
    error,
    sendMessage,
    continueTask,
  } = useChat();

  // Set up global keyboard shortcuts
  useKeyboard();

  // Memoize event handlers to prevent child re-renders
  const handleTextSubmit = useCallback((value: string) => {
    if (currentTask.taskId && inputRequest) {
      // Continue existing task
      continueTask(value);
    } else {
      // Start new message
      sendMessage(value);
    }
  }, [currentTask.taskId, inputRequest, continueTask, sendMessage]);

  const handleSelectSubmit = useCallback((value: string) => {
    if (currentTask.taskId) {
      continueTask(value, value);
    }
  }, [currentTask.taskId, continueTask]);

  const handleConfirmSubmit = useCallback((confirmed: boolean) => {
    if (currentTask.taskId) {
      continueTask(confirmed ? "yes" : "no");
    }
  }, [currentTask.taskId, continueTask]);

  return (
    <Box flexDirection="column" minHeight={20}>
      {/* Header */}
      <Header sessionId={state.sessionId} />

      {/* Message list */}
      <Box flexDirection="column" flexGrow={1} paddingY={1}>
        <MessageList messages={messages} />
      </Box>

      {/* Error display */}
      {error && <ErrorDisplay message={error} />}

      {/* Progress panel */}
      {currentTask.taskId && (
        <ProgressPanel
          phase={currentTask.phase}
          progress={currentTask.progress}
          steps={currentTask.steps}
          currentStepIndex={currentTask.currentStepIndex}
        />
      )}

      {/* Input handler */}
      <InputHandler
        mode={inputMode}
        inputRequest={inputRequest}
        isProcessing={isProcessing}
        onTextSubmit={handleTextSubmit}
        onSelectSubmit={handleSelectSubmit}
        onConfirmSubmit={handleConfirmSubmit}
      />

      {/* Status bar */}
      <StatusBar status={state.connectionStatus} />
    </Box>
  );
}
