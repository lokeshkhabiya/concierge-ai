import { Router } from "express";
import {
    createGuestSession,
    validateSession,
    logout,
} from "../controllers/auth.controller";

const router: Router = Router();
router.post("/guest", createGuestSession);
router.get("/session/:sessionToken", validateSession);
router.post("/logout", logout);
export default router;