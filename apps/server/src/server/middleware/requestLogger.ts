import type { Request, Response, NextFunction } from "express";
import { logger } from "../../logger";

/**
 * Request logging middleware
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Log request start
  const logData = {
    method: req.method,
    path: req.path,
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    ip: req.ip,
    userAgent: req.get("user-agent"),
  };

  logger.debug("Request started", logData);

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - startTime;

    logger.request(req.method, req.path, res.statusCode, duration);
  });

  next();
}

/**
 * Skip logging for certain paths (e.g., health checks)
 */
const skipPaths = ["/health", "/favicon.ico"];

/**
 * Conditional request logger that skips certain paths
 */
export function conditionalRequestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (skipPaths.includes(req.path)) {
    next();
    return;
  }

  requestLogger(req, res, next);
}
