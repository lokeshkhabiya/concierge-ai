import React, { createContext, useContext, useReducer, useEffect } from "react";
import type { AppState, AppAction } from "../types";
import { appReducer, initialState } from "./reducer";
import { loadSession, saveSession } from "../utils/storage";
import { apiClient } from "../api";

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const stored = loadSession();
    if (stored?.sessionId && stored?.userId && stored?.sessionToken) {
      dispatch({
        type: "SET_GUEST_CREDENTIALS",
        sessionId: stored.sessionId,
        userId: stored.userId,
        sessionToken: stored.sessionToken,
      });
    } else {
      apiClient
        .guestLogin()
        .then((guest) => {
          dispatch({
            type: "SET_GUEST_CREDENTIALS",
            sessionId: guest.sessionId,
            userId: guest.userId,
            sessionToken: guest.sessionToken,
          });
        })
        .catch((err) => {
          console.error("Guest login failed:", err);
          dispatch({ type: "SET_SESSION_TOKEN", sessionToken: null });
        });
    }
  }, []);

  useEffect(() => {
    if (state.sessionId && state.userId && state.sessionToken) {
      saveSession({
        sessionId: state.sessionId,
        userId: state.userId,
        sessionToken: state.sessionToken,
        lastActive: new Date().toISOString(),
      });
    }
  }, [state.sessionId, state.userId, state.sessionToken]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppProvider");
  }
  return context;
}
