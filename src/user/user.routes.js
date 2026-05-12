import { Router } from "express"
import { signup, login, logout, googleLogin, getMe, adminLogin, getLoginLogs, getTokenInfo, getAdminUsers } from "./user.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"

const router = Router()

router.post("/signup", signup)
router.post("/login", login)
router.post("/google-login", googleLogin)
router.post("/admin-login", adminLogin)
router.post("/logout", logout);
router.get("/me", getMe);
router.get("/login-logs", authMiddleware, getLoginLogs);
router.get("/token-info", authMiddleware, getTokenInfo);
router.get("/admin-users", authMiddleware, getAdminUsers);

// Protected route
router.get("/profile", authMiddleware, (req, res) => {
  res.json({
    message: "Authorized",
    user: req.user
  })
})

export default router