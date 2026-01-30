import { ChatOpenAI } from "@langchain/openai";
import { config } from "../config";

export const llm = new ChatOpenAI({
  model: config.llm.model,
  temperature: config.llm.temperature,
  maxTokens: config.llm.maxTokens,
});

/**
 * Planning LLM - uses gpt-5 for complex planning tasks
 */
export const planningLlm = new ChatOpenAI({
  model: config.llm.planningModel,
  temperature: config.llm.temperature,
  maxTokens: config.llm.maxTokens,
});

/**
 * Streaming-enabled LLM client for real-time responses
 */
export const streamingLlm = new ChatOpenAI({
  model: config.llm.model,
  temperature: config.llm.temperature,
  maxTokens: config.llm.maxTokens,
  streaming: true,
});

export const classificationLlm = new ChatOpenAI({
  model: config.llm.model,
  temperature: 1,
  maxTokens: 1000,
});

export function createLlm(options: {
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  timeout?: number;
  usePlanningModel?: boolean;
}): ChatOpenAI {
  return new ChatOpenAI({
    model: options.usePlanningModel ? config.llm.planningModel : config.llm.model,
    temperature: options.temperature ?? config.llm.temperature,
    maxTokens: options.maxTokens ?? config.llm.maxTokens,
    streaming: options.streaming ?? false,
    timeout: options.timeout ?? 120000,
  });
}
