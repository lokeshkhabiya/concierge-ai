import { HumanMessage } from "@langchain/core/messages";
import { hybridClassifyIntent } from "../intentClassifier";
import { sessionManager } from "../sessionManager";
import { logger } from "../../logger";
import { detectLocation } from "../../services/locationService";
import type {
  IntentType,
  OrchestratorResponse,
  StreamChunk,
} from "../../types";
import type { BaseAgentState } from "../../agents/state";

export type ChatRequestLocation = {
  lat: number;
  lng: number;
  address?: string;
};


class Orchestrator {

  async processMessage(
    userId: string,
    message: string,
    sessionId?: string,
    requestLocation?: ChatRequestLocation
  ): Promise<OrchestratorResponse> {
    const logContext = { userId, sessionId };

    try {
      const session = sessionId
        ? await sessionManager.getOrCreateSession(userId)
        : await sessionManager.getOrCreateSession(userId);

      const actualSessionId = session.id;
      logger.info("Processing message", { ...logContext, sessionId: actualSessionId });

      const intent = await hybridClassifyIntent(message);
      logger.debug("Intent classified", { intent, message: message.substring(0, 50) });

      if (intent === "unknown") {
        return {
          sessionId: actualSessionId,
          response:
            "I can help you with two things:\n\n" +
            "1. **Find medicine nearby** - Tell me what medicine you need and your location\n" +
            "2. **Plan a trip** - Tell me where you want to travel\n\n" +
            "What would you like to do?",
          requiresInput: true,
          isComplete: false,
        };
      }

      const task = await sessionManager.getOrCreateTask(actualSessionId, intent);
      logger.debug("Task retrieved", { taskId: task.id, taskType: intent });

      const graph = sessionManager.getGraph(actualSessionId, intent);

      const existingState = await sessionManager.restoreState(task.id);
      const inputState = await this.buildInputState(
        actualSessionId,
        task.id,
        message,
        existingState,
        intent,
        requestLocation
      );

      const result = await graph.invoke(inputState, {
        configurable: { thread_id: task.id },
      });

      const response = this.extractResponse(result);

      // Build persisted gatheredInfo with travel-specific state (same as continueTask)
      // Cast to Record to access travel-specific fields safely
      const resultAny = result as Record<string, unknown>;
      const persistedGatheredInfo: Record<string, unknown> = {
        ...result.gatheredInfo,
      };
      // Persist travel-specific state
      if (resultAny.awaitingRefinement !== undefined) {
        persistedGatheredInfo.awaitingRefinement = resultAny.awaitingRefinement;
      }
      if (resultAny.refinementFeedback !== undefined) {
        persistedGatheredInfo.refinementFeedback = resultAny.refinementFeedback;
      }
      if (resultAny.itinerary) {
        persistedGatheredInfo.itinerary = resultAny.itinerary;
      }
      if (resultAny.richPlan) {
        persistedGatheredInfo.richPlan = resultAny.richPlan;
      }
      if (resultAny.researchResults) {
        persistedGatheredInfo.researchResults = resultAny.researchResults;
      }
      if (resultAny.destination) {
        persistedGatheredInfo.destination = resultAny.destination;
      }

      await sessionManager.persistState(task.id, {
        phase: result.currentPhase,
        gatheredInfo: persistedGatheredInfo,
        executionPlan: result.executionPlan,
        progress: this.calculateProgress(result),
      });

      if (result.currentPhase === "complete") {
        await sessionManager.completeTask(task.id);
      }

      logger.info("Message processed", {
        sessionId: actualSessionId,
        taskId: task.id,
        phase: result.currentPhase,
        requiresInput: result.requiresHumanInput,
      });

      return {
        sessionId: actualSessionId,
        taskId: task.id,
        response: response,
        requiresInput: result.requiresHumanInput || false,
        inputRequest: result.humanInputRequest || undefined,
        isComplete: result.currentPhase === "complete",
        progress: this.calculateProgress(result),
      };
    } catch (error) {
      logger.error("Message processing failed", error as Error, logContext);

      return {
        sessionId: sessionId || "",
        response:
          "I encountered an error processing your request. Please try again.",
        requiresInput: true,
        isComplete: false,
      };
    }
  }

