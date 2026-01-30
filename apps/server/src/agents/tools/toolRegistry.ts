import type { StructuredTool } from "@langchain/core/tools";
import { WebSearchTool } from "./webSearchTool";
import { GeocodingTool } from "./geocodingTool";
import { CallSimulatorTool } from "./callSimulator";
import { BookingSimulatorTool } from "./bookingSimulator";
import type { IntentType } from "../../types";
import { logger } from "../../logger";

const AGENT_TOOL_CONFIG: Record<Exclude<IntentType, "unknown">, string[]> = {
	medicine: ["web_search", "geocoding", "call_pharmacy"],
	travel: ["web_search", "geocoding", "book_activity"],
};

class ToolRegistry {
	private tools: Map<string, StructuredTool> = new Map();
	private initialized = false;

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

	registerTool(tool: StructuredTool): void {
		if (this.tools.has(tool.name)) {
			logger.warn(`Tool ${tool.name} already registered, overwriting`);
		}
		this.tools.set(tool.name, tool);
		logger.debug(`Registered tool: ${tool.name}`);
	}

	getTool(name: string): StructuredTool | undefined {
		this.ensureInitialized();
		return this.tools.get(name);
	}

	getToolOrThrow(name: string): StructuredTool {
		const tool = this.getTool(name);
		if (!tool) {
			throw new Error(`Tool not found: ${name}`);
		}
		return tool;
	}

	listTools(): StructuredTool[] {
		this.ensureInitialized();
		return Array.from(this.tools.values());
	}

	listToolNames(): string[] {
		this.ensureInitialized();
		return Array.from(this.tools.keys());
	}

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

	getToolNamesForAgent(agentType: Exclude<IntentType, "unknown">): string[] {
		return AGENT_TOOL_CONFIG[agentType] || [];
	}

	getToolDescriptions(): Array<{ name: string; description: string }> {
		this.ensureInitialized();

		return Array.from(this.tools.values()).map((tool) => ({
			name: tool.name,
			description: tool.description,
		}));
	}

	getToolDescriptionsForAgent(
		agentType: Exclude<IntentType, "unknown">
	): Array<{ name: string; description: string }> {
		return this.getToolsForAgent(agentType).map((tool) => ({
			name: tool.name,
			description: tool.description,
		}));
	}

	hasTool(name: string): boolean {
		this.ensureInitialized();
		return this.tools.has(name);
	}

	removeTool(name: string): boolean {
		return this.tools.delete(name);
	}

	clear(): void {
		this.tools.clear();
		this.initialized = false;
	}

	private ensureInitialized(): void {
		if (!this.initialized) {
			this.initialize();
		}
	}
}

export const toolRegistry = new ToolRegistry();

toolRegistry.initialize();
