import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  createVipUser,
  deleteVipUser,
  getVipUserById,
  getVipUsers,
  toggleVipUserStatus,
  updateVipUser,
} from "./vip-user.controller.js";

const router = Router();

router.post("/", authMiddleware, createVipUser);
router.get("/", authMiddleware, getVipUsers);
router.get("/:id", authMiddleware, getVipUserById);
router.put("/:id", authMiddleware, updateVipUser);
router.patch("/:id/toggle", authMiddleware, toggleVipUserStatus);
router.delete("/:id", authMiddleware, deleteVipUser);

export default router;
