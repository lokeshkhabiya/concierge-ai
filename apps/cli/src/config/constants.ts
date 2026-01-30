/**
 * Configuration constants for the CLI
 */

// API base URL - defaults to localhost:8000 in development
export const API_BASE_URL =
  process.env.API_BASE_URL || "http://localhost:8000/api";

/** Request timeouts (ms) */
export const TIMEOUTS = {
  DEFAULT: 30_000,
  HEALTH: 5_000,
  CHAT: 120_000,
} as const;

/** Retry configuration */
export const RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY: 1_000,
  BACKOFF_MULTIPLIER: 2,
} as const;

/** UI layout constants */
export const UI = {
  MAX_MESSAGE_LENGTH: 200,
  PROGRESS_BAR_WIDTH: 24,
  MAX_MESSAGES: 50,
} as const;

/** Icons for status and steps (Unicode) */
export const ICONS = {
  connected: "●",
  disconnected: "○",
  pending: "◐",
  failed: "✕",
  in_progress: "◐",
  completed: "✓",
} as const;

/** Phase display config for progress panel */
export const PHASE_CONFIG = {
  clarification: { label: "Clarifying", color: "cyan" },
  gathering: { label: "Gathering info", color: "blue" },
  planning: { label: "Planning", color: "magenta" },
  execution: { label: "Executing", color: "yellow" },
  validation: { label: "Validating", color: "green" },
  complete: { label: "Complete", color: "green" },
  error: { label: "Error", color: "red" },
} as const;
