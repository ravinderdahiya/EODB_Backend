import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  captureAnalyticsEvent,
  getAnalyticsEvents,
  getAnalyticsSummary,
} from "./analytics.controller.js";

const router = Router();

router.post("/events", authMiddleware, captureAnalyticsEvent);
router.get("/summary", authMiddleware, getAnalyticsSummary);
router.get("/events", authMiddleware, getAnalyticsEvents);

export default router;
