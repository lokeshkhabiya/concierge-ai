import React from "react";
import { Box, Text } from "ink";
import { formatSessionId } from "../utils";

interface HeaderProps {
  /** Current session ID */
  sessionId: string | null;
}

/**
 * Application header component
 */
export const Header = React.memo(({ sessionId }: HeaderProps) => {
  return (
    <Box
      borderStyle="single"
      borderColor="#4a4a4a"
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold color="#e06c75">
        POKUS CLI
      </Text>
      {sessionId && (
        <Text dimColor color="#5c6370">
          Session: {formatSessionId(sessionId)}
        </Text>
      )}
    </Box>
  );
});
