import { Router } from "express"
import { signup, login, logout, getMe, adminLogin } from "./user.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"

const router = Router()

router.post("/signup", signup)
router.post("/login", login)
router.post("/admin-login", adminLogin)
router.post("/logout", logout);
router.get("/me", getMe);

// Protected route
router.get("/profile", authMiddleware, (req, res) => {
  res.json({
    message: "Authorized",
    user: req.user
  })
})

export default router