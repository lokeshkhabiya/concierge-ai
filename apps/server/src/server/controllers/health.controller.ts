import type { Request, Response, NextFunction } from "express";
import { checkDatabaseConnection } from "../../database";

export async function getHealth(
	_req: Request,
	res: Response,
	next: NextFunction
) {
	try {
		const dbHealthy = await checkDatabaseConnection();
		res.json({
			status: dbHealthy ? "ok" : "degraded",
			database: dbHealthy,
			timestamp: new Date().toISOString(),
		});
	} catch (err) {
		next(err);
	}
}
