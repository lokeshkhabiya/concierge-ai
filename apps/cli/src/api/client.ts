import type {
  ChatRequest,
  ContinueTaskRequest,
  OrchestratorResponse,
  HealthCheckResponse,
  TaskDetailsResponse,
  ProgressSummaryResponse,
  GuestLoginResponse,
} from "../types";
import { API_BASE_URL, TIMEOUTS, RETRY } from "../config";
import { AppError } from "./errors";

/**
 * Make an HTTP request with error handling
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  timeout: number = TIMEOUTS.DEFAULT
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = (await response.json()) as Record<string, unknown>;
        errorMessage = String(errorData.message || errorData.error || errorMessage);
      } catch {
        // Use status text if JSON parsing fails
      }
      throw AppError.api(errorMessage, response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw AppError.timeout("Request timed out");
      }
      throw AppError.network(error.message, error);
    }
    throw AppError.network("Unknown network error", error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retry a request with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = RETRY.MAX_ATTEMPTS
): Promise<T> {
  let lastError: Error | null = null;
  let delay = RETRY.BASE_DELAY;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry non-recoverable errors
      if (error instanceof AppError && !error.recoverable) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= RETRY.BACKOFF_MULTIPLIER;
    }
  }

  throw lastError;
}

/**
 * API client for the Pokus server
 */
export const apiClient = {
  /**
   * Check server health
   */
  async health(): Promise<HealthCheckResponse> {
    return request<HealthCheckResponse>("/health", {}, TIMEOUTS.HEALTH);
  },

  /**
   * Create a guest session (POST /auth/guest)
   */
  async guestLogin(): Promise<GuestLoginResponse> {
    return request<GuestLoginResponse>("/auth/guest", {
      method: "POST",
    });
  },

  /**
   * Send a chat message (non-streaming)
   */
  async chat(chatRequest: ChatRequest): Promise<OrchestratorResponse> {
    return withRetry(() =>
      request<OrchestratorResponse>("/chat", {
        method: "POST",
        body: JSON.stringify(chatRequest),
      }, TIMEOUTS.CHAT)
    );
  },

  /**
   * Continue a task with user input
   */
  async continueTask(
    taskId: string,
    userInput: string,
    selectedOption?: string
  ): Promise<OrchestratorResponse> {
    const body: ContinueTaskRequest = {
      taskId,
      userInput,
      selectedOption,
    };

    return withRetry(() =>
      request<OrchestratorResponse>(`/task/${taskId}/continue`, {
        method: "POST",
        body: JSON.stringify(body),
      }, TIMEOUTS.CHAT)
    );
  },

  /**
   * Get task details
   */
  async getTask(taskId: string): Promise<TaskDetailsResponse> {
    return request<TaskDetailsResponse>(`/task/${taskId}`);
  },

  /**
   * Get task progress
   */
  async getProgress(taskId: string): Promise<ProgressSummaryResponse> {
    return request<ProgressSummaryResponse>(`/task/${taskId}/progress`);
  },
};
