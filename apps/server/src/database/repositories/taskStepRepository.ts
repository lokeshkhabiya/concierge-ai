import { prisma, type InputJsonValue, type TaskStep } from "..";

/**
 * Task step repository for tracking execution steps
 */
export const taskStepRepository = {
  /**
   * Create a new task step
   */
  async create(
    taskId: string,
    stepName: string,
    sequenceNumber: number,
    inputData?: Record<string, unknown>
  ): Promise<TaskStep> {
    return prisma.taskStep.create({
      data: {
        taskId,
        stepName,
        sequenceNumber,
        status: "pending",
        inputData: inputData as InputJsonValue | undefined,
      },
    });
  },

  /**
   * Create multiple steps at once
   */
  async createMany(
    taskId: string,
    steps: Array<{
      stepName: string;
      sequenceNumber: number;
      inputData?: Record<string, unknown>;
    }>
  ): Promise<number> {
    const result = await prisma.taskStep.createMany({
      data: steps.map((step) => ({
        taskId,
        stepName: step.stepName,
        sequenceNumber: step.sequenceNumber,
        status: "pending",
        inputData: step.inputData as InputJsonValue | undefined,
      })),
    });

    return result.count;
  },

  /**
   * Find step by ID
   */
  async findById(id: string): Promise<TaskStep | null> {
    return prisma.taskStep.findUnique({
      where: { id },
    });
  },

  /**
   * Find all steps for a task
   */
  async findByTask(taskId: string): Promise<TaskStep[]> {
    return prisma.taskStep.findMany({
      where: { taskId },
      orderBy: { sequenceNumber: "asc" },
    });
  },

  /**
   * Find step by task and sequence number
   */
  async findByTaskAndSequence(
    taskId: string,
    sequenceNumber: number
  ): Promise<TaskStep | null> {
    return prisma.taskStep.findFirst({
      where: {
        taskId,
        sequenceNumber,
      },
    });
  },

  /**
   * Get next pending step for a task
   */
  async findNextPending(taskId: string): Promise<TaskStep | null> {
    return prisma.taskStep.findFirst({
      where: {
        taskId,
        status: "pending",
      },
      orderBy: { sequenceNumber: "asc" },
    });
  },

  /**
   * Update step status
   */
  async updateStatus(id: string, status: string): Promise<TaskStep> {
    const updateData: { status: string; startedAt?: Date; completedAt?: Date } = {
      status,
    };

    if (status === "in_progress") {
      updateData.startedAt = new Date();
    } else if (status === "completed" || status === "failed") {
      updateData.completedAt = new Date();
    }

    return prisma.taskStep.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Start a step
   */
  async start(id: string): Promise<TaskStep> {
    return prisma.taskStep.update({
      where: { id },
      data: {
        status: "in_progress",
        startedAt: new Date(),
      },
    });
  },

  /**
   * Complete a step with output
   */
  async complete(
    id: string,
    outputData: Record<string, unknown>
  ): Promise<TaskStep> {
    return prisma.taskStep.update({
      where: { id },
      data: {
        status: "completed",
        outputData: outputData as InputJsonValue,
        completedAt: new Date(),
      },
    });
  },

  /**
   * Mark step as failed
   */
  async fail(id: string, error: string): Promise<TaskStep> {
    return prisma.taskStep.update({
      where: { id },
      data: {
        status: "failed",
        outputData: { error } as InputJsonValue,
        completedAt: new Date(),
      },
    });
  },

  /**
   * Set output data for a step
   */
  async setOutput(
    id: string,
    outputData: Record<string, unknown>
  ): Promise<TaskStep> {
    return prisma.taskStep.update({
      where: { id },
      data: {
        outputData: outputData as InputJsonValue,
      },
    });
  },

  /**
   * Get count of steps by status for a task
   */
  async getStatusCounts(
    taskId: string
  ): Promise<{ pending: number; in_progress: number; completed: number; failed: number }> {
    const steps = await prisma.taskStep.findMany({
      where: { taskId },
      select: { status: true },
    });

    return steps.reduce(
      (acc, step) => {
        const status = step.status as keyof typeof acc;
        if (status in acc) {
          acc[status]++;
        }
        return acc;
      },
      { pending: 0, in_progress: 0, completed: 0, failed: 0 }
    );
  },

  /**
   * Delete all steps for a task
   */
  async deleteByTask(taskId: string): Promise<number> {
    const result = await prisma.taskStep.deleteMany({
      where: { taskId },
    });
    return result.count;
  },
};
