import React from "react";
import { Box, Text } from "ink";
import InkSelectInput from "ink-select-input";

interface SelectInputProps {
  /** Options to display */
  options: string[];
  /** Callback when user selects an option */
  onSelect: (value: string) => void;
  /** Optional prompt message */
  prompt?: string;
}

interface SelectItem {
  label: string;
  value: string;
}

/**
 * Select input component for choosing from options
 */
export const SelectInput = React.memo(({ options, onSelect, prompt }: SelectInputProps) => {
  const items: SelectItem[] = React.useMemo(
    () => options.map((option, index) => ({
      label: `${index + 1}. ${option}`,
      value: option,
    })),
    [options]
  );

  const handleSelect = React.useCallback((item: SelectItem) => {
    onSelect(item.value);
  }, [onSelect]);

  return (
    <Box flexDirection="column">
      {prompt && (
        <Box>
          <Text color="#d19a66">{prompt}</Text>
        </Box>
      )}
      <Box marginLeft={1}>
        <InkSelectInput items={items} onSelect={handleSelect} />
      </Box>
      <Box>
        <Text dimColor color="#5c6370">↑↓ Navigate · Enter to select</Text>
      </Box>
    </Box>
  );
});
