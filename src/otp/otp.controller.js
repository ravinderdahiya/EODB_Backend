import prisma from "../config/db.js";
import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { recordLoginAttempt, createLoginSession } from "../middleware/security.middleware.js";
import analyticsService from "../services/analyticsService.js";

dotenv.config();

const shouldExposeAuthTokenBody = () => (
    String(process.env.EXPOSE_AUTH_TOKEN_BODY || "").toLowerCase() === "true"
);

const normalizePhone = (phone) => {
    if (!phone) return null;
    const digitsOnly = String(phone).replace(/\D/g, "");
    if (digitsOnly.length === 10) return `+91${digitsOnly}`;
    if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) return `+${digitsOnly}`;
    if (phone.startsWith("+91") && digitsOnly.length === 12) return phone;
    return phone;
};

const formatSmsPhone = (normalizedPhone) => {
    const digits = String(normalizedPhone || "").replace(/\D/g, "");
    if (digits.length === 10) return digits;
    if (digits.length === 12 && digits.startsWith("91")) return digits;
    return digits;
};

// ===================== SEND OTP =====================
export const sendOtp = async(req, res) => {
    try {
        let { phone, mobile } = req.body;
        phone = phone || mobile;

        if (!phone) {
            return res.status(400).json({ message: "Phone required" });
        }

        phone = normalizePhone(phone);

        if (!phone) {
            return res.status(400).json({ message: "Invalid phone format" });
        }

        // 4-digit OTP as per project requirement
        const otp = Math.floor(1000 + Math.random() * 9000);

        await prisma.otp.deleteMany({ where: { phone } });

        await prisma.otp.create({
            data: {
                phone,
                otp,
                expiresAt: new Date(Date.now() + 2 * 60 * 1000),
            },
        });

        // OTP is NEVER returned in API response — logged to server console in dev only
        if (process.env.NODE_ENV === "development") {
            console.log(`[DEV ONLY - never in response] OTP for ${phone}: ${otp}`);
        }

        analyticsService.trackOtpEvent("otp_sent", phone);

        // ===================== SEND SMS =====================
        try {
            const message = `Your One Time Password is ${otp} for your application. Don't share OTP with anyone.HARSAC`;

            await axios.post("https://sms.pixabits.in/smsapi/sms/custom/send", {
                key: process.env.SMS_API_KEY,
                text: message,
                senderId: process.env.SMS_SENDER_ID,
                tempDltId: process.env.SMS_TEMP_DLT_ID,
                route: "Domestic",
                phoneno: formatSmsPhone(phone),
                groupIds: [" "],
                trans: 1,
                unicode: 0,
                flash: false,
                tiny: false,
            });

            res.json({
                message: "OTP sent successfully",
                phone,
                smsSent: true,
                expiresIn: "2 minutes",
            });
        } catch (smsError) {
            console.error("SMS API Error:", smsError.message);
            res.json({
                message: "OTP created (SMS delivery pending)",
                phone,
                smsSent: false,
                warning: "OTP saved but SMS delivery failed. Contact support.",
                expiresIn: "2 minutes",
            });
        }
    } catch (error) {
        console.error("Send OTP Error:", error.message);
        const isSchemaIssue = error?.code === "P2021" || error?.code === "P2022";
        const debugPayload = process.env.NODE_ENV !== "production"
            ? { debug: { code: error?.code, message: error?.message } }
            : {};
        res.status(500).json({
            message: "Server error",
            ...(isSchemaIssue ? { hint: "Database schema mismatch. Run: npx prisma db push on deployed backend." } : {}),
            ...debugPayload,
        });
    }
};

