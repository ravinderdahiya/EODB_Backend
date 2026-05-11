import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";

import userRoutes from "./user/user.routes.js";
import otpRoutes from "./otp/otp.routes.js";
import apiUrlRoutes from "./api-url/api-url.routes.js";
import mapserverRoutes from "./mapserver/mapserver.routes.js";
import { trackingMiddleware } from "./middleware/tracking.middleware.js";
import {
  securityHeaders,
  generalLimiter,
  checkAccountLock,
  requestLogger,
  corsOptions,
} from "./middleware/security.middleware.js";
import analyticsService from "./services/analyticsService.js";

dotenv.config();

const app = express();

// ✅ IIS virtual directory fix
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
  secret: process.env.SESSION_SECRET,
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
app.use("/api-url", apiUrlRoutes);
app.use("/mapserver", mapserverRoutes);

// ✅ Response Tracking Middleware (must be after routes)
app.use((req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;

  // Override send method
  res.send = function(data) {
    // Track API response in Google Analytics
    analyticsService.trackApiUsage(req.path, req.method, res.statusCode, req.user?.id);

    // Call original send
    return originalSend.call(this, data);
  };

  // Override json method
  res.json = function(data) {
    // Track API response in Google Analytics
    analyticsService.trackApiUsage(req.path, req.method, res.statusCode, req.user?.id);

    // Call original json
    return originalJson.call(this, data);
  };

  next();
});

// Health Check — no client data in response (IP/location removed — was H-3 data leak)
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

export default app;