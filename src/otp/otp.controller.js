import prisma from "../config/db.js";
import axios from "axios";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { recordLoginAttempt, createLoginSession } from "../middleware/security.middleware.js";
import analyticsService from "../services/analyticsService.js";
import { getRequestDeviceIdentity } from "../utils/device-identity.utils.js";
import { ensureVipDeviceColumns, isVipDeviceAuthorized } from "../vip-user/vip-device.service.js";

dotenv.config();

const shouldExposeAuthTokenBody = () => (
    String(process.env.EXPOSE_AUTH_TOKEN_BODY || "").toLowerCase() === "true"
);

const useSecureCookies = () => (
    String(process.env.ALLOW_INSECURE_COOKIES || "").toLowerCase() !== "true"
);

const getAuthCookieOptions = () => ({
    httpOnly: true,
    secure: useSecureCookies(),
    sameSite: useSecureCookies() ? "strict" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
});

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const isBcryptHash = (value) => (
    typeof value === "string" && BCRYPT_HASH_PATTERN.test(value)
);

const generateOpaquePasswordSeed = (phone) => (
    `${phone}:${Date.now()}:${Math.random().toString(36).slice(2)}`
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

const ensureUserForPhone = async(phone) => {
    let user = await prisma.user.findFirst({ where: { mobile: phone } });

    const hashedPassword = await bcrypt.hash(generateOpaquePasswordSeed(phone), 10);

    if (!user) {
        user = await prisma.user.create({
            data: {
                mobile: phone,
                fullname: "User",
                email: `user_${Date.now()}@eodb.com`,
                password: hashedPassword,
            },
        });
        return user;
    }

    // Remediate legacy plaintext/default password records created before hashing fix.
    if (!isBcryptHash(user.password)) {
        user = await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });
    }

    return user;
};

const issueAuthenticatedLogin = async({ req, res, phone, user, message, vipLogin = false }) => {
    const deviceIdentity = getRequestDeviceIdentity(req);
    const userAgent = req.get("user-agent");

    const token = jwt.sign({ id: user.id, mobile: user.mobile },
        process.env.JWT_SECRET, { expiresIn: "1d" }
    );

    await recordLoginAttempt(phone, true, req.clientIp, req.geoLocation, userAgent, deviceIdentity);

    const session = await createLoginSession(
        user.id,
        req.clientIp,
        req.geoLocation,
        userAgent,
        deviceIdentity,
        phone,
    );

    analyticsService.trackAuthEvent(vipLogin ? "vip_login_success" : "login_success", user.id, null, {});

    // Set JWT as httpOnly cookie; inaccessible to JavaScript/XSS
    res.cookie("auth_token", token, getAuthCookieOptions());

    return res.json({
        message,
        ...(vipLogin ? { vipLogin: true } : {}),
        ...(shouldExposeAuthTokenBody() ? { token } : {}),
        session: session?.id,
        user: {
            id: user.id,
            mobile: user.mobile,
            email: user.email,
        },
    });
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

        await ensureVipDeviceColumns();

        const activeVipRows = await prisma.$queryRaw`
            SELECT id
                , mobile
                , device_id
                , device_imei
            FROM vip_users
            WHERE mobile = ${phone} AND "isActive" = TRUE
            LIMIT 1
        `;
        const activeVip = Array.isArray(activeVipRows) && activeVipRows.length > 0;

        if (activeVip) {
            const deviceIdentity = getRequestDeviceIdentity(req);
            const authorization = isVipDeviceAuthorized(activeVipRows[0], deviceIdentity);
            if (!authorization.ok) {
                return res.status(403).json({
                    message: "VIP device authorization failed",
                    reason: authorization.reason,
                });
            }

            const user = await ensureUserForPhone(phone);
            return issueAuthenticatedLogin({
                req,
                res,
                phone,
                user,
                message: "VIP login successful",
                vipLogin: true,
            });
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

        // OTP is never returned in API response; logged only in dev
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
            res.status(502).json({
                message: "OTP created but SMS delivery failed",
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
            res.status(502).json({
                message: "OTP resent but SMS delivery failed",
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

        const user = await ensureUserForPhone(phone);

        // Delete OTP after successful use
        await prisma.otp.deleteMany({ where: { phone } });

        return issueAuthenticatedLogin({
            req,
            res,
            phone,
            user,
            message: "OTP verified successfully",
        });
    } catch (error) {
        console.error("Verify OTP Error:", error.message);
        res.status(500).json({ message: "Server error" });
    }
};
