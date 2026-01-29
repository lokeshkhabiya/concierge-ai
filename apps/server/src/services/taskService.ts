import {
  taskRepository,
  taskStepRepository,
  type Task,
  type TaskStep,
} from "../database";
import { logger } from "../logger";
import type { ExecutionStep, AgentPhase } from "../types";

/**
 * Task service for managing task lifecycle
 */
export class TaskService {
  /**
   * Create a new task
   */
  async createTask(sessionId: string, taskType: string): Promise<Task> {
    return taskRepository.create(sessionId, taskType);
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    return taskRepository.findById(taskId);
  }

  /**
   * Get task with all related data
   */
  async getTaskWithDetails(taskId: string): Promise<{
    task: Task;
    steps: TaskStep[];
  } | null> {
    const task = await taskRepository.findById(taskId);
    if (!task) return null;

    const steps = await taskStepRepository.findByTask(taskId);

    return { task, steps };
  }

  /**
   * Update task phase
   */
  async updatePhase(taskId: string, phase: AgentPhase): Promise<Task> {
    return taskRepository.updatePhase(taskId, phase);
  }

  /**
   * Update task progress
   */
  async updateProgress(
    taskId: string,
    completedSteps: number,
    totalSteps: number
  ): Promise<void> {
    const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
    await taskRepository.updateProgress(taskId, progress);
  }

  /**
   * Complete a task with result
   */
  async completeTask(
    taskId: string,
    result?: Record<string, unknown>
  ): Promise<void> {
    await taskRepository.complete(taskId);

    if (result) {
      await taskRepository.mergeGatheredInfo(taskId, { result });
    }

    logger.info("Task completed", { taskId });
  }

  /**
   * Fail a task
   */
  async failTask(taskId: string, error: string): Promise<void> {
    await taskRepository.fail(taskId, error);
    logger.info("Task failed", { taskId, error });
  }

  /**
   * Create steps from execution plan
   */
  async createStepsFromPlan(
    taskId: string,
    plan: ExecutionStep[]
  ): Promise<number> {
    const steps = plan.map((step, index) => ({
      stepName: step.name,
      sequenceNumber: index + 1,
      inputData: {
        toolName: step.toolName,
        toolArgs: step.toolArgs,
        description: step.description,
      },
    }));

    return taskStepRepository.createMany(taskId, steps);
  }

  /**
   * Start a step
   */
  async startStep(stepId: string): Promise<TaskStep> {
    return taskStepRepository.start(stepId);
  }

  /**
   * Complete a step
   */
  async completeStep(
    stepId: string,
    outputData: Record<string, unknown>
  ): Promise<TaskStep> {
    return taskStepRepository.complete(stepId, outputData);
  }

  /**
   * Fail a step
   */
  async failStep(stepId: string, error: string): Promise<TaskStep> {
    return taskStepRepository.fail(stepId, error);
  }

  /**
   * Get task progress summary
   */
  async getProgressSummary(taskId: string): Promise<{
    phase: string;
    progress: number;
    completedSteps: number;
    totalSteps: number;
    isComplete: boolean;
  }> {
    const task = await taskRepository.findById(taskId);
    if (!task) {
      return {
        phase: "unknown",
        progress: 0,
        completedSteps: 0,
        totalSteps: 0,
        isComplete: false,
      };
    }

    const stepCounts = await taskStepRepository.getStatusCounts(taskId);

    return {
      phase: task.phase,
      progress: task.progress || 0,
      completedSteps: stepCounts.completed,
      totalSteps:
        stepCounts.pending +
        stepCounts.in_progress +
        stepCounts.completed +
        stepCounts.failed,
      isComplete: task.status === "completed",
    };
  }

  /**
   * Get tasks by session
   */
  async getTasksBySession(sessionId: string): Promise<Task[]> {
    return taskRepository.findBySession(sessionId);
  }
}

/**
 * Singleton task service instance
 */
export const taskService = new TaskService();
