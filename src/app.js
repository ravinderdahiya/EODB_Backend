import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";

import userRoutes from "./user/user.routes.js";
import otpRoutes from "./otp/otp.routes.js";
import { trackingMiddleware } from "./middleware/tracking.middleware.js";
import {
  securityHeaders,
  generalLimiter,
  checkAccountLock,
  requestLogger,
  corsOptions,
} from "./middleware/security.middleware.js";

dotenv.config();

const app = express();

// ✅ Security Headers
app.use(securityHeaders);

// ✅ CORS Configuration
app.use(cors(corsOptions));

// ✅ Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ IP & Geolocation Tracking Middleware
app.use(trackingMiddleware);

// ✅ Request Logging
app.use(requestLogger);

// ✅ General Rate Limiter
app.use(generalLimiter);

// ✅ Account Lock Check
app.use(checkAccountLock);

// ✅ Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET || "mysecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    sameSite: "strict",
  }
}));

// ✅ Routes
app.use("/user", userRoutes);
app.use("/otp", otpRoutes);

// ✅ Health Check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    ip: req.clientIp,
    location: req.geoLocation,
  });
});

export default app;