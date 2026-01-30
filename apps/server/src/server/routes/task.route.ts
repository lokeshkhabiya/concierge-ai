import { Router } from "express";
import {
	continueTask,
	getTask,    
	getProgress,
} from "../controllers/task.controller";

const router: Router = Router();
router.post("/:taskId/continue", continueTask);
router.get("/:taskId", getTask);
router.get("/:taskId/progress", getProgress);
export default router;
