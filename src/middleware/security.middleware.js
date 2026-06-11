import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import prisma from "../config/db.js";

const cspDirectives = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
  frameSrc: ["'none'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'"],
  imgSrc: ["'self'", "data:"],
  fontSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'"],
  manifestSrc: ["'self'"],
  upgradeInsecureRequests: [],
};

const cspReportOnly = String(process.env.CSP_REPORT_ONLY || "").toLowerCase() === "true";


// ✅ Helmet middleware - Set security HTTP headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    reportOnly: cspReportOnly,
    useDefaults: true,
    directives: cspDirectives,
  },
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false,
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

// ✅ General API rate limiter - 100 requests per 15 minutes
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  // Skip root and high-frequency ArcGIS layer traffic that can exceed 100 requests quickly.
  // All /mapserver/* routes are already JWT-protected, so the IP limiter (meant for
  // login/abuse protection) must not throttle a normal heavy map session.
  skip: (req) =>
    req.path === "/" ||
    req.path === "/health" ||
    req.method === "OPTIONS" ||
    req.path.includes("/mapserver/"),
  keyGenerator: (req) => {
    // Use IP as key
    return ipKeyGenerator(req);
  },
});

// ✅ Strict rate limiter for login/OTP - 5 attempts per 15 minutes per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per windowMs
  message: "Too many login attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return ipKeyGenerator(req);
  },
});

// CAPTCHA issue limiter - 30 challenges per 5 minutes per IP
// Generous enough for legitimate refreshes/retries, but blocks token farming.
export const captchaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: "Too many captcha requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return ipKeyGenerator(req);
  },
});

// OTP send limiter - 3 sends per 5 minutes per IP+phone
export const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: "Too many OTP requests, please try again after 5 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const phone = req.body?.phone || req.body?.mobile;
    return `send_${ipKeyGenerator(req)}_${phone}`;
  },
});

// OTP verify limiter - 3 attempts per 5 minutes per IP+phone
// Without this, 6-digit OTP (900k combinations) is brute-forceable in ~8 hours
export const verifyOtpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  message: "Too many OTP verification attempts, please try again after 5 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const phone = req.body?.phone || req.body?.mobile;
    return `verify_${ipKeyGenerator(req)}_${phone}`;
  },
});

// ✅ Middleware to check if user account is locked
export const checkAccountLock = async (req, res, next) => {
  try {
    const phone = req.body?.phone || req.body?.mobile;

    if (!phone) {
      return next();
    }

    const user = await prisma.user.findFirst({
      where: { mobile: String(phone).replace(/\D/g, '').slice(-10) }
    });

    if (!user) {
      return next();
    }

    // Check if account is locked
    if (user.isLocked && user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
      const remainingTime = Math.ceil((new Date(user.lockedUntil) - new Date()) / 1000 / 60);
      return res.status(423).json({
        message: `Account locked. Try again in ${remainingTime} minutes`,
        lockedUntil: user.lockedUntil,
      });
    }

    // Unlock if time has passed
    if (user.isLocked && user.lockedUntil && new Date(user.lockedUntil) <= new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isLocked: false,
          lockedUntil: null,
          loginAttempts: 0,
        },
      });
      console.log("Account unlocked: user", user.id);
    }

    next();
  } catch (error) {
    console.error("❌ Account Lock Check Error:", error.message);
    next();
  }
};

const SLOW_REQUEST_THRESHOLD_MS = Number(process.env.SLOW_REQUEST_THRESHOLD_MS || 500);

// ✅ Middleware to log all API requests
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const log = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ip: req.clientIp,
      duration: `${duration}ms`,
      userAgent: req.get("user-agent"),
    };

    if (duration >= SLOW_REQUEST_THRESHOLD_MS) {
      console.warn("🐢 Slow API Request:", {
        ...log,
        thresholdMs: SLOW_REQUEST_THRESHOLD_MS,
      });
    }

    if (res.statusCode >= 400) {
      console.error("⚠️  API Error:", log);
    } else if (duration < SLOW_REQUEST_THRESHOLD_MS) {
      console.log("✅ API Request:", log);
    }
  });

  next();
};

