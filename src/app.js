import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";

import userRoutes from "./user/user.routes.js";
import otpRoutes from "./otp/otp.routes.js";
import apiUrlRoutes from "./api-url/api-url.routes.js";
import mapserverRoutes from "./mapserver/mapserver.routes.js";
import analyticsRoutes from "./analytics/analytics.routes.js";
import { trackingMiddleware } from "./middleware/tracking.middleware.js";
import { requireAuthUnlessPublic } from "./middleware/auth.middleware.js";
import {
  securityHeaders,
  generalLimiter,
  checkAccountLock,
  requestLogger,
  corsOptions,
} from "./middleware/security.middleware.js";

dotenv.config();

const app = express();

// IIS virtual directory fix
// If IIS forwards URL like /eodb_backend/otp/send-otp,
// remove /eodb_backend before Express route matching.
app.use((req, res, next) => {
  if (req.url === "/eodb_backend") {
    req.url = "/";
  } else if (req.url.startsWith("/eodb_backend/")) {
    req.url = req.url.replace(/^\/eodb_backend/, "");
  }
  next();
});

// Security Headers
app.use(securityHeaders);

// CORS Configuration
app.use(cors(corsOptions));

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// IP & Geolocation Tracking Middleware
app.use(trackingMiddleware);

// Request Logging
app.use(requestLogger);

// General Rate Limiter
app.use(generalLimiter);

// Account Lock Check
app.use(checkAccountLock);

// Session Configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    sameSite: "strict",
  },
}));

// Secure-by-default: every API needs auth token unless explicitly whitelisted.
app.use(requireAuthUnlessPublic);

// Routes
app.use("/user", userRoutes);
app.use("/otp", otpRoutes);
app.use("/api-url", apiUrlRoutes);
app.use("/mapserver", mapserverRoutes);
app.use("/analytics", analyticsRoutes);

// Health Check - no client data in response
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handler to avoid generic 500s for known cases (like CORS)
app.use((err, req, res, next) => {
  if (!err) return next();

  if (err.code === "CORS_ORIGIN_DENIED") {
    return res.status(err.status || 403).json({ message: "CORS origin not allowed" });
  }

  console.error("Unhandled application error:", err.message);
  return res.status(err.status || 500).json({ message: "Internal server error" });
});

export default app;
