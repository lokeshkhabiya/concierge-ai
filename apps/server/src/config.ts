import { env } from "@pokus/env/server";

export const config = {
  server: {
    port: 8000,
    corsOrigin: env.CORS_ORIGIN,
  },

  llm: {
    provider: "openai" as const,
    model: "gpt-5",
    temperature: 1,
    maxTokens: 8192,
  },

  agents: {
    maxIterations: 10,
    timeoutMs: 120000, // 2 minutes
    defaultSearchRadius: 5000, // meters
    maxPharmacyCalls: 5,
    maxRetries: 3,
  },

  database: {
    url: env.DATABASE_URL,
    connectionPoolSize: 10,
  },

  streaming: {
    enabled: true,
    heartbeatIntervalMs: 15000,
  },

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
