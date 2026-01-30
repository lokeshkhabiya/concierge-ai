import React from "react";
import { Text } from "ink";
import InkSpinner from "ink-spinner";

interface SpinnerProps {
  /** Text to display next to spinner */
  text?: string;
  /** Spinner color */
  color?: string;
}

/**
 * Loading spinner component
 */
export const Spinner = React.memo(({ text, color = "#61afef" }: SpinnerProps) => {
  return (
    <Text>
      <Text color={color}>
        <InkSpinner type="dots" />
      </Text>
      {text && <Text color="#abb2bf"> {text}</Text>}
    </Text>
  );
});
