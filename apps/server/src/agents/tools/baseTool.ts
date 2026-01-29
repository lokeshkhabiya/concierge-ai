import { StructuredTool } from "@langchain/core/tools";
import type { z } from "zod";
import { logger, type LogContext } from "../../logger";

/**
 * Abstract base tool class with built-in logging and error handling
 */
export abstract class BaseTool<
  T extends z.ZodObject<z.ZodRawShape>
> extends StructuredTool {
  abstract name: string;
  abstract description: string;
  abstract schema: T;

  /**
   * Context for logging (can be set before invocation)
   */
  protected logContext: LogContext = {};

  /**
   * Set logging context for this tool invocation
   */
  setContext(context: LogContext): this {
    this.logContext = context;
    return this;
  }

  /**
   * Main entry point - wraps _call with logging and error handling
   */
  async _call(input: z.infer<T>): Promise<string> {
    const startTime = Date.now();

    logger.toolExecution(this.name, "start", this.logContext, {
      input: this.sanitizeInput(input),
    });

    try {
      const result = await this.execute(input);
      const duration = Date.now() - startTime;

      logger.toolExecution(this.name, "complete", this.logContext, {
        duration,
        resultPreview: this.getResultPreview(result),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.toolExecution(this.name, "error", this.logContext, {
        duration,
        error: (error as Error).message,
      });

      // Return error as JSON string for agent to handle
      return JSON.stringify({
        error: true,
        message: (error as Error).message,
        tool: this.name,
      });
    }
  }

  /**
   * Implement this method in subclasses to perform the actual tool operation
   */
  protected abstract execute(input: z.infer<T>): Promise<string>;

  /**
   * Sanitize input for logging (remove sensitive data)
   */
  protected sanitizeInput(input: z.infer<T>): Record<string, unknown> {
    // Override in subclasses to redact sensitive fields
    return input as Record<string, unknown>;
  }

  /**
   * Get a preview of the result for logging
   */
  protected getResultPreview(result: string): string {
    if (result.length > 200) {
      return result.substring(0, 200) + "...";
    }
    return result;
  }

  /**
   * Helper to create a successful response
   */
  protected success<D>(data: D): string {
    return JSON.stringify({
      success: true,
      data,
    });
  }

  /**
   * Helper to create an error response
   */
  protected error(message: string, details?: unknown): string {
    return JSON.stringify({
      success: false,
      error: message,
      details,
    });
  }
}

/**
 * Type helper for tool schemas
 */
export type ToolInput<T extends BaseTool<z.ZodObject<z.ZodRawShape>>> =
  T extends BaseTool<infer S> ? z.infer<S> : never;
