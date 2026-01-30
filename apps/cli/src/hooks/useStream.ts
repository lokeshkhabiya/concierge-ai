/**
 * Hook for handling streaming chat responses
 */

import { useEffect, useRef, useCallback } from "react";
import { streamChat, type StreamChunk, type ChatRequest } from "../api/stream";

/**
 * Options for the streaming hook
 */
export interface UseStreamOptions {
  onChunk?: (chunk: StreamChunk) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

/**
 * Hook for streaming chat responses
 */
export function useStream() {
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Start streaming a chat request
   */
  const startStream = useCallback(
    async (request: ChatRequest, options: UseStreamOptions = {}) => {
      // Cancel any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        for await (const chunk of streamChat(request, abortController.signal)) {
          if (options.onChunk) {
            options.onChunk(chunk);
          }
        }

        if (options.onComplete) {
          options.onComplete();
        }
      } catch (error) {
        // Ignore abort errors
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        if (options.onError) {
          options.onError(
            error instanceof Error ? error : new Error(String(error))
          );
        }
      }
    },
    []
  );

  /**
   * Stop the current stream
   */
  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    startStream,
    stopStream,
  };
}