// CORS configuration — origins driven by env var
// In production: set ALLOWED_ORIGINS in .env (include all served frontend domains)
// Example:
// ALLOWED_ORIGINS=https://hsac.org.in,https://www.hsac.org.in,https://harsac.online,https://www.harsac.online
// In development: localhost origins allowed automatically
const normalizeOrigin = (value) => String(value || "").trim().replace(/\/+$/, "");
const isDevLoopbackOrigin = (origin) => {
  try {
    const parsed = new URL(origin);
    const host = String(parsed.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
};

const defaultProductionOrigins = [
  "https://hsac.org.in",
  "https://www.hsac.org.in",
  "https://harsac.online",
  "https://www.harsac.online",
];

const productionOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => normalizeOrigin(o))
  : defaultProductionOrigins;

const devOrigins =
  process.env.NODE_ENV !== "production"
    ? [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
      ]
    : [];

const allowedOrigins = new Set(
  [...productionOrigins, ...devOrigins].map((o) => normalizeOrigin(o)).filter(Boolean)
);

export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) return callback(null, true);
    const normalizedOrigin = normalizeOrigin(origin);

    if (allowedOrigins.has(normalizedOrigin)) return callback(null, true);
    if (process.env.NODE_ENV !== "production" && isDevLoopbackOrigin(origin)) {
      return callback(null, true);
    }

    console.warn(`CORS blocked: origin ${origin} not allowed`);
    const corsError = new Error(`CORS blocked: origin ${origin} not allowed`);
    corsError.status = 403;
    corsError.code = "CORS_ORIGIN_DENIED";
    callback(corsError);
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Device-Id", "X-Device-Imei", "X-Device-Info"],
};

// ✅ Helper function to record login attempt
const normalizeDeviceIdentity = (deviceIdentity = {}) => ({
  deviceId: typeof deviceIdentity.deviceId === "string" ? deviceIdentity.deviceId.trim().slice(0, 120) : null,
  deviceImei: typeof deviceIdentity.deviceImei === "string" ? deviceIdentity.deviceImei.trim().slice(0, 64) : null,
  deviceInfo: typeof deviceIdentity.deviceInfo === "string" ? deviceIdentity.deviceInfo.trim().slice(0, 500) : null,
});

