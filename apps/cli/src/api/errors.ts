/**
 * Error categories for different handling strategies
 */
export enum ErrorCategory {
  NETWORK = "network",
  API = "api",
  VALIDATION = "validation",
  TIMEOUT = "timeout",
  STREAM = "stream",
  UNKNOWN = "unknown",
}

/**
 * Application error with metadata
 */
export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly statusCode?: number;
  public readonly recoverable: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    category: ErrorCategory,
    options?: {
      statusCode?: number;
      recoverable?: boolean;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = "AppError";
    this.category = category;
    this.statusCode = options?.statusCode;
    this.recoverable = options?.recoverable ?? true;
    this.details = options?.details;
  }

  /**
   * Create a network error
   */
  static network(message: string, details?: unknown): AppError {
    return new AppError(message, ErrorCategory.NETWORK, {
      recoverable: true,
      details,
    });
  }

  /**
   * Create an API error
   */
  static api(message: string, statusCode: number, details?: unknown): AppError {
    return new AppError(message, ErrorCategory.API, {
      statusCode,
      recoverable: statusCode >= 500,
      details,
    });
  }

  /**
   * Create a validation error
   */
  static validation(message: string, details?: unknown): AppError {
    return new AppError(message, ErrorCategory.VALIDATION, {
      recoverable: false,
      details,
    });
  }

  /**
   * Create a timeout error
   */
  static timeout(message: string): AppError {
    return new AppError(message, ErrorCategory.TIMEOUT, {
      recoverable: true,
    });
  }

  /**
   * Create a stream error
   */
  static stream(message: string, details?: unknown): AppError {
    return new AppError(message, ErrorCategory.STREAM, {
      recoverable: true,
      details,
    });
  }
}

/**
 * Format an error for display
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Determine if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.recoverable;
  }
  return true;
}
