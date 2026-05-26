import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { resolveMapLink } from "./map-link.controller.js";

const router = Router();

router.get("/resolve", authMiddleware, resolveMapLink);
router.post("/resolve", authMiddleware, resolveMapLink);

export default router;
