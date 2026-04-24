import helmet from "helmet";
import rateLimit from "express-rate-limit";
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
  skip: (req) => req.path === "/", // Skip for root path
  keyGenerator: (req) => {
    // Use IP as key
    return req.clientIp || req.ip;
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
    return req.clientIp || req.ip;
  },
});

// ✅ OTP rate limiter - 3 attempts per 5 minutes
export const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 attempts per windowMs
  message: "Too many OTP requests, please try again after 5 minutes",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const phone = req.body?.phone || req.body?.mobile;
    return `${req.clientIp || req.ip}_${phone}`;
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
      console.log("🔓 Account unlocked:", user.mobile);
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

// ✅ CORS configuration
export const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5000",
    "http://localhost:5173",
    "https://yourdomain.com",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// ✅ Helper function to record login attempt
export const recordLoginAttempt = async (phone, success, ip, geoLocation) => {
  try {
    const normalizedPhone = String(phone).replace(/\D/g, '').slice(-10);
    
    const user = await prisma.user.findFirst({
      where: { mobile: normalizedPhone }
    });

    if (!user) {
      return null;
    }

    if (success) {
      // ✅ Successful login - reset attempts and create session
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
export const createLoginSession = async (userId, ip, geoLocation) => {
  try {
    const session = await prisma.loginSession.create({
      data: {
        userId,
        ipAddress: ip,
        latitude: geoLocation?.latitude || null,
        longitude: geoLocation?.longitude || null,
        country: geoLocation?.country || null,
        city: geoLocation?.city || null,
        userAgent: geoLocation?.userAgent || null,
        status: "active",
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
