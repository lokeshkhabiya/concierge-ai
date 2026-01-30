import type { Request, Response, NextFunction } from "express";
import { logger } from "../../logger";
import type { ApiError } from "../../validation";

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

export function badRequest(
	message: string,
	details?: unknown
): HttpError {
	return new HttpError(400, message, "BAD_REQUEST", details);
}

export function notFound(message: string = "Resource not found"): HttpError {
	return new HttpError(404, message, "NOT_FOUND");
}

export function internalError(
	message: string = "Internal server error"
): HttpError {
	return new HttpError(500, message, "INTERNAL_ERROR");
}

export function errorHandler(
	err: Error,
	_req: Request,
	res: Response,
	_next: NextFunction
): void {
	logger.error("Unhandled error", err);

	if (err instanceof HttpError) {
		const response: ApiError = {
			error: err.message,
			code: err.code,
			details: err.details,
		};

		res.status(err.statusCode).json(response);
		return;
	}

	const response: ApiError = {
		error: "Internal server error",
		code: "INTERNAL_ERROR",
	};

	if (process.env.NODE_ENV !== "production") {
		response.details = {
			name: err.name,
			message: err.message,
			stack: err.stack,
		};
	}

	res.status(500).json(response);
}
