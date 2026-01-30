import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config";

export const llm = new ChatOpenAI({
  model: config.llm.model,
  temperature: config.llm.temperature,
  maxTokens: config.llm.maxTokens,
});

export const streamingLlm = new ChatOpenAI({
  model: config.llm.model,
  temperature: config.llm.temperature,
  maxTokens: config.llm.maxTokens,
  streaming: true,
});

export const classificationLlm = new ChatOpenAI({
  model: config.llm.model,
  temperature: 1,
  maxTokens: 100,
});

export function createLlm(options: {
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  timeout?: number;
}): ChatOpenAI {
  return new ChatOpenAI({
    model: config.llm.model,
    temperature: options.temperature ?? config.llm.temperature,
    maxTokens: options.maxTokens ?? config.llm.maxTokens,
    streaming: options.streaming ?? false,
    timeout: options.timeout ?? 120000,
  });
}
