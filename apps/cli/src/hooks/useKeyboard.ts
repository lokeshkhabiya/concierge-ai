import { useInput, useApp } from "ink";
import { useSession } from "./useSession";
import { useAppState } from "../state";

interface UseKeyboardOptions {
  /** Callback when user wants to clear the screen */
  onClear?: () => void;
  /** Whether keyboard shortcuts are enabled */
  enabled?: boolean;
}

/**
 * Hook for global keyboard shortcuts
 */
export function useKeyboard(options: UseKeyboardOptions = {}) {
  const { enabled = true, onClear } = options;
  const { exit } = useApp();
  const { resetSession } = useSession();
  const { dispatch } = useAppState();

  useInput(
    (input, key) => {
      // Ctrl+C - Exit application
      if (key.ctrl && input === "c") {
        exit();
        return;
      }

      // Ctrl+L - Clear screen
      if (key.ctrl && input === "l") {
        dispatch({ type: "CLEAR_MESSAGES" });
        onClear?.();
        return;
      }

      // Ctrl+R - Reset session
      if (key.ctrl && input === "r") {
        resetSession();
        return;
      }

      // Escape - Clear error
      if (key.escape) {
        dispatch({ type: "CLEAR_ERROR" });
        return;
      }
    },
    { isActive: enabled }
  );
}
