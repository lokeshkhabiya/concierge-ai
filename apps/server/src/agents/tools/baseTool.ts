import { StructuredTool } from "@langchain/core/tools";
import type { z } from "zod";
import { logger, type LogContext } from "../../logger";

export abstract class BaseTool<
	T extends z.ZodObject<z.ZodRawShape>
> extends StructuredTool {
	abstract name: string;
	abstract description: string;
	abstract schema: T;

	protected logContext: LogContext = {};

	setContext(context: LogContext): this {
		this.logContext = context;
		return this;
	}

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

			return JSON.stringify({
				error: true,
				message: (error as Error).message,
				tool: this.name,
			});
		}
	}

	protected abstract execute(input: z.infer<T>): Promise<string>;

	protected sanitizeInput(input: z.infer<T>): Record<string, unknown> {
		return input as Record<string, unknown>;
	}

	protected getResultPreview(result: string): string {
		if (result.length > 200) {
			return result.substring(0, 200) + "...";
		}
		return result;
	}

	protected success<D>(data: D): string {
		return JSON.stringify({
			success: true,
			data,
		});
	}

	protected error(message: string, details?: unknown): string {
		return JSON.stringify({
			success: false,
			error: message,
			details,
		});
	}
}

export type ToolInput<T extends BaseTool<z.ZodObject<z.ZodRawShape>>> =
	T extends BaseTool<infer S> ? z.infer<S> : never;