// ===================== RESEND OTP =====================
export const resendOtp = async(req, res) => {
    try {
        let { phone, mobile } = req.body;
        phone = phone || mobile;

        if (!phone) {
            return res.status(400).json({ message: "Phone required" });
        }

        phone = normalizePhone(phone);

        if (!phone) {
            return res.status(400).json({ message: "Invalid phone format" });
        }

        const otp = Math.floor(1000 + Math.random() * 9000);

        await prisma.otp.deleteMany({ where: { phone } });

        await prisma.otp.create({
            data: {
                phone,
                otp,
                expiresAt: new Date(Date.now() + 2 * 60 * 1000),
            },
        });

        if (process.env.NODE_ENV === "development") {
            console.log(`[DEV ONLY - never in response] Resent OTP for ${phone}: ${otp}`);
        }

        analyticsService.trackOtpEvent("otp_resent", phone);

        try {
            const message = `Your One Time Password is ${otp} for your application. Don't share OTP with anyone.HARSAC`;

            await axios.post("https://sms.pixabits.in/smsapi/sms/custom/send", {
                key: process.env.SMS_API_KEY,
                text: message,
                senderId: process.env.SMS_SENDER_ID,
                tempDltId: process.env.SMS_TEMP_DLT_ID,
                route: "Domestic",
                phoneno: formatSmsPhone(phone),
                groupIds: [" "],
                trans: 1,
                unicode: 0,
                flash: false,
                tiny: false,
            });

            res.json({
                message: "OTP resent successfully",
                phone,
                smsSent: true,
                expiresIn: "2 minutes",
            });
        } catch (smsError) {
            console.error("SMS API Error:", smsError.message);
            res.json({
                message: "OTP resent (SMS delivery pending)",
                phone,
                smsSent: false,
                warning: "OTP saved but SMS delivery failed. Contact support.",
                expiresIn: "2 minutes",
            });
        }
    } catch (error) {
        console.error("Resend OTP Error:", error.message);
        res.status(500).json({ message: "Server error" });
    }
};

// ===================== VERIFY OTP + LOGIN =====================
export const verifyOtp = async(req, res) => {
    try {
        let { phone, mobile, otp } = req.body;
        phone = phone || mobile;

        if (!phone || !otp) {
            return res.status(400).json({ message: "Phone and OTP required" });
        }

        phone = normalizePhone(phone);

        if (!phone) {
            return res.status(400).json({ message: "Invalid phone format" });
        }

        const otpNumber = Number(otp);
        if (isNaN(otpNumber)) {
            return res.status(400).json({ message: "OTP must be a number" });
        }

        const record = await prisma.otp.findFirst({
            where: { phone, otp: otpNumber },
        });

        if (!record) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // Check expiry
        if (new Date(record.expiresAt) < new Date()) {
            await prisma.otp.deleteMany({ where: { phone } });
            return res.status(400).json({ message: "OTP expired" });
        }

        let user = await prisma.user.findFirst({ where: { mobile: phone } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    mobile: phone,
                    fullname: "User",
                    email: `user_${Date.now()}@eodb.com`,
                    password: "default_password",
                },
            });
        }

        const token = jwt.sign({ id: user.id, mobile: user.mobile },
            process.env.JWT_SECRET, { expiresIn: "1d" }
        );

        // Delete OTP after successful use
        await prisma.otp.deleteMany({ where: { phone } });

        await recordLoginAttempt(phone, true, req.clientIp, {
            ...req.geoLocation,
            userAgent: req.get("user-agent"),
        });

        const session = await createLoginSession(user.id, req.clientIp, {
            ...req.geoLocation,
            userAgent: req.get("user-agent"),
        });

        analyticsService.trackAuthEvent("login_success", user.id, null, {});

        // Set JWT as httpOnly cookie — inaccessible to JavaScript/XSS
        res.cookie("auth_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
        });

        res.json({
            message: "OTP verified successfully",
            ...(shouldExposeAuthTokenBody() ? { token } : {}),
            session: session?.id,
            user: {
                id: user.id,
                mobile: user.mobile,
                email: user.email,
            },
        });
    } catch (error) {
        console.error("Verify OTP Error:", error.message);
        res.status(500).json({ message: "Server error" });
    }
};
