import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { Message as MessageType } from "../types";
import { Message } from "./Message";
import { UI } from "../config";

interface MessageListProps {
  /** Messages to display */
  messages: MessageType[];
}

/**
 * Scrollable message list component
 */
export const MessageList = React.memo(({ messages }: MessageListProps) => {
  // Memoize sliced messages to prevent recalculation
  const displayMessages = useMemo(
    () => messages.slice(-UI.MAX_MESSAGES),
    [messages]
  );

  if (displayMessages.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor color="#5c6370">
          Start a conversation by typing your message below.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {displayMessages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
    </Box>
  );
});
