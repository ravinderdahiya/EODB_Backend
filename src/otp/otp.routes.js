import express from "express";
import { sendOtp, verifyOtp} from "./otp.controller.js";
import { otpLimiter, loginLimiter } from "../middleware/security.middleware.js";

const router = express.Router();

router.post("/send-otp", otpLimiter, sendOtp);
router.post("/verify-otp", loginLimiter, verifyOtp);

export default router;