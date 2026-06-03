import { Router } from "express"
import { signup, login, logout, googleLogin, getMe, adminLogin, getLoginLogs, getTokenInfo, getAdminUsers, getUsersList, getPublicLoginInsights } from "./user.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"
import { requireCaptcha } from "../captcha/captcha.controller.js"

const router = Router()

router.post("/signup", signup)
router.post("/login", login)
router.post("/google-login", googleLogin)
router.post("/admin-login", requireCaptcha, adminLogin)
router.get("/public-login-insights", getPublicLoginInsights);
router.post("/logout", authMiddleware, logout);
router.get("/me", authMiddleware, getMe);
router.get("/login-logs", authMiddleware, getLoginLogs);
router.get("/token-info", authMiddleware, getTokenInfo);
router.get("/admin-users", authMiddleware, getAdminUsers);
router.get("/users", authMiddleware, getUsersList);

// Protected route
router.get("/profile", authMiddleware, (req, res) => {
  res.json({
    message: "Authorized",
    user: req.user
  })
})
export default router
