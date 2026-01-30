import type { Request, Response, NextFunction } from "express";
import { orchestrator } from "../../orchestration";
import { taskService } from "../../services";
import {
	validateRequest,
	continueTaskRequestSchema,
	formatZodError,
} from "../../validation";
import { notFound } from "../middleware";
import { logger } from "../../logger";

export async function continueTask(
	req: Request<{ taskId: string }>,
	res: Response,
	next: NextFunction
) {
	const taskId = req.params.taskId;
	const validation = validateRequest(continueTaskRequestSchema, {
		...req.body,
		taskId,
	});
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	const { userInput, selectedOption } = validation.data;

	try {
		logger.info("Continue task request", {
			taskId,
			hasSelectedOption: !!selectedOption,
		});
		const result = await orchestrator.continueTask(
			taskId,
			userInput,
			selectedOption
		);
		res.json(result);
	} catch (err) {
		next(err);
	}
}

export async function getTask(
	req: Request<{ taskId: string }>,
	res: Response,
	next: NextFunction
) {
	try {
		const result = await taskService.getTaskWithDetails(req.params.taskId);
		if (!result) {
			throw notFound("Task not found");
		}
		res.json({
			task: {
				id: result.task.id,
				type: result.task.taskType,
				status: result.task.status,
				phase: result.task.phase,
				progress: result.task.progress,
				createdAt: result.task.createdAt,
				completedAt: result.task.completedAt,
			},
			steps: result.steps.map((s) => ({
				id: s.id,
				name: s.stepName,
				status: s.status,
				sequenceNumber: s.sequenceNumber,
			})),
		});
	} catch (err) {
		next(err);
	}
}

export async function getProgress(
	req: Request<{ taskId: string }>,
	res: Response,
	next: NextFunction
) {
	try {
		const progress = await taskService.getProgressSummary(
			req.params.taskId
		);
		if (progress.phase === "unknown") {
			throw notFound("Task not found");
		}
		res.json(progress);
	} catch (err) {
		next(err);
	}
}

export async function getSessionTasks(
	req: Request<{ sessionId: string }>,
	res: Response,
	next: NextFunction
) {
	try {
		const tasks = await taskService.getTasksBySession(req.params.sessionId);
		res.json({
			sessionId: req.params.sessionId,
			tasks: tasks.map((t) => ({
				id: t.id,
				type: t.taskType,
				status: t.status,
				phase: t.phase,
				progress: t.progress,
				createdAt: t.createdAt,
			})),
		});
	} catch (err) {
		next(err);
	}
}
