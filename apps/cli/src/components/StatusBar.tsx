import React from "react";
import { Box, Text } from "ink";
import type { ConnectionStatus } from "../types";
import { ICONS } from "../config";

interface StatusBarProps {
  /** Current connection status */
  status: ConnectionStatus;
}

// Status config outside component to prevent recreation
const statusConfig = {
  connected: { icon: ICONS.connected, color: "#98c379" as const, text: "Connected" },
  connecting: { icon: ICONS.pending, color: "#d19a66" as const, text: "Connecting..." },
  disconnected: { icon: ICONS.disconnected, color: "#5c6370" as const, text: "Disconnected" },
  error: { icon: ICONS.failed, color: "#e06c75" as const, text: "Error" },
};

/**
 * Status bar component at the bottom of the screen
 */
export const StatusBar = React.memo(({ status }: StatusBarProps) => {
  const config = statusConfig[status];

  return (
    <Box
      borderStyle="single"
      borderColor="#4a4a4a"
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color={config.color}>{config.icon}</Text>
        <Text color={config.color}> {config.text}</Text>
      </Box>
      <Box gap={1}>
        <Text dimColor color="#5c6370">Ctrl+C: Exit</Text>
        <Text dimColor color="#3e4451">•</Text>
        <Text dimColor color="#5c6370">Ctrl+L: Clear</Text>
        <Text dimColor color="#3e4451">•</Text>
        <Text dimColor color="#5c6370">Ctrl+R: Reset</Text>
      </Box>
    </Box>
  );
});
