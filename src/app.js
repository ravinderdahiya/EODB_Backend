import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";

import userRoutes from "./user/user.routes.js";
import otpRoutes from "./otp/otp.routes.js";
import apiUrlRoutes from "./api-url/api-url.routes.js";
import mapserverRoutes from "./mapserver/mapserver.routes.js";
import analyticsRoutes from "./analytics/analytics.routes.js";
import feedbackRoutes from "./feedback/feedback.routes.js";
import vipUserRoutes from "./vip-user/vip-user.routes.js";
import mapLinkRoutes from "./map-link/map-link.routes.js";
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
app.disable("x-powered-by");
app.set("trust proxy", 1);

const useSecureCookies = () => (
  String(process.env.ALLOW_INSECURE_COOKIES || "").toLowerCase() !== "true"
);

const isHttpsRequest = (req) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const frontEndHttps = String(req.headers["front-end-https"] || "").toLowerCase();
  const arrSsl = req.headers["x-arr-ssl"];

  return req.secure || forwardedProto === "https" || frontEndHttps === "on" || Boolean(arrSsl);
};

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

// Enforce HTTPS in production so credentials/OTP are never accepted over cleartext HTTP.
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") return next();
  if (isHttpsRequest(req)) return next();

  return res.status(426).json({ message: "HTTPS required" });
});

// Explicitly block unsafe HTTP verbs often flagged by scanners.
app.use((req, res, next) => {
  const method = String(req.method || "").toUpperCase();
  if (method === "TRACE" || method === "TRACK") {
    res.setHeader("Allow", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
    return res.status(405).json({ message: `HTTP method ${method} is not allowed` });
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

// Prevent API response caching for dynamic/sensitive endpoints.
app.use((req, res, next) => {
  if (req.path.startsWith("/mapserver/service/")) return next();
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

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
    secure: useSecureCookies(),
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    sameSite: useSecureCookies() ? "strict" : "lax",
  },
}));

// Secure-by-default: every API needs auth token unless explicitly whitelisted.
app.use(requireAuthUnlessPublic);

// Routes
const mountApiRoute = (path, router) => {
  app.use(path, router);
  // Extra compatibility for IIS setups that forward subdirectory prefix as-is.
  app.use(`/eodb_backend${path}`, router);
};

mountApiRoute("/user", userRoutes);
mountApiRoute("/otp", otpRoutes);
mountApiRoute("/api-url", apiUrlRoutes);
mountApiRoute("/mapserver", mapserverRoutes);
mountApiRoute("/analytics", analyticsRoutes);
mountApiRoute("/feedback", feedbackRoutes);
mountApiRoute("/vip-users", vipUserRoutes);
mountApiRoute("/map-link", mapLinkRoutes);

// Health Check - no client data in response
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString().slice(0, 10),
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
