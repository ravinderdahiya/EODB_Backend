import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import prisma from "../config/db.js";


// ✅ Helmet middleware - Set security HTTP headers
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
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
  skip: (req) =>
    req.path === "/" ||
    req.method === "OPTIONS" ||
    req.path.startsWith("/mapserver/service/") ||
    req.path === "/mapserver/metadata",
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
    
    if (res.statusCode >= 400) {
      console.error("⚠️  API Error:", log);
    } else {
      console.log("✅ API Request:", log);
    }
  });

  next();
};

// CORS configuration — origins driven by env var
// In production: set ALLOWED_ORIGINS="https://hsac.org.in" in .env
// In development: localhost origins allowed automatically
const productionOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : [];

const devOrigins =
  process.env.NODE_ENV !== "production"
    ? ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"]
    : [];

const allowedOrigins = new Set([...productionOrigins, ...devOrigins]);

export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: origin ${origin} not allowed`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// ✅ Helper function to record login attempt
export const recordLoginAttempt = async (phone, success, ip, geoLocation, userAgent = null) => {
  try {
    const normalizedPhone = String(phone).replace(/\D/g, '').slice(-10);

    const user = await prisma.user.findFirst({
      where: { mobile: normalizedPhone }
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
export const createLoginSession = async (userId, ip, geoLocation, userAgent = null) => {
  try {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session = await prisma.loginSessionLog.create({
      data: {
        userId,
        sessionId,
        ipAddress: ip,
        latitude: geoLocation?.latitude || null,
        longitude: geoLocation?.longitude || null,
        country: geoLocation?.country || null,
        city: geoLocation?.city || null,
        timezone: geoLocation?.timezone || null,
        userAgent: userAgent,
        type: "session_start",
        status: "active",
        loginAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    console.log("✅ Login Session Created:", session.id);
    return session;
  } catch (error) {
    console.error("❌ Create Login Session Error:", error.message);
    return null;
  }
};
