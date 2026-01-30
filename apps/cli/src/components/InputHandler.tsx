import React from "react";
import { Box, Text } from "ink";
import type { InputMode, HumanInputRequest } from "../types";
import { TextInput } from "./TextInput";
import { SelectInput } from "./SelectInput";
import { ConfirmInput } from "./ConfirmInput";
import { Spinner } from "./Spinner";

interface InputHandlerProps {
  /** Current input mode */
  mode: InputMode;
  /** Input request from server (for prompts and options) */
  inputRequest: HumanInputRequest | null;
  /** Whether currently processing */
  isProcessing: boolean;
  /** Callback when user submits text input */
  onTextSubmit: (value: string) => void;
  /** Callback when user selects an option */
  onSelectSubmit: (value: string) => void;
  /** Callback when user confirms/denies */
  onConfirmSubmit: (confirmed: boolean) => void;
}

/**
 * Smart input handler that switches between input types
 */
export const InputHandler = React.memo(({
  mode,
  inputRequest,
  isProcessing,
  onTextSubmit,
  onSelectSubmit,
  onConfirmSubmit,
}: InputHandlerProps) => {
  // Show spinner when processing
  if (isProcessing || mode === "disabled") {
    return (
      <Box
        borderStyle="single"
        borderColor="#4a4a4a"
        paddingX={1}
      >
        <Spinner text="Processing..." />
      </Box>
    );
  }

  const prompt = inputRequest?.message;

  return (
    <Box
      borderStyle="single"
      borderColor="#4a4a4a"
      paddingX={1}
      flexDirection="column"
    >
      {mode === "text" && (
        <TextInput onSubmit={onTextSubmit} prompt={prompt} />
      )}

      {mode === "select" && inputRequest?.options && (
        <SelectInput
          options={inputRequest.options}
          onSelect={onSelectSubmit}
          prompt={prompt}
        />
      )}

      {mode === "confirm" && (
        <ConfirmInput onConfirm={onConfirmSubmit} prompt={prompt} />
      )}
    </Box>
  );
});
