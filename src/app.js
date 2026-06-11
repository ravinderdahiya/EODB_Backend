import express from "express";
import session from "express-session";
import RedisStore from "connect-redis";
import { createClient } from "redis";
import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";

import userRoutes from "./user/user.routes.js";
import otpRoutes from "./otp/otp.routes.js";
import captchaRoutes from "./captcha/captcha.routes.js";
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

let redisSessionClient = null;

export const disconnectRedisSessionClient = async () => {
  if (redisSessionClient && redisSessionClient.isOpen) {
    try {
      await redisSessionClient.disconnect();
      console.log("Redis session client disconnected gracefully.");
    } catch (disconnectError) {
      console.error("Error disconnecting Redis session client:", disconnectError.message);
    }
    redisSessionClient = null;
  }
};

const useSecureCookies = () => (
  String(process.env.ALLOW_INSECURE_COOKIES || "").toLowerCase() !== "true"
);

const createRedisSessionStore = () => {
  if (!process.env.REDIS_URL) return null;

  redisSessionClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      tls: String(process.env.REDIS_TLS || "").toLowerCase() === "true",
      reconnectStrategy: (retries) => Math.min(retries * 50, 500),
    },
  });

  redisSessionClient.on("error", (error) => {
    console.error("Redis session store error:", error);
  });

  redisSessionClient.connect().catch((error) => {
    console.error("Failed to connect Redis session client:", error);
  });

  return new RedisStore({
    client: redisSessionClient,
    prefix: "sess:",
    ttl: 24 * 60 * 60,
    disableTouch: false,
  });
};

const isHttpsRequest = (req) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .toLowerCase();
  const frontEndHttps = String(req.headers["front-end-https"] || "").toLowerCase();
  const forwardedSsl = String(req.headers["x-forwarded-ssl"] || "").toLowerCase();
  const originalProto = String(req.headers["x-original-proto"] || "").toLowerCase();
  const urlScheme = String(req.headers["x-url-scheme"] || "").toLowerCase();
  const cfVisitor = String(req.headers["cf-visitor"] || "").toLowerCase();
  const arrSsl = req.headers["x-arr-ssl"];
  const protoList = forwardedProto
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const isForwardedHttps = protoList.includes("https");
  const isCloudflareHttps = cfVisitor.includes('"scheme":"https"');

  return req.secure
    || isForwardedHttps
    || frontEndHttps === "on"
    || forwardedSsl === "on"
    || originalProto === "https"
    || urlScheme === "https"
    || isCloudflareHttps
    || Boolean(arrSsl);
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

// Public probes — register before session/auth/tracking so Redis/DB hiccups
// cannot turn a simple GET / or /health into a 500.
const sendHealth = (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString().slice(0, 10),
  });
};

const sendApiRoot = (req, res) => {
  res.json({
    status: "ok",
    message: "EODB API running",
    health: "/health",
    frontend: "/eodb/",
  });
};

app.get("/health", sendHealth);
app.head("/health", (req, res) => res.sendStatus(200));
app.get("/", sendApiRoot);
app.head("/", (req, res) => res.sendStatus(200));

// Security Headers
app.use(securityHeaders);

// Compression for dynamic responses
app.use(compression());

// CORS Configuration
app.use(cors(corsOptions));

// Body Parser with safe payload limits
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || "100kb";
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));

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
const sessionStore = createRedisSessionStore();

if (process.env.NODE_ENV === "production" && !sessionStore) {
  console.error("FATAL: REDIS_URL is required in production for session storage.");
  process.exit(1);
}

app.use(session({
  store: sessionStore || undefined,
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
mountApiRoute("/captcha", captchaRoutes);
mountApiRoute("/api-url", apiUrlRoutes);
mountApiRoute("/mapserver", mapserverRoutes);
mountApiRoute("/analytics", analyticsRoutes);
mountApiRoute("/feedback", feedbackRoutes);
mountApiRoute("/vip-users", vipUserRoutes);
mountApiRoute("/map-link", mapLinkRoutes);

// Centralized error handler to avoid generic 500s for known cases (like CORS)
app.use((err, req, res, next) => {
  if (!err) return next();

  if (err.code === "CORS_ORIGIN_DENIED") {
    return res.status(err.status || 403).json({ message: "CORS origin not allowed" });
  }

  if (err.code === "ECONNREFUSED" || /redis|session/i.test(String(err.message || ""))) {
    console.error("Session/store error (request may retry):", err.message);
    return res.status(503).json({ message: "Service temporarily unavailable. Please retry." });
  }

  console.error("Unhandled application error:", err.message, err.stack || "");
  return res.status(err.status || 500).json({ message: "Internal server error" });
});

export default app;
