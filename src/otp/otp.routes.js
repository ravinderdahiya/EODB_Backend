import express from "express";
import { sendOtp, resendOtp, verifyOtp } from "./otp.controller.js";
import { otpLimiter, verifyOtpLimiter, checkAccountLock } from "../middleware/security.middleware.js";

const router = express.Router();

router.post("/send-otp",   otpLimiter,       sendOtp);
router.post("/resend-otp", otpLimiter,       resendOtp);
router.post("/verify-otp", verifyOtpLimiter, checkAccountLock, verifyOtp);

export default router;
