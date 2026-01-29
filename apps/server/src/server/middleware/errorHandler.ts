import type { Request, Response, NextFunction } from "express";
import { logger } from "../../logger";
import type { ApiError } from "../../validation";

/**
 * Custom error class with status code
 */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Create a bad request error
 */
export function badRequest(
  message: string,
  details?: unknown
): HttpError {
  return new HttpError(400, message, "BAD_REQUEST", details);
}

/**
 * Create a not found error
 */
export function notFound(message: string = "Resource not found"): HttpError {
  return new HttpError(404, message, "NOT_FOUND");
}

/**
 * Create an internal server error
 */
export function internalError(
  message: string = "Internal server error"
): HttpError {
  return new HttpError(500, message, "INTERNAL_ERROR");
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error("Unhandled error", err);

  // Handle HttpError
  if (err instanceof HttpError) {
    const response: ApiError = {
      error: err.message,
      code: err.code,
      details: err.details,
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle other errors
  const response: ApiError = {
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  };

  // Include error details in development
  if (process.env.NODE_ENV !== "production") {
    response.details = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  res.status(500).json(response);
}
