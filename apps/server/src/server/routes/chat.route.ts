import { Router } from "express";
import { chat, chatStream } from "../controllers/chat.controller";

const router: Router = Router();
router.post("/", chat);
router.post("/stream", chatStream);
export default router;
