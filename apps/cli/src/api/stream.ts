/**
 * Streaming API utilities for Server-Sent Events (SSE)
 */

import { API_BASE_URL } from "../config/constants";

/**
 * Stream chunk types from the server
 */
export interface StreamChunk {
  type: "progress" | "message" | "error" | "complete" | "session";
  node?: string;
  data?: {
    taskId?: string;
    phase?: string;
    stepIndex?: number;
    totalSteps?: number;
    hasSufficientInfo?: boolean;
    sessionId?: string;
    isComplete?: boolean;
    requiresInput?: boolean;
    inputRequest?: unknown;
    progress?: number;
    sessionToken?: string;
    userId?: string;
    isNewGuestSession?: boolean;
  };
  message?: string;
}

/**
 * Chat request parameters
 */
export interface ChatRequest {
  userId?: string;
  message: string;
  sessionId?: string;
  sessionToken?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

/**
 * Stream chat messages using Server-Sent Events
 */
export async function* streamChat(
  request: ChatRequest,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, void, unknown> {
  const response = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stream request failed: ${response.status} ${errorText}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const jsonStr = line.slice(6); // Remove "data: " prefix
            const chunk: StreamChunk = JSON.parse(jsonStr);
            yield chunk;
          } catch (error) {
            console.error("Failed to parse SSE chunk:", error, line);
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const line = buffer.trim();
      if (line.startsWith("data: ")) {
        try {
          const jsonStr = line.slice(6);
          const chunk: StreamChunk = JSON.parse(jsonStr);
          yield chunk;
        } catch (error) {
          console.error("Failed to parse final SSE chunk:", error, line);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
