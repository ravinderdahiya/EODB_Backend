import { Router } from "express"
import { signup, login } from "./user.controller.js"
import { authMiddleware } from "../middleware/auth.middleware.js"

const router = Router()

router.post("/signup", signup)
router.post("/login", login)

// Protected route
router.get("/profile", authMiddleware, (req, res) => {
  res.json({
    message: "Authorized",
    user: req.user
  })
})

export default router