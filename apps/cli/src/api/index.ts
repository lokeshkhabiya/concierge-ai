

import { API_BASE_URL } from "../config/constants";
import type { ChatRequest } from "./stream";

export interface ChatResponse {
  sessionId: string;
  taskId?: string;
  response: string;
  requiresInput: boolean;
  inputRequest?: {
    type: string;
    message: string;
    options?: string[];
    required: boolean;
  };
  isComplete: boolean;
  progress?: number;
  sessionToken?: string;
  isNewGuestSession?: boolean;
  userId?: string;
}

export interface ContinueTaskResponse {
  sessionId: string;
  response: string;
  requiresInput: boolean;
  inputRequest?: {
    type: string;
    message: string;
    options?: string[];
    required: boolean;
  };
  isComplete: boolean;
  progress?: number;
}

export interface GuestLoginResponse {
  sessionId: string;
  userId: string;
  sessionToken: string;
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred";
}

export const apiClient = {
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chat request failed: ${response.status} ${errorText}`);
    }

    return (await response.json()) as ChatResponse;
  },

  async continueTask(
    taskId: string,
    userInput: string,
    selectedOption?: string
  ): Promise<ContinueTaskResponse> {
    const response = await fetch(`${API_BASE_URL}/task/${taskId}/continue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userInput,
        selectedOption,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Continue task request failed: ${response.status} ${errorText}`
      );
    }

    return (await response.json()) as ContinueTaskResponse;
  },

  async guestLogin(): Promise<GuestLoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/guest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Guest login failed: ${response.status} ${errorText}`
      );
    }

    return (await response.json()) as GuestLoginResponse;
  },
};
