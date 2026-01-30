import type { Prisma } from "@pokus/db";
import { prisma, type Task } from "..";
import type { AgentPhase, ExecutionStep } from "../../types";

export const taskRepository = {
	async create(sessionId: string, taskType: string): Promise<Task> {
		return prisma.task.create({
			data: {
				sessionId,
				taskType,
				status: "pending",
				phase: "clarification",
				progress: 0,
			},
		});
	},

	async findById(id: string): Promise<Task | null> {
		return prisma.task.findUnique({
			where: { id },
		});
	},

	async findByIdWithRelations(id: string): Promise<Task & {
		taskResults: Array<{ id: string; resultType: string }>;
		taskSteps: Array<{ id: string; stepName: string; status: string }>;
	} | null> {
		return prisma.task.findUnique({
			where: { id },
			include: {
				taskResults: {
					select: {
						id: true,
						resultType: true,
					},
				},
				taskSteps: {
					select: {
						id: true,
						stepName: true,
						status: true,
					},
					orderBy: {
						sequenceNumber: "asc",
					},
				},
			},
		});
	},

	async findBySession(sessionId: string): Promise<Task[]> {
		return prisma.task.findMany({
			where: { sessionId },
			orderBy: { createdAt: "desc" },
		});
	},

	async findActiveBySession(sessionId: string): Promise<Task | null> {
		return prisma.task.findFirst({
			where: {
				sessionId,
				status: { in: ["pending", "in_progress"] },
			},
			orderBy: { createdAt: "desc" },
		});
	},

	async findActiveBySessionAndType(
		sessionId: string,
		taskType: string
	): Promise<Task | null> {
		return prisma.task.findFirst({
			where: {
				sessionId,
				taskType,
				status: { in: ["pending", "in_progress"] },
			},
			orderBy: { createdAt: "desc" },
		});
	},

	async updateStatus(id: string, status: string): Promise<Task> {
		const updateData: { status: string; completedAt?: Date } = { status };

		if (status === "completed" || status === "failed") {
			updateData.completedAt = new Date();
		}

		return prisma.task.update({
			where: { id },
			data: updateData,
		});
	},

	async updatePhase(id: string, phase: AgentPhase): Promise<Task> {
		return prisma.task.update({
			where: { id },
			data: { phase },
		});
	},

	async updateGatheredInfo(
		id: string,
		gatheredInfo: Record<string, unknown>
	): Promise<Task> {
		return prisma.task.update({
			where: { id },
			data: {
				gatheredInfo: gatheredInfo as Prisma.InputJsonValue,
			},
		});
	},

	async mergeGatheredInfo(
		id: string,
		additionalInfo: Record<string, unknown>
	): Promise<Task> {
		const task = await prisma.task.findUnique({
			where: { id },
		});

		const existingInfo = (task?.gatheredInfo as Record<string, unknown>) || {};
		const mergedInfo = { ...existingInfo, ...additionalInfo };

		return prisma.task.update({
			where: { id },
			data: {
				gatheredInfo: mergedInfo as Prisma.InputJsonValue,
			},
		});
	},

	async updateExecutionPlan(
		id: string,
		executionPlan: ExecutionStep[]
	): Promise<Task> {
		return prisma.task.update({
			where: { id },
			data: {
				executionPlan: executionPlan as unknown as Prisma.InputJsonValue,
			},
		});
	},

	async updateProgress(id: string, progress: number): Promise<Task> {
		return prisma.task.update({
			where: { id },
			data: {
				progress: Math.min(100, Math.max(0, progress)),
			},
		});
	},

	async complete(id: string): Promise<Task> {
		return prisma.task.update({
			where: { id },
			data: {
				status: "completed",
				phase: "complete",
				progress: 100,
				completedAt: new Date(),
			},
		});
	},

	async fail(id: string, error?: string): Promise<Task> {
		const task = await prisma.task.findUnique({ where: { id } });
		const gatheredInfo = (task?.gatheredInfo as Record<string, unknown>) || {};

		return prisma.task.update({
			where: { id },
			data: {
				status: "failed",
				phase: "error",
				completedAt: new Date(),
				gatheredInfo: {
					...gatheredInfo,
					error,
				} as Prisma.InputJsonValue,
			},
		});
	},

	async getGatheredInfo(id: string): Promise<Record<string, unknown> | null> {
		const task = await prisma.task.findUnique({
			where: { id },
		});

		return (task?.gatheredInfo as Record<string, unknown>) || null;
	},

	async getExecutionPlan(id: string): Promise<ExecutionStep[] | null> {
		const task = await prisma.task.findUnique({
			where: { id },
		});

		return (task?.executionPlan as unknown as ExecutionStep[]) || null;
	},
};
