import type { Request, Response, NextFunction } from "express";
import { orchestrator } from "../../orchestration";
import { guestAuthService } from "../../services";
import { userRepository } from "../../database";
import {
	chatRequestSchema,
	validateRequest,
	formatZodError,
} from "../../validation";
import { logger } from "../../logger";

export async function chat(
	req: Request,
	res: Response,
	next: NextFunction
) {
	const validation = validateRequest(chatRequestSchema, req.body);
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	const { userId, message, sessionId, sessionToken, location } =
		validation.data;

	try {
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
	} catch (err) {
		next(err);
	}
}

export async function chatStream(
	req: Request,
	res: Response,
	next: NextFunction
) {
	const validation = validateRequest(chatRequestSchema, req.body);
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	const { userId, message, sessionId, sessionToken, location } =
		validation.data;

	res.setHeader("Content-Type", "text/event-stream");
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no");

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

			res.write(
				`data: ${JSON.stringify({
					type: "session",
					sessionToken: responseSessionToken,
					userId: effectiveUserId,
					sessionId: effectiveSessionId,
					isNewGuestSession: guestSession.isNewSession,
				})}\n\n`
			);
		}

		logger.info("Stream chat request", {
			userId: effectiveUserId,
			sessionId: effectiveSessionId,
		});

		if (!effectiveUserId) {
			res.write(
				`data: ${JSON.stringify({
					type: "error",
					message: "Missing user context",
				})}\n\n`
			);
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
		res.end();
	} catch (err) {
		logger.error("Stream error", err as Error);
		res.write(
			`data: ${JSON.stringify({
				type: "error",
				message: "Stream failed",
			})}\n\n`
		);
		res.end();
		// Do not call next(err): response already sent via stream
	}
}