  async *processMessageStream(
    userId: string,
    message: string,
    sessionId?: string,
    requestLocation?: ChatRequestLocation
  ): AsyncGenerator<StreamChunk> {
    const logContext = { userId, sessionId };

    try {
      const session = await sessionManager.getOrCreateSession(userId);
      const actualSessionId = session.id;

      yield { type: "progress", message: "Session initialized" };

      const existingTask = await sessionManager.getActiveTaskForSession(actualSessionId);
      const intentFromExisting =
        existingTask &&
        (existingTask.taskType === "medicine" || existingTask.taskType === "travel")
          ? (existingTask.taskType as Exclude<IntentType, "unknown">)
          : null;

      let intent: IntentType;
      let task: Awaited<ReturnType<typeof sessionManager.getOrCreateTask>>;

      if (intentFromExisting) {
        intent = intentFromExisting;
        task = existingTask!;
        logger.debug("Continuing existing task", {
          taskId: task.id,
          intent,
          sessionId: actualSessionId,
        });
        yield { type: "progress", message: `Intent: ${intent} (existing task)`, data: { taskId: task.id } };
      } else {
        const classified = await hybridClassifyIntent(message);
        yield { type: "progress", message: `Intent: ${classified}` };

        if (classified === "unknown") {
          yield {
            type: "complete",
            message:
              "I can help you find medicine nearby or plan a trip. What would you like to do?",
          };
          return;
        }

        intent = classified;
        task = await sessionManager.getOrCreateTask(actualSessionId, intent);
        yield { type: "progress", message: "Task created", data: { taskId: task.id } };
      }

      const graph = sessionManager.getGraph(actualSessionId, intent);

      const existingState = await sessionManager.restoreState(task.id);
      const inputState = await this.buildInputState(
        actualSessionId,
        task.id,
        message,
        existingState,
        intent,
        requestLocation
      );

      const stream = await graph.stream(inputState, {
        configurable: { thread_id: task.id },
        streamMode: "values",
      });

      let finalState: BaseAgentState | null = null;

      for await (const state of stream) {
        finalState = state;

        yield {
          type: "progress",
          node: state.currentPhase,
          data: {
            phase: state.currentPhase,
            hasSufficientInfo: state.hasSufficientInfo,
            stepIndex: state.currentStepIndex,
            totalSteps: state.executionPlan?.length || 0,
          },
        };
      }

      if (finalState) {
        await sessionManager.persistState(task.id, {
          phase: finalState.currentPhase,
          gatheredInfo: finalState.gatheredInfo,
          executionPlan: finalState.executionPlan,
        });

        if (finalState.currentPhase === "complete") {
          await sessionManager.completeTask(task.id);
        }

        yield {
          type: "complete",
          message: this.extractResponse(finalState),
          data: {
            sessionId: actualSessionId,
            taskId: task.id,
            isComplete: finalState.currentPhase === "complete",
          },
        };
      }
    } catch (error) {
      logger.error("Stream processing failed", error as Error, logContext);
      yield {
        type: "error",
        message: "An error occurred. Please try again.",
      };
    }
  }

  async continueTask(
    taskId: string,
    userInput: string,
    selectedOption?: string
  ): Promise<OrchestratorResponse> {
    try {
      const session = await sessionManager.getSessionForTask(taskId);
      if (!session) {
        return {
          sessionId: "",
          response: "Task not found",
          requiresInput: false,
          isComplete: true,
        };
      }

      const existingState = await sessionManager.restoreState(taskId);
      if (!existingState) {
        return {
          sessionId: session.id,
          response: "Could not restore task state",
          requiresInput: false,
          isComplete: true,
        };
      }

      const taskInfo = await this.getTaskInfo(taskId);
      if (!taskInfo || taskInfo.taskType === "unknown") {
        return {
          sessionId: session.id,
          response: "Could not determine task type",
          requiresInput: false,
          isComplete: true,
        };
      }

      const graph = sessionManager.getGraph(session.id, taskInfo.taskType as Exclude<IntentType, "unknown">);

      const input = selectedOption || userInput;
      const inputState = await this.buildInputState(
        session.id,
        taskId,
        input,
        existingState,
        taskInfo.taskType as IntentType
      );

      // Handle travel task refinement feedback
      if (taskInfo.taskType === "travel") {
        // Check if we're resuming from awaiting refinement
        const isAwaitingRefinement =
          existingState.gatheredInfo?.awaitingRefinement === true ||
          (inputState as Record<string, unknown>).awaitingRefinement === true;

        // Use selectedOption or userInput as feedback
        const feedback = selectedOption || userInput;

        logger.debug("Travel task continuation check", {
          taskId,
          isAwaitingRefinement,
          feedback,
          existingStateAwaitingRefinement: existingState.gatheredInfo?.awaitingRefinement,
          inputStateAwaitingRefinement: (inputState as Record<string, unknown>).awaitingRefinement,
          existingPhase: existingState.phase,
        });

        if (isAwaitingRefinement && feedback) {
          logger.info("Setting refinement feedback and skipToConfirmation flag", { taskId, feedback });
          (inputState as Record<string, unknown>).refinementFeedback = feedback;
          (inputState as Record<string, unknown>).awaitingRefinement = false;
          // Set flag to skip directly to confirmItinerary
          (inputState as Record<string, unknown>).skipToConfirmation = true;
        }
      }

      const result = await graph.invoke(inputState, {
        configurable: { thread_id: taskId },
      });

      // Cast to Record to access travel-specific fields safely
      const resultAny = result as Record<string, unknown>;
      const persistedGatheredInfo: Record<string, unknown> = {
        ...result.gatheredInfo,
        // Persist travel-specific state
        awaitingRefinement: resultAny.awaitingRefinement || false,
        refinementFeedback: resultAny.refinementFeedback || null,
      };
      // Persist itinerary, rich plan, and research results for travel tasks
      if (resultAny.itinerary) {
        persistedGatheredInfo.itinerary = resultAny.itinerary;
      }
      if (resultAny.richPlan) {
        persistedGatheredInfo.richPlan = resultAny.richPlan;
      }
      if (resultAny.researchResults) {
        persistedGatheredInfo.researchResults = resultAny.researchResults;
      }
      if (resultAny.destination) {
        persistedGatheredInfo.destination = resultAny.destination;
      }

      logger.debug("Persisting state with gatheredInfo", {
        taskId,
        phase: result.currentPhase,
        awaitingRefinement: resultAny.awaitingRefinement,
        persistedAwaitingRefinement: persistedGatheredInfo.awaitingRefinement,
        requiresHumanInput: result.requiresHumanInput,
      });

      await sessionManager.persistState(taskId, {
        phase: result.currentPhase,
        gatheredInfo: persistedGatheredInfo,
        executionPlan: result.executionPlan,
        progress: this.calculateProgress(result),
      });

      if (result.currentPhase === "complete") {
        await sessionManager.completeTask(taskId);
      }

      return {
        sessionId: session.id,
        taskId,
        response: this.extractResponse(result),
        requiresInput: result.requiresHumanInput || false,
        inputRequest: result.humanInputRequest || undefined,
        isComplete: result.currentPhase === "complete",
        progress: this.calculateProgress(result),
      };
    } catch (error) {
      logger.error("Continue task failed", error as Error, { taskId });

      return {
        sessionId: "",
        response: "Failed to continue task. Please try again.",
        requiresInput: true,
        isComplete: false,
      };
    }
  }

