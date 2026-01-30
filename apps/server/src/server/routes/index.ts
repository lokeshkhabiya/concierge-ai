import { Router } from "express";
import healthRoute from "./health.route";
import authRoute from "./auth.route";
import chatRoute from "./chat.route";
import taskRoute from "./task.route";
import sessionRoute from "./session.route";

const router = Router();
router.use("/health", healthRoute);
router.use("/auth", authRoute);
router.use("/chat", chatRoute);
router.use("/task", taskRoute);
router.use("/session", sessionRoute);

export default router;
