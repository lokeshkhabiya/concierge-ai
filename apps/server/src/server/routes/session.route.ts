import { Router } from "express";
import { getSessionTasks } from "../controllers/task.controller";

const router: Router = Router();
router.get("/:sessionId/tasks", getSessionTasks);
export default router;