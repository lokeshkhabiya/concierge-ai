import React from "react";
import { Box, Text } from "ink";
import type { ExecutionStep } from "../types";
import { getStatusIcon } from "../utils";

interface StepListProps {
  /** Steps to display */
  steps: ExecutionStep[];
  /** Current step index */
  currentStepIndex: number;
}

// Helper to get step color
const getStepColor = (status: ExecutionStep["status"]): string => {
  switch (status) {
    case "completed":
      return "#98c379";
    case "in_progress":
      return "#61afef";
    case "failed":
      return "#e06c75";
    default:
      return "#5c6370";
  }
};

/**
 * List of execution steps with status icons
 */
export const StepList = React.memo(({ steps, currentStepIndex }: StepListProps) => {
  if (steps.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {steps.map((step, index) => {
        const icon = getStatusIcon(step.status);
        const isCurrent = index === currentStepIndex;
        const color = getStepColor(step.status);

        return (
          <Box key={step.id}>
            <Text color={color}>{icon} </Text>
            <Text color={isCurrent ? "#abb2bf" : "#5c6370"} bold={isCurrent}>
              {step.name}
            </Text>
            {step.status !== "pending" && step.status !== "in_progress" && (
              <Text dimColor color="#5c6370"> ({step.status})</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
});
