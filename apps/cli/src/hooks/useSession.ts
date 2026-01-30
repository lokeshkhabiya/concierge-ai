import { useCallback } from "react";
import { useAppState } from "../state";
import { clearSession as clearStoredSession } from "../utils/storage";
import { apiClient } from "../api";

/**
 * Hook for session management
 */
export function useSession() {
  const { state, dispatch } = useAppState();

  /**
   * Update session ID (usually from server response)
   */
  const setSession = useCallback(
    (sessionId: string) => {
      dispatch({ type: "SET_SESSION", sessionId });
    },
    [dispatch]
  );

  /**
   * Reset session and start fresh (creates new guest session on server)
   */
  const resetSession = useCallback(async () => {
    clearStoredSession();
    dispatch({ type: "SET_SESSION_TOKEN", sessionToken: null });
    dispatch({ type: "SET_USER_ID", userId: "" });
    dispatch({ type: "SET_SESSION", sessionId: "" });
    dispatch({ type: "CLEAR_MESSAGES" });
    dispatch({ type: "RESET_TASK" });
    dispatch({ type: "SET_INPUT_MODE", mode: "text" });
    dispatch({ type: "CLEAR_ERROR" });
    try {
      const guest = await apiClient.guestLogin();
      dispatch({
        type: "SET_GUEST_CREDENTIALS",
        sessionId: guest.sessionId,
        userId: guest.userId,
        sessionToken: guest.sessionToken,
      });
    } catch (err) {
      console.error("Failed to create new guest session:", err);
    }
  }, [dispatch]);

  return {
    sessionId: state.sessionId,
    userId: state.userId,
    setSession,
    resetSession,
  };
}
