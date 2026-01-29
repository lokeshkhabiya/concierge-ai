import { Router, type Request, type Response } from "express";
import { orchestrator } from "../orchestration";
import { taskService } from "../services";
import { checkDatabaseConnection } from "../database";
import {
	chatRequestSchema,
	continueTaskRequestSchema,
	validateRequest,
	formatZodError,
} from "../validation";
import { notFound } from "./middleware";
import { logger } from "../logger";

const router: Router = Router();

router.get("/health", (_req, res, next) => {
	checkDatabaseConnection()
		.then((dbHealthy) => {
			res.json({
				status: dbHealthy ? "ok" : "degraded",
				database: dbHealthy,
				timestamp: new Date().toISOString(),
			});
		})
		.catch(next);
});

router.post("/chat", (req, res, next) => {
	const validation = validateRequest(chatRequestSchema, req.body);
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	const { userId, message, sessionId, location } = validation.data;
	logger.info("Chat request", { userId, sessionId, messageLength: message.length });
	orchestrator.processMessage(userId, message, sessionId, location).then(res.json.bind(res)).catch(next);
});

router.post("/chat/stream", (req, res, next) => {
	const validation = validateRequest(chatRequestSchema, req.body);
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	const { userId, message, sessionId, location } = validation.data;
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no");
	logger.info("Stream chat request", { userId, sessionId });
	(async () => {
		try {
			for await (const chunk of orchestrator.processMessageStream(userId, message, sessionId, location)) {
				res.write(`data: ${JSON.stringify(chunk)}\n\n`);
			}
		} catch (e) {
			logger.error("Stream error", e as Error);
			res.write(`data: ${JSON.stringify({ type: "error", message: "Stream failed" })}\n\n`);
		}
		res.end();
	})().catch(next);
});

router.post("/task/:taskId/continue", (req: Request<{ taskId: string }>, res: Response, next) => {
	const taskId = req.params.taskId;
	const validation = validateRequest(continueTaskRequestSchema, { ...req.body, taskId });
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	const { userInput, selectedOption } = validation.data;
	logger.info("Continue task request", { taskId, hasSelectedOption: !!selectedOption });
	orchestrator.continueTask(taskId, userInput, selectedOption).then(res.json.bind(res)).catch(next);
});

router.get("/task/:taskId", (req: Request<{ taskId: string }>, res: Response, next) => {
	taskService
		.getTaskWithDetails(req.params.taskId)
		.then((result) => {
			if (!result) throw notFound("Task not found");
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
		})
		.catch(next);
});

router.get("/task/:taskId/progress", (req: Request<{ taskId: string }>, res: Response, next) => {
	taskService
		.getProgressSummary(req.params.taskId)
		.then((progress) => {
			if (progress.phase === "unknown") throw notFound("Task not found");
			res.json(progress);
		})
		.catch(next);
});

router.get("/session/:sessionId/tasks", (req: Request<{ sessionId: string }>, res: Response, next) => {
	taskService
		.getTasksBySession(req.params.sessionId)
		.then((tasks) => {
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
		})
		.catch(next);
});

export default router;
