import type { AgentPhase, IntentType } from "./types";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  sessionId?: string;
  taskId?: string;
  userId?: string;
  agentType?: IntentType;
  phase?: AgentPhase;
  node?: string;
  tool?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  data?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

function formatLogEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.message,
  ];

  if (entry.context) {
    const contextStr = Object.entries(entry.context)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");
    if (contextStr) {
      parts.push(`| ${contextStr}`);
    }
  }

  return parts.join(" ");
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  data?: unknown,
  error?: Error
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    data,
    error: error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : undefined,
  };
}

function logToConsole(entry: LogEntry): void {
  const formatted = formatLogEntry(entry);

  switch (entry.level) {
    case "debug":
      if (process.env.NODE_ENV !== "production") {
        console.debug(formatted, entry.data || "");
      }
      break;
    case "info":
      console.info(formatted, entry.data ? JSON.stringify(entry.data) : "");
      break;
    case "warn":
      console.warn(formatted, entry.data || "");
      break;
    case "error":
      console.error(formatted, entry.error || entry.data || "");
      break;
  }
}

export const logger = {
  debug(message: string, data?: unknown, context?: LogContext): void {
    const entry = createLogEntry("debug", message, context, data);
    logToConsole(entry);
  },

  info(message: string, context?: LogContext): void {
    const entry = createLogEntry("info", message, context);
    logToConsole(entry);
  },

  warn(message: string, data?: unknown, context?: LogContext): void {
    const entry = createLogEntry("warn", message, context, data);
    logToConsole(entry);
  },

  error(message: string, error: Error, context?: LogContext): void {
    const entry = createLogEntry("error", message, context, undefined, error);
    logToConsole(entry);
  },

  agentStep(
    step: string,
    phase: AgentPhase,
    context: LogContext,
    data?: unknown
  ): void {
    const entry = createLogEntry(
      "info",
      `Agent step: ${step}`,
      { ...context, phase },
      data
    );
    logToConsole(entry);
  },

  toolExecution(
    toolName: string,
    action: "start" | "complete" | "error",
    context: LogContext,
    data?: unknown
  ): void {
    const entry = createLogEntry(
      action === "error" ? "error" : "info",
      `Tool ${toolName}: ${action}`,
      { ...context, tool: toolName },
      data
    );
    logToConsole(entry);
  },

  request(
    method: string,
    path: string,
    statusCode?: number,
    durationMs?: number
  ): void {
    const entry = createLogEntry("info", `${method} ${path}`, undefined, {
      statusCode,
      durationMs,
    });
    logToConsole(entry);
  },

  child(context: LogContext): Logger {
    const parentLogger = this;
    return {
      debug: (message: string, data?: unknown, ctx?: LogContext) =>
        parentLogger.debug(message, data, { ...context, ...ctx }),
      info: (message: string, ctx?: LogContext) =>
        parentLogger.info(message, { ...context, ...ctx }),
      warn: (message: string, data?: unknown, ctx?: LogContext) =>
        parentLogger.warn(message, data, { ...context, ...ctx }),
      error: (message: string, error: Error, ctx?: LogContext) =>
        parentLogger.error(message, error, { ...context, ...ctx }),
      agentStep: (step: string, phase: AgentPhase, ctx: LogContext, data?: unknown) =>
        parentLogger.agentStep(step, phase, { ...context, ...ctx }, data),
      toolExecution: (toolName: string, action: "start" | "complete" | "error", ctx: LogContext, data?: unknown) =>
        parentLogger.toolExecution(toolName, action, { ...context, ...ctx }, data),
      request: parentLogger.request,
      child: (ctx: LogContext) => parentLogger.child({ ...context, ...ctx }),
    };
  },
};

export interface Logger {
  debug(message: string, data?: unknown, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, data?: unknown, context?: LogContext): void;
  error(message: string, error: Error, context?: LogContext): void;
  agentStep(step: string, phase: AgentPhase, context: LogContext, data?: unknown): void;
  toolExecution(toolName: string, action: "start" | "complete" | "error", context: LogContext, data?: unknown): void;
  request(method: string, path: string, statusCode?: number, durationMs?: number): void;
  child(context: LogContext): Logger;
}
