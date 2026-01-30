import React from "react";
import { Box, Text } from "ink";
import InkSelectInput from "ink-select-input";

interface ConfirmInputProps {
  /** Callback when user confirms or denies */
  onConfirm: (confirmed: boolean) => void;
  /** Optional prompt message */
  prompt?: string;
}

interface SelectItem {
  label: string;
  value: string;
}

// Constant items to prevent recreation
const CONFIRM_ITEMS: SelectItem[] = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
];

/**
 * Confirmation input component for yes/no questions
 */
export const ConfirmInput = React.memo(({ onConfirm, prompt }: ConfirmInputProps) => {
  const handleSelect = React.useCallback((item: SelectItem) => {
    onConfirm(item.value === "yes");
  }, [onConfirm]);

  return (
    <Box flexDirection="column">
      {prompt && (
        <Box>
          <Text color="#d19a66">{prompt}</Text>
        </Box>
      )}
      <Box marginLeft={1}>
        <InkSelectInput items={CONFIRM_ITEMS} onSelect={handleSelect} />
      </Box>
      <Box>
        <Text dimColor color="#5c6370">↑↓ Navigate · Enter to confirm</Text>
      </Box>
    </Box>
  );
});
