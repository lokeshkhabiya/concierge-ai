import React from "react";
import { Box, Text } from "ink";
import { createProgressBar } from "../utils";
import { UI } from "../config";

interface ProgressBarProps {
  /** Progress percentage (0-100) */
  percent: number;
  /** Width of the progress bar */
  width?: number;
  /** Show percentage text */
  showPercent?: boolean;
}

/**
 * Visual progress bar component
 */
export const ProgressBar = React.memo(({
  percent,
  width = UI.PROGRESS_BAR_WIDTH,
  showPercent = true,
}: ProgressBarProps) => {
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const bar = createProgressBar(clampedPercent, width);

  // Determine color based on progress
  let color = "#61afef";
  if (clampedPercent >= 90) {
    color = "#98c379";
  } else if (clampedPercent >= 60) {
    color = "#56b6c2";
  } else if (clampedPercent >= 30) {
    color = "#d19a66";
  }

  return (
    <Box>
      <Text color={color}>{bar}</Text>
      {showPercent && (
        <Text dimColor color="#5c6370"> {Math.round(clampedPercent)}%</Text>
      )}
    </Box>
  );
});