  private async buildInputState(
    sessionId: string,
    taskId: string,
    message: string,
    existingState: {
      phase: string;
      gatheredInfo: Record<string, unknown>;
      executionPlan: unknown;
    } | null,
    intent?: IntentType,
    requestLocation?: ChatRequestLocation
  ): Promise<Record<string, unknown>> {
    const baseState: Record<string, unknown> = {
      sessionId,
      taskId,
      messages: [new HumanMessage(message)],
    };

    if (existingState) {
      const restoredState: Record<string, unknown> = {
        ...baseState,
        currentPhase: existingState.phase,
        gatheredInfo: existingState.gatheredInfo,
        executionPlan: existingState.executionPlan,
        requiresHumanInput: false,
        humanInputRequest: null,
      };

      // Restore travel-specific state from gatheredInfo to top level
      if (existingState.gatheredInfo) {
        if (existingState.gatheredInfo.awaitingRefinement !== undefined) {
          restoredState.awaitingRefinement = existingState.gatheredInfo.awaitingRefinement;
        }
        if (existingState.gatheredInfo.itinerary !== undefined) {
          restoredState.itinerary = existingState.gatheredInfo.itinerary;
        }
        if (existingState.gatheredInfo.richPlan !== undefined) {
          restoredState.richPlan = existingState.gatheredInfo.richPlan;
        }
        if (existingState.gatheredInfo.researchResults !== undefined) {
          restoredState.researchResults = existingState.gatheredInfo.researchResults;
        }
        if (existingState.gatheredInfo.destination !== undefined) {
          restoredState.destination = existingState.gatheredInfo.destination;
        }
      }

      return restoredState;
    }

    if (intent === "medicine") {
      const location = await detectLocation(
        requestLocation
          ? {
              lat: requestLocation.lat,
              lng: requestLocation.lng,
              address: requestLocation.address,
            }
          : undefined
      );
      if (location) {
        baseState.gatheredInfo = { location };
      }
    }

    return baseState;
  }

  private extractResponse(result: BaseAgentState): string {
    if (result.finalResponse) {
      return result.finalResponse;
    }

    if (result.humanInputRequest?.message) {
      return result.humanInputRequest.message;
    }

    const lastMessage = result.messages?.[result.messages.length - 1];
    if (lastMessage && lastMessage._getType() === "ai") {
      return lastMessage.content as string;
    }

    switch (result.currentPhase) {
      case "clarification":
        return "I need some more information to help you. Could you provide more details?";
      case "planning":
        return "Creating a plan for your request...";
      case "execution":
        return "Working on your request...";
      case "validation":
        return "Verifying the results...";
      case "complete":
        return "Your request has been completed!";
      case "error":
        return result.error || "An error occurred. Please try again.";
      default:
        return "Processing your request...";
    }
  }

  private calculateProgress(result: BaseAgentState): number {
    const phaseProgress: Record<string, number> = {
      clarification: 10,
      gathering: 20,
      planning: 30,
      execution: 60,
      validation: 90,
      complete: 100,
      error: 0,
    };

    let progress = phaseProgress[result.currentPhase] || 0;

    if (
      result.currentPhase === "execution" &&
      result.executionPlan &&
      result.executionPlan.length > 0
    ) {
      const stepProgress =
        (result.currentStepIndex / result.executionPlan.length) * 30;
      progress += stepProgress;
    }

    return Math.min(100, progress);
  }

  private async getTaskInfo(
    taskId: string
  ): Promise<{ taskType: string } | null> {
    const { taskRepository } = await import("../../database");
    const task = await taskRepository.findById(taskId);
    return task ? { taskType: task.taskType } : null;
  }
}

export const orchestrator = new Orchestrator();
