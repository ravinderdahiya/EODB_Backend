import { Router } from "express";
import {
  createApiUrl,
  getAllApiUrls,
  getApiUrlById,
  updateApiUrl,
  deleteApiUrl,
  toggleApiUrlStatus,
  getCategories,
} from "./api-url.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// ✅ Public routes
router.get("/categories", getCategories);

// ✅ Protected routes (require authentication)
router.post("/", authMiddleware, createApiUrl);
router.get("/", authMiddleware, getAllApiUrls);
router.get("/:id", authMiddleware, getApiUrlById);
router.put("/:id", authMiddleware, updateApiUrl);
router.patch("/:id/toggle", authMiddleware, toggleApiUrlStatus);
router.delete("/:id", authMiddleware, deleteApiUrl);

export default router;