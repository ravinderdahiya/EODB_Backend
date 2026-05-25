import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { getFeedbackHistory, submitFeedback } from "./feedback.controller.js";

const router = Router();

router.post("/submit", submitFeedback);
router.get("/history", authMiddleware, getFeedbackHistory);

export default router;
