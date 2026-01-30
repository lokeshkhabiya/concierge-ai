import React from "react";
import { Box, Text } from "ink";
import type { AgentPhase, ExecutionStep } from "../types";
import { ProgressBar } from "./ProgressBar";
import { StepList } from "./StepList";
import { PHASE_CONFIG } from "../config";

interface ProgressPanelProps {
  /** Current phase */
  phase: AgentPhase | null;
  /** Progress percentage */
  progress: number;
  /** Execution steps */
  steps: ExecutionStep[];
  /** Current step index */
  currentStepIndex: number;
}

/**
 * Progress panel showing current phase, progress bar, and steps
 */
export const ProgressPanel = React.memo(({
  phase,
  progress,
  steps,
  currentStepIndex,
}: ProgressPanelProps) => {
  // Don't show if no active phase
  if (!phase || phase === "complete") {
    return null;
  }

  const config = PHASE_CONFIG[phase] || { label: "Processing", color: "cyan" };

  return (
    <Box
      borderStyle="single"
      borderColor="#4a4a4a"
      paddingX={1}
      flexDirection="column"
    >
      {/* Phase header */}
      <Box justifyContent="space-between">
        <Text bold color={config.color as any}>
          {config.label}
        </Text>
        <Text dimColor color="#5c6370">{Math.round(progress)}%</Text>
      </Box>

      {/* Progress bar */}
      <Box>
        <ProgressBar percent={progress} showPercent={false} />
      </Box>

      {/* Step list */}
      {steps.length > 0 && (
        <StepList steps={steps} currentStepIndex={currentStepIndex} />
      )}
    </Box>
  );
});
