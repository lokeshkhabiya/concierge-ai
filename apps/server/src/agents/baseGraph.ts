import { END, START, StateGraph, MemorySaver } from "@langchain/langgraph";
import { BaseAgentStateAnnotation, type BaseAgentState } from "./state";
import type { AgentPhase } from "../types";
import { logger } from "../logger";

type NodeFunction = (state: BaseAgentState) => Promise<Partial<BaseAgentState>>;

export interface GraphConfig {
  clarificationNode: NodeFunction;
  planningNode: NodeFunction;
  executionNode: NodeFunction;
  validationNode: NodeFunction;
  additionalNodes?: Record<string, NodeFunction>;
}

export function createBaseGraph(config: GraphConfig) {
  const {
    clarificationNode,
    planningNode,
    executionNode,
    validationNode,
    additionalNodes = {},
  } = config;

  const graph = new StateGraph(BaseAgentStateAnnotation)
    .addNode("clarification", clarificationNode)
    .addNode("planning", planningNode)
    .addNode("execution", executionNode)
    .addNode("validation", validationNode);

  for (const [name, node] of Object.entries(additionalNodes)) {
    graph.addNode(name, node);
  }

  graph
    .addEdge(START, "clarification")

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
        return END;
      }

      return "clarification";
    })

    .addConditionalEdges("planning", (state: BaseAgentState) => {
      if (state.error) {
        logger.debug("Planning error, ending", { error: state.error });
        return END;
      }

      return "execution";
    })

    .addConditionalEdges("execution", (state: BaseAgentState) => {
      if (state.error) {
        logger.debug("Execution error, ending", { error: state.error });
        return END;
      }

      const { executionPlan, currentStepIndex } = state;

      if (!executionPlan || currentStepIndex >= executionPlan.length) {
        logger.debug("All steps done, moving to validation");
        return "validation";
      }

      logger.debug(`Continuing execution: step ${currentStepIndex + 1}/${executionPlan.length}`);
      return "execution";
    })

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

      return END;
    });

  return graph;
}

export function compileGraph(
  graph: ReturnType<typeof createBaseGraph>,
  checkpointSaver?: MemorySaver
) {
  const saver = checkpointSaver || new MemorySaver();

  return graph.compile({
    checkpointer: saver,
  });
}
  
export type CompiledGraph = ReturnType<typeof compileGraph>;

export function createCompiledGraph(config: GraphConfig): CompiledGraph {
  const graph = createBaseGraph(config);
  return compileGraph(graph);
}
