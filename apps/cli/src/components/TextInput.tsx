import React, { useState } from "react";
import { Box, Text } from "ink";
import InkTextInput from "ink-text-input";

interface TextInputProps {
  /** Placeholder text */
  placeholder?: string;
  /** Callback when user submits */
  onSubmit: (value: string) => void;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Optional prompt message */
  prompt?: string;
}

/**
 * Text input component for free-form input
 */
export const TextInput = React.memo(({
  placeholder = "Type your message...",
  onSubmit,
  disabled = false,
  prompt,
}: TextInputProps) => {
  const [value, setValue] = useState("");

  const handleSubmit = React.useCallback((text: string) => {
    if (text.trim() && !disabled) {
      onSubmit(text.trim());
      setValue("");
    }
  }, [onSubmit, disabled]);

  return (
    <Box flexDirection="column">
      {prompt && (
        <Box>
          <Text color="#d19a66">{prompt}</Text>
        </Box>
      )}
      <Box>
        <Text color="#61afef" bold>→ </Text>
        <InkTextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={disabled ? "Processing..." : placeholder}
        />
      </Box>
    </Box>
  );
});
