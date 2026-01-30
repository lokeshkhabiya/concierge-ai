/**
 * Storage utilities for session persistence
 */

import type { StoredSession } from "../types/state";

const STORAGE_KEY = "cli_session";

/**
 * Save session to storage
 */
export function saveSession(session: StoredSession): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  } catch (error) {
    console.error("Failed to save session:", error);
  }
}

/**
 * Load session from storage
 */
export function loadSession(): StoredSession | null {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as StoredSession;
      }
    }
  } catch (error) {
    console.error("Failed to load session:", error);
  }
  return null;
}

/**
 * Clear session from storage
 */
export function clearSession(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
}
