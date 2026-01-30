import React from "react";
import { Box, Text } from "ink";

interface ErrorDisplayProps {
  /** Error message to display */
  message: string;
  /** Whether the error is recoverable */
  recoverable?: boolean;
}

/**
 * Error display component
 */
export const ErrorDisplay = React.memo(({ message, recoverable = true }: ErrorDisplayProps) => {
  return (
    <Box
      borderStyle="single"
      borderColor="#e06c75"
      paddingX={1}
      flexDirection="column"
    >
      <Text color="#e06c75" bold>
        Error: {message}
      </Text>
      {recoverable && (
        <Text dimColor color="#5c6370">Press Enter to retry or Escape to dismiss</Text>
      )}
    </Box>
  );
});
