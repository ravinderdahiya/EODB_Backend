import { Router } from "express"
import { signup, login, logout, googleLogin, getMe, adminLogin, getLoginLogs, getTokenInfo, getAdminUsers, getUsersList, getPublicLoginInsights } from "./user.controller.js"
import { requireCaptcha } from "../captcha/captcha.controller.js"

const router = Router()

router.post("/signup", signup)
router.post("/login", login)
router.post("/google-login", googleLogin)
router.post("/admin-login", requireCaptcha, adminLogin)
router.get("/public-login-insights", getPublicLoginInsights);
router.post("/logout", logout);
router.get("/me", getMe);
router.get("/login-logs", getLoginLogs);
router.get("/token-info", getTokenInfo);
router.get("/admin-users", getAdminUsers);
router.get("/users", getUsersList);

router.get("/profile", (req, res) => {
  res.json({
    message: "Authorized",
    user: req.user
  })
})
export default router
