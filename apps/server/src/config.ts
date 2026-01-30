import { env } from "@pokus/env/server";

/**
 * Application configuration
 */
export const config = {
  /**
   * Server configuration
   */
  server: {
    port: 8000,
    corsOrigin: env.CORS_ORIGIN,
  },

  /**
   * LLM configuration
   */
  llm: {
    provider: "openai" as const,
    model: "gpt-5-mini",
    temperature: 1,
    maxTokens: 8192,
  },

  /**
   * Agent configuration
   */
  agents: {
    maxIterations: 10,
    timeoutMs: 120000, // 2 minutes
    defaultSearchRadius: 5000, // meters
    maxPharmacyCalls: 5,
    maxRetries: 3,
  },

  /**
   * Database configuration
   */
  database: {
    url: env.DATABASE_URL,
    connectionPoolSize: 10,
  },

  /**
   * Streaming configuration
   */
  streaming: {
    enabled: true,
    heartbeatIntervalMs: 15000,
  },

  /**
   * Tool configuration
   */
  tools: {
    webSearch: {
      maxResults: 10,
      timeout: 10000,
    },
    geocoding: {
      timeout: 5000,
    },
    callSimulator: {
      minDelayMs: 1000,
      maxDelayMs: 3000,
    },
    bookingSimulator: {
      confirmationRate: 0.9,
    },
  },
} as const;

export type Config = typeof config;
