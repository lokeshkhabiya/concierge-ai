import React from "react";
import { Box, Text } from "ink";
import type { Message as MessageType } from "../types";
import { formatTime } from "../utils";

interface MessageProps {
  /** Message to display */
  message: MessageType;
}

// Role configuration outside component to prevent recreation
const roleConfig = {
  user: { prefix: "You", color: "#abb2bf" as const, bold: true },
  assistant: { prefix: "Assistant", color: "#61afef" as const, bold: false },
  system: { prefix: "System", color: "#5c6370" as const, bold: false },
};

/**
 * Single message component
 */
export const Message = React.memo(({ message }: MessageProps) => {
  const { role, content, timestamp, metadata } = message;
  const config = roleConfig[role];

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box gap={1}>
        <Text color={config.color} bold={config.bold}>
          {config.prefix}
        </Text>
        <Text dimColor color="#3e4451">·</Text>
        <Text dimColor color="#5c6370">{formatTime(timestamp)}</Text>
        {metadata?.isComplete && (
          <Text color="#98c379">✓</Text>
        )}
      </Box>
      <Box marginLeft={1}>
        <Text color={role === "system" ? "#5c6370" : "#abb2bf"} wrap="wrap">
          {content}
        </Text>
      </Box>
    </Box>
  );
});
