import type { StructuredTool } from "@langchain/core/tools";
import { WebSearchTool } from "./webSearchTool";
import { GeocodingTool } from "./geocodingTool";
import { CallSimulatorTool } from "./callSimulator";
import { BookingSimulatorTool } from "./bookingSimulator";
import type { IntentType } from "../../types";
import { logger } from "../../logger";

/**
 * Tool configuration for different agent types
 */
const AGENT_TOOL_CONFIG: Record<Exclude<IntentType, "unknown">, string[]> = {
  medicine: ["web_search", "geocoding", "call_pharmacy"],
  travel: ["web_search", "geocoding", "book_activity"],
};

/**
 * Tool registry for managing and accessing tools
 */
class ToolRegistry {
  private tools: Map<string, StructuredTool> = new Map();
  private initialized = false;

  /**
   * Initialize the registry with default tools
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.registerTool(new WebSearchTool());
    this.registerTool(new GeocodingTool());
    this.registerTool(new CallSimulatorTool());
    this.registerTool(new BookingSimulatorTool());

    this.initialized = true;
    logger.info("Tool registry initialized", { toolCount: this.tools.size });
  }

  /**
   * Register a tool in the registry
   */
  registerTool(tool: StructuredTool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool ${tool.name} already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): StructuredTool | undefined {
    this.ensureInitialized();
    return this.tools.get(name);
  }

  /**
   * Get a tool by name, throwing if not found
   */
  getToolOrThrow(name: string): StructuredTool {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool;
  }

  /**
   * List all registered tools
   */
  listTools(): StructuredTool[] {
    this.ensureInitialized();
    return Array.from(this.tools.values());
  }

  /**
   * List all tool names
   */
  listToolNames(): string[] {
    this.ensureInitialized();
    return Array.from(this.tools.keys());
  }

  /**
   * Get tools for a specific agent type
   */
  getToolsForAgent(agentType: Exclude<IntentType, "unknown">): StructuredTool[] {
    this.ensureInitialized();

    const toolNames = AGENT_TOOL_CONFIG[agentType];
    if (!toolNames) {
      logger.warn(`No tools configured for agent type: ${agentType}`);
      return [];
    }

    return toolNames
      .map((name) => this.tools.get(name))
      .filter((tool): tool is StructuredTool => tool !== undefined);
  }

  /**
   * Get tool names for a specific agent type
   */
  getToolNamesForAgent(agentType: Exclude<IntentType, "unknown">): string[] {
    return AGENT_TOOL_CONFIG[agentType] || [];
  }

  /**
   * Get tool descriptions for documentation
   */
  getToolDescriptions(): Array<{ name: string; description: string }> {
    this.ensureInitialized();

    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * Get tool descriptions for a specific agent type
   */
  getToolDescriptionsForAgent(
    agentType: Exclude<IntentType, "unknown">
  ): Array<{ name: string; description: string }> {
    return this.getToolsForAgent(agentType).map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    this.ensureInitialized();
    return this.tools.has(name);
  }

  /**
   * Remove a tool from the registry
   */
  removeTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Clear all tools from the registry
   */
  clear(): void {
    this.tools.clear();
    this.initialized = false;
  }

  /**
   * Ensure the registry is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }
}

/**
 * Singleton instance of the tool registry
 */
export const toolRegistry = new ToolRegistry();

// Initialize on import
toolRegistry.initialize();
