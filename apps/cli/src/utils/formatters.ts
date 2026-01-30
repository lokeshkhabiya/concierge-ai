import { UI, ICONS } from "../config";
import type { StepStatus } from "../types";

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number = UI.MAX_MESSAGE_LENGTH): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Format a date for display
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format session ID for display (truncated)
 */
export function formatSessionId(sessionId: string): string {
  if (sessionId.length <= 8) return sessionId;
  return sessionId.slice(0, 8);
}

/**
 * Get status icon for a step
 */
export function getStatusIcon(status: StepStatus): string {
  return ICONS[status] || ICONS.pending;
}

/**
 * Create a progress bar string
 */
export function createProgressBar(percent: number, width: number = UI.PROGRESS_BAR_WIDTH): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

/**
 * Wrap text to fit within a width
 */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}