export const recordLoginAttempt = async (
  phone,
  success,
  ip,
  geoLocation,
  userAgent = null,
  deviceIdentity = {},
) => {
  try {
    const normalizedPhone = String(phone).replace(/\D/g, '').slice(-10);
    const phoneCandidates = [normalizedPhone, `91${normalizedPhone}`, `+91${normalizedPhone}`]
      .filter(Boolean);
    const normalizedDeviceIdentity = normalizeDeviceIdentity(deviceIdentity);

    const user = await prisma.user.findFirst({
      where: {
        mobile: { in: phoneCandidates },
      },
    });

    if (!user) {
      // Create log entry for unknown phone number
      await prisma.loginSessionLog.create({
        data: {
          ipAddress: ip,
          latitude: geoLocation?.latitude || null,
          longitude: geoLocation?.longitude || null,
          country: geoLocation?.country || null,
          city: geoLocation?.city || null,
          timezone: geoLocation?.timezone || null,
          userAgent: userAgent,
          deviceId: normalizedDeviceIdentity.deviceId,
          deviceImei: normalizedDeviceIdentity.deviceImei,
          deviceInfo: normalizedDeviceIdentity.deviceInfo,
          mobile: normalizedPhone,
          type: success ? "login_success" : "login_failed",
          status: success ? "success" : "failed",
        },
      });
      return null;
    }

    if (success) {
      // ✅ Successful login - reset attempts and update user
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: 0,
          isLocked: false,
          lockedUntil: null,
          lastLoginIp: ip,
          lastLoginLat: geoLocation?.latitude || null,
          lastLoginLng: geoLocation?.longitude || null,
          lastLoginAt: new Date(),
        },
      });

      // Create success log entry
      await prisma.loginSessionLog.create({
        data: {
          userId: user.id,
          ipAddress: ip,
          latitude: geoLocation?.latitude || null,
          longitude: geoLocation?.longitude || null,
          country: geoLocation?.country || null,
          city: geoLocation?.city || null,
          timezone: geoLocation?.timezone || null,
          userAgent: userAgent,
          deviceId: normalizedDeviceIdentity.deviceId,
          deviceImei: normalizedDeviceIdentity.deviceImei,
          deviceInfo: normalizedDeviceIdentity.deviceInfo,
          mobile: normalizedPhone,
          type: "login_success",
          status: "success",
          loginAt: new Date(),
        },
      });

      console.log("✅ Login Success recorded for:", normalizedPhone);
    } else {
      // ❌ Failed login - increment attempts
      const newAttempts = user.loginAttempts + 1;
      const isLocked = newAttempts >= 5;
      const lockedUntil = isLocked ? new Date(Date.now() + 30 * 60 * 1000) : null; // Lock for 30 mins

      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: newAttempts,
          isLocked,
          lockedUntil,
        },
      });

      // Create failure log entry
      await prisma.loginSessionLog.create({
        data: {
          userId: user.id,
          ipAddress: ip,
          latitude: geoLocation?.latitude || null,
          longitude: geoLocation?.longitude || null,
          country: geoLocation?.country || null,
          city: geoLocation?.city || null,
          timezone: geoLocation?.timezone || null,
          userAgent: userAgent,
          deviceId: normalizedDeviceIdentity.deviceId,
          deviceImei: normalizedDeviceIdentity.deviceImei,
          deviceInfo: normalizedDeviceIdentity.deviceInfo,
          mobile: normalizedPhone,
          type: "login_failed",
          status: "failed",
        },
      });

      console.log(`⚠️  Login failed attempt ${newAttempts} for:`, normalizedPhone);

      if (isLocked) {
        console.error("🔒 Account locked after 5 failed attempts:", normalizedPhone);
      }
    }

    return user;
  } catch (error) {
    console.error("❌ Record Login Attempt Error:", error.message);
    return null;
  }
};

// ✅ Helper function to create login session
export const createLoginSession = async (
  userId,
  ip,
  geoLocation,
  userAgent = null,
  deviceIdentity = {},
  mobile = null,
) => {
  try {
    const normalizedDeviceIdentity = normalizeDeviceIdentity(deviceIdentity);
    const normalizedMobile = mobile ? String(mobile).replace(/\D/g, "").slice(-10) : null;
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const loginAt = new Date();
    const expiresAt = new Date(loginAt.getTime() + 24 * 60 * 60 * 1000);

    await prisma.loginSessionLog.updateMany({
      where: {
        userId,
        type: "session_start",
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: loginAt } }],
      },
      data: {
        status: "revoked",
        revokedAt: loginAt,
      },
    });

    // Create DB record asynchronously so API response is not blocked by disk/DB latency.
    await prisma.loginSessionLog.create({
      data: {
        userId,
        sessionId,
        ipAddress: ip || geoLocation?.ip || "unknown",
        latitude: geoLocation?.latitude || null,
        longitude: geoLocation?.longitude || null,
        country: geoLocation?.country || null,
        city: geoLocation?.city || null,
        timezone: geoLocation?.timezone || null,
        userAgent: userAgent,
        deviceId: normalizedDeviceIdentity.deviceId,
        deviceImei: normalizedDeviceIdentity.deviceImei,
        deviceInfo: normalizedDeviceIdentity.deviceInfo,
        mobile: normalizedMobile,
        type: "session_start",
        status: "active",
        loginAt,
        expiresAt,
      },
    }).then((created) => {
      console.log("✅ Login Session Created (async):", created.id);
    }).catch((err) => {
      console.error("❌ Create Login Session Error (async):", err.message);
    });

    // Return immediate lightweight session object (session id generated client-side)
    return { id: sessionId, sessionId, userId, loginAt: new Date() };
  } catch (error) {
    console.error("❌ Create Login Session Error:", error.message);
    return null;
  }
};
