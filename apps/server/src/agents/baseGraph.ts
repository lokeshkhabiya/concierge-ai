import { END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
import { BaseAgentStateAnnotation, type BaseAgentState } from "./state";
import type { AgentPhase } from "../types";
import { logger } from "../logger";

/**
 * Node function type
 */
type NodeFunction = (state: BaseAgentState) => Promise<Partial<BaseAgentState>>;

/**
 * Configuration for building a graph
 */
export interface GraphConfig {
  clarificationNode: NodeFunction;
  planningNode: NodeFunction;
  executionNode: NodeFunction;
  validationNode: NodeFunction;
  additionalNodes?: Record<string, NodeFunction>;
}

/**
 * Create a base state graph with the standard flow:
 * START -> clarification -> planning -> execution -> validation -> END
 *
 * With conditional edges:
 * - clarification: goes to planning if sufficient info, else END (waits for human input)
 * - execution: loops until all steps done, then to validation
 * - validation: goes to complete (END) or back to planning for refinement
 */
export function createBaseGraph(config: GraphConfig) {
  const {
    clarificationNode,
    planningNode,
    executionNode,
    validationNode,
    additionalNodes = {},
  } = config;

  // Create the state graph
  const graph = new StateGraph(BaseAgentStateAnnotation)
    // Add core nodes
    .addNode("clarification", clarificationNode)
    .addNode("planning", planningNode)
    .addNode("execution", executionNode)
    .addNode("validation", validationNode);

  // Add any additional nodes
  for (const [name, node] of Object.entries(additionalNodes)) {
    graph.addNode(name, node);
  }

  // Add edges
  graph
    // Start with clarification
    .addEdge(START, "clarification")

    // Clarification: check if we have enough info
    .addConditionalEdges("clarification", (state: BaseAgentState) => {
      if (state.error) {
        logger.debug("Clarification error, ending", { error: state.error });
        return END;
      }

      if (state.hasSufficientInfo) {
        logger.debug("Sufficient info, moving to planning");
        return "planning";
      }

      if (state.requiresHumanInput) {
        logger.debug("Requires human input, pausing");
        return END; // Pause for human input
      }

      // Continue clarification
      return "clarification";
    })

    // Planning goes to execution
    .addConditionalEdges("planning", (state: BaseAgentState) => {
      if (state.error) {
        logger.debug("Planning error, ending", { error: state.error });
        return END;
      }

      return "execution";
    })

    // Execution: loop until all steps done
    .addConditionalEdges("execution", (state: BaseAgentState) => {
      if (state.error) {
        logger.debug("Execution error, ending", { error: state.error });
        return END;
      }

      const { executionPlan, currentStepIndex } = state;

      // Check if all steps are done
      if (!executionPlan || currentStepIndex >= executionPlan.length) {
        logger.debug("All steps done, moving to validation");
        return "validation";
      }

      // Continue execution
      logger.debug(`Continuing execution: step ${currentStepIndex + 1}/${executionPlan.length}`);
      return "execution";
    })

    // Validation: complete or refine
    .addConditionalEdges("validation", (state: BaseAgentState) => {
      if (state.error) {
        logger.debug("Validation error, ending", { error: state.error });
        return END;
      }

      const phase = state.currentPhase as AgentPhase;

      if (phase === "complete") {
        logger.debug("Validation complete");
        return END;
      }

      if (state.requiresHumanInput) {
        logger.debug("Validation requires human input");
        return END;
      }

      if (phase === "planning") {
        logger.debug("Validation needs refinement, back to planning");
        return "planning";
      }

      if (phase === "clarification") {
        logger.debug("Validation needs clarification");
        return "clarification";
      }

      // Default: end
      return END;
    });

  return graph;
}

/**
 * Compile a graph with memory saver for checkpointing
 */
export function compileGraph(
  graph: ReturnType<typeof createBaseGraph>,
  checkpointSaver?: MemorySaver
) {
  const saver = checkpointSaver || new MemorySaver();

  return graph.compile({
    checkpointer: saver,
  });
}

/**
 * Type for compiled graph
 */
export type CompiledGraph = ReturnType<typeof compileGraph>;

/**
 * Create and compile a graph in one step
 */
export function createCompiledGraph(config: GraphConfig): CompiledGraph {
  const graph = createBaseGraph(config);
  return compileGraph(graph);
}
