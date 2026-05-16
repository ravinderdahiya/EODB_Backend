import { Router } from "express";
import {
  createApiUrl,
  getAllApiUrls,
  getApiUrlById,
  updateApiUrl,
  deleteApiUrl,
  toggleApiUrlStatus,
  getCategories,
  getFrontendRuntimeConfig,
} from "./api-url.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

// ✅ Protected routes (require authentication)
router.get("/categories", authMiddleware, getCategories);
router.get("/frontend-config", getFrontendRuntimeConfig);
router.post("/", authMiddleware, createApiUrl);
router.get("/", authMiddleware, getAllApiUrls);
router.get("/:id", authMiddleware, getApiUrlById);
router.put("/:id", authMiddleware, updateApiUrl);
router.patch("/:id/toggle", authMiddleware, toggleApiUrlStatus);
router.delete("/:id", authMiddleware, deleteApiUrl);

export default router;
