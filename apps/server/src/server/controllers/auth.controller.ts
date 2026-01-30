import type { Request, Response, NextFunction } from "express";
import { guestAuthService } from "../../services";
import {
	validateRequest,
	endGuestSessionRequestSchema,
	formatZodError,
} from "../../validation";
import { logger } from "../../logger";

export async function createGuestSession(
	_req: Request,
	res: Response,
	next: NextFunction
) {
	try {
		const session = await guestAuthService.createGuestSession();
		logger.info("Guest login successful", { userId: session.userId });
		res.json({
			sessionToken: session.sessionToken,
			userId: session.userId,
			sessionId: session.sessionId,
			expiresIn: 24 * 60 * 60,
		});
	} catch (err) {
		next(err);
	}
}

export async function validateSession(
	req: Request<{ sessionToken: string }>,
	res: Response,
	next: NextFunction
) {
	try {
		const { sessionToken } = req.params;
		const sessionData = await guestAuthService.validateSession(sessionToken);
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
	} catch (err) {
		next(err);
	}
}

export async function logout(
	req: Request,
	res: Response,
	next: NextFunction
) {
	const validation = validateRequest(endGuestSessionRequestSchema, req.body);
	if (!validation.success) {
		res.status(400).json(formatZodError(validation.error));
		return;
	}
	try {
		const { sessionToken, deleteUser } = validation.data;
		await guestAuthService.endSession(sessionToken, deleteUser);
		logger.info("Guest logout successful", {
			sessionToken: sessionToken.substring(0, 20) + "...",
		});
		res.json({ success: true });
	} catch (err) {
		next(err);
	}
}
