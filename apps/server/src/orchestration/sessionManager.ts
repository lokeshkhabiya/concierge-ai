import { MemorySaver } from "@langchain/langgraph";
import {
	compileMedicineGraph,
	compileTravelGraph,
	type CompiledMedicineGraph,
	type CompiledTravelGraph,
} from "../agents";
import { sessionRepository, taskRepository } from "../database";
import { logger } from "../logger";
import type { IntentType, AgentPhase, ExecutionStep } from "../types";
import type { Session, Task } from "../database";

interface GraphInstance {
	graph: CompiledMedicineGraph | CompiledTravelGraph;
	checkpointer: MemorySaver;
	createdAt: Date;
}

class SessionManager {
	private graphInstances: Map<string, GraphInstance> = new Map();
	private readonly GRAPH_TTL_MS = 30 * 60 * 1000;

	async getOrCreateSession(
		userId: string,
		sessionType?: string
	): Promise<Session> {
		const existing = await sessionRepository.findLatestActiveByUser(userId);
		if (existing) {
			logger.debug("Found existing session", { sessionId: existing.id, userId });
			return existing;
		}

		const session = await sessionRepository.create(
			userId,
			sessionType || "chat"
		);

		logger.info("Created new session", { sessionId: session.id, userId });
		return session;
	}

	async getActiveTaskForSession(sessionId: string): Promise<Task | null> {
		return taskRepository.findActiveBySession(sessionId);
	}

	async getOrCreateTask(
		sessionId: string,
		intentType: Exclude<IntentType, "unknown">
	): Promise<Task> {
		const existing = await taskRepository.findActiveBySessionAndType(
			sessionId,
			intentType
		);
		if (existing) {
			logger.debug("Found existing task", { taskId: existing.id, sessionId });
			return existing;
		}

		const task = await taskRepository.create(sessionId, intentType);

		logger.info("Created new task", {
			taskId: task.id,
			sessionId,
			taskType: intentType,
		});
		return task;
	}

	getGraph(
		sessionId: string,
		intentType: Exclude<IntentType, "unknown">
	): CompiledMedicineGraph | CompiledTravelGraph {
		const key = `${sessionId}-${intentType}`;

		const cached = this.graphInstances.get(key);
		if (cached) {
			const age = Date.now() - cached.createdAt.getTime();
			if (age < this.GRAPH_TTL_MS) {
				return cached.graph;
			}

			this.graphInstances.delete(key);
		}

		const checkpointer = new MemorySaver();
		const graph =
			intentType === "medicine"
				? compileMedicineGraph(checkpointer)
				: compileTravelGraph(checkpointer);

		this.graphInstances.set(key, {
			graph,
			checkpointer,
			createdAt: new Date(),
		});

		logger.debug("Created new graph instance", { sessionId, intentType });

		return graph;
	}

	async persistState(
		taskId: string,
		state: {
			phase: AgentPhase;
			gatheredInfo?: Record<string, unknown>;
			executionPlan?: ExecutionStep[] | null;
			progress?: number;
		}
	): Promise<void> {
		try {
			await taskRepository.updatePhase(taskId, state.phase);

			if (state.gatheredInfo) {
				await taskRepository.mergeGatheredInfo(taskId, state.gatheredInfo);
			}

			if (state.executionPlan) {
				await taskRepository.updateExecutionPlan(taskId, state.executionPlan);
			}

			if (state.progress !== undefined) {
				await taskRepository.updateProgress(taskId, state.progress);
			}

			logger.debug("Persisted task state", { taskId, phase: state.phase });
		} catch (error) {
			logger.error("Failed to persist task state", error as Error, { taskId });
		}
	}

	async restoreState(
		taskId: string
	): Promise<{
		phase: AgentPhase;
		gatheredInfo: Record<string, unknown>;
		executionPlan: ExecutionStep[] | null;
	} | null> {
		try {
			const task = await taskRepository.findById(taskId);
			if (!task) return null;

			return {
				phase: task.phase as AgentPhase,
				gatheredInfo: (task.gatheredInfo as Record<string, unknown>) || {},
				executionPlan: (task.executionPlan as unknown as ExecutionStep[]) || null,
			};
		} catch (error) {
			logger.error("Failed to restore task state", error as Error, { taskId });
			return null;
		}
	}

	async completeTask(taskId: string): Promise<void> {
		await taskRepository.complete(taskId);
		logger.info("Task completed", { taskId });
	}

	async failTask(taskId: string, error: string): Promise<void> {
		await taskRepository.fail(taskId, error);
		logger.info("Task failed", { taskId, error });
	}

	async endSession(sessionId: string): Promise<void> {
		await sessionRepository.end(sessionId);

		for (const key of this.graphInstances.keys()) {
			if (key.startsWith(sessionId)) {
				this.graphInstances.delete(key);
			}
		}

		logger.info("Session ended", { sessionId });
	}

	cleanupExpiredGraphs(): void {
		const now = Date.now();

		for (const [key, instance] of this.graphInstances.entries()) {
			const age = now - instance.createdAt.getTime();
			if (age >= this.GRAPH_TTL_MS) {
				this.graphInstances.delete(key);
				logger.debug("Cleaned up expired graph", { key });
			}
		}
	}

	async getSessionForTask(taskId: string): Promise<Session | null> {
		const task = await taskRepository.findById(taskId);
		if (!task) return null;

		return sessionRepository.findById(task.sessionId);
	}
}

export const sessionManager = new SessionManager();

setInterval(() => {
	sessionManager.cleanupExpiredGraphs();
}, 5 * 60 * 1000);
