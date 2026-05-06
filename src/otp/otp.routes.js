import express from "express";
import { sendOtp, verifyOtp } from "./otp.controller.js";
import { otpLimiter, verifyOtpLimiter, checkAccountLock } from "../middleware/security.middleware.js";

const router = express.Router();

router.post("/send-otp",   otpLimiter,       sendOtp);
router.post("/verify-otp", verifyOtpLimiter, checkAccountLock, verifyOtp);

export default router;
