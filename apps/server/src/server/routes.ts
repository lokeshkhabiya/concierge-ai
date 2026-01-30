import { Router, type Request, type Response } from "express";
import { orchestrator } from "../orchestration";
import { taskService, guestAuthService } from "../services";
import { checkDatabaseConnection, userRepository } from "../database";
import {
	chatRequestSchema,
	continueTaskRequestSchema,
	endGuestSessionRequestSchema,
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

// Guest authentication endpoints
router.post("/auth/guest", (_req, res, next) => {
	guestAuthService
		.createGuestSession()
		.then((session) => {
			logger.info("Guest login successful", { userId: session.userId });
			res.json({
				sessionToken: session.sessionToken,
				userId: session.userId,
				sessionId: session.sessionId,
				expiresIn: 24 * 60 * 60, // 24 hours in seconds
			});
		})
		.catch(next);
});

router.get("/auth/session/:sessionToken", (req: Request<{ sessionToken: string }>, res: Response, next) => {
	const { sessionToken } = req.params;
	guestAuthService
		.validateSession(sessionToken)
		.then((sessionData) => {
			if (!sessionData) {
				res.json({ valid: false });
				return;
			}
			res.json({
				valid: true,
				userId: sessionData.userId,
				sessionId: sessionData.sessionId,
				createdAt: sessionData.createdAt.toISOString(),
			});
		})
		.catch(next);
});

router.post("/auth/logout", (req, res, next) => {
	const validation = validateRequest(endGuestSessionRequestSchema, req.body);
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	const { sessionToken, deleteUser } = validation.data;
	guestAuthService
		.endSession(sessionToken, deleteUser)
		.then(() => {
			logger.info("Guest logout successful", { sessionToken: sessionToken.substring(0, 20) + "..." });
			res.json({ success: true });
		})
		.catch(next);
});

router.post("/chat", (req, res, next) => {
	const validation = validateRequest(chatRequestSchema, req.body);
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	const { userId, message, sessionId, sessionToken, location } = validation.data;

	(async () => {
		let effectiveUserId = userId;
		let effectiveSessionId = sessionId;
		let responseSessionToken = sessionToken;
		let isNewGuestSession = false;

		const useGuestFlow =
			!effectiveUserId || !(await userRepository.exists(effectiveUserId));

		if (useGuestFlow) {
			const guestSession = await guestAuthService.getOrCreateGuestSession(
				undefined,
				sessionToken
			);
			effectiveUserId = guestSession.userId;
			effectiveSessionId = guestSession.sessionId;
			responseSessionToken = guestSession.sessionToken;
			isNewGuestSession = guestSession.isNewSession;
			logger.info("Using guest session", {
				userId: effectiveUserId,
				sessionId: effectiveSessionId,
				isNew: isNewGuestSession,
			});
		}

		logger.info("Chat request", {
			userId: effectiveUserId,
			sessionId: effectiveSessionId,
			messageLength: message.length,
		});

		const result = await orchestrator.processMessage(
			effectiveUserId ?? "",
			message,
			effectiveSessionId,
			location
		);

		// Include session token in response for guest users
		if (responseSessionToken) {
			res.json({
				...result,
				sessionToken: responseSessionToken,
				isNewGuestSession,
				...(isNewGuestSession && { userId: effectiveUserId }),
			});
		} else {
			res.json(result);
		}
	})().catch(next);
});

router.post("/chat/stream", (req, res, next) => {
	const validation = validateRequest(chatRequestSchema, req.body);
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	const { userId, message, sessionId, sessionToken, location } = validation.data;
	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no");

	(async () => {
		try {
			let effectiveUserId = userId;
			let effectiveSessionId = sessionId;
			let responseSessionToken = sessionToken;

			const useGuestFlow =
				!effectiveUserId || !(await userRepository.exists(effectiveUserId));

			if (useGuestFlow) {
				const guestSession = await guestAuthService.getOrCreateGuestSession(
					undefined,
					sessionToken
				);
				effectiveUserId = guestSession.userId;
				effectiveSessionId = guestSession.sessionId;
				responseSessionToken = guestSession.sessionToken;

				// Send session info as first event for guest users
				res.write(`data: ${JSON.stringify({
					type: "session",
					sessionToken: responseSessionToken,
					userId: effectiveUserId,
					sessionId: effectiveSessionId,
					isNewGuestSession: guestSession.isNewSession,
				})}\n\n`);
			}

			logger.info("Stream chat request", { userId: effectiveUserId, sessionId: effectiveSessionId });

			if (!effectiveUserId) {
				res.write(`data: ${JSON.stringify({ type: "error", message: "Missing user context" })}\n\n`);
				res.end();
				return;
			}

			for await (const chunk of orchestrator.processMessageStream(
				effectiveUserId,
				message,
				effectiveSessionId ?? undefined,
				location
			)) {
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
