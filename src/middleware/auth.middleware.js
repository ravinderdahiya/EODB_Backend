import jwt from "jsonwebtoken";
import prisma from "../config/db.js";
import { getCache, setCache, delCache } from "../utils/cache.js";

// Active sessions are validated against the DB on every authenticated request.
// The map fires many requests per interaction, so we cache a successful validation
// briefly (default 30s). This collapses dozens of identical DB lookups (including
// the double check from the global guard + per-router guard) into one.
const SESSION_CACHE_TTL_SECONDS = Number(process.env.SESSION_CACHE_TTL_SECONDS || 30);
const sessionCacheKey = (sessionId) => `authSession:${sessionId}`;

// Invalidate the cached session immediately (used on logout) so a revoked session
// cannot keep passing auth for the remainder of the cache window.
export const invalidateSessionCache = async (sessionId) => {
  if (!sessionId) return;
  try {
    await delCache(sessionCacheKey(sessionId));
  } catch {
    // Cache invalidation is best-effort; DB revoke remains the source of truth.
  }
};

// Read auth_token from httpOnly cookie (no cookie-parser dep needed)
const getCookieToken = (req) => {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const PUBLIC_ROUTE_RULES = [
  { method: "GET", path: "/" },
  { method: "POST", path: "/user/signup" },
  { method: "POST", path: "/user/login" },
  { method: "POST", path: "/user/admin-login" },
  { method: "POST", path: "/user/google-login" },
  { method: "GET", path: "/user/public-login-insights" },
  { method: "GET", path: "/captcha/new" },
  { method: "POST", path: "/otp/send-otp" },
  { method: "POST", path: "/otp/resend-otp" },
  { method: "POST", path: "/otp/verify-otp" },
  { method: "GET", path: "/api-url/frontend-config" },
  { method: "POST", path: "/feedback/submit" },
  { method: "GET", path: "/health" },
];

const normalizeRequestPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "/";

  let normalized = raw.startsWith("/") ? raw : `/${raw}`;

  // IIS subdirectory deployments may forward /eodb_backend/... to Express.
  if (normalized === "/eodb_backend") {
    normalized = "/";
  } else {
    normalized = normalized.replace(/^\/eodb_backend(?=\/|$)/i, "");
    if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  }

  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/, "");
  }

  return normalized.toLowerCase();
};

function isPublicRoute(req) {
  const method = (req.method || "").toUpperCase();
  const path = normalizeRequestPath(req.path || req.originalUrl || "");

  return PUBLIC_ROUTE_RULES.some((rule) => (
    rule.method === method && path === normalizeRequestPath(rule.path)
  ));
}

export const authMiddleware = async (req, res, next) => {
  // Authorization header takes priority; cookie works as fallback
  const token = req.headers.authorization?.split(" ")[1] || getCookieToken(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret");
    const sessionId = decoded.sessionId || decoded.sid;

    if (!sessionId) {
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    const cacheKey = sessionCacheKey(sessionId);
    const cachedSession = await getCache(cacheKey);
    if (cachedSession && cachedSession.userId === decoded.id) {
      req.user = decoded;
      req.authSession = cachedSession;
      return next();
    }

    const activeSession = await prisma.loginSessionLog.findFirst({
      where: {
        sessionId,
        userId: decoded.id,
        type: "session_start",
        status: "active",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, sessionId: true },
    });

    if (!activeSession) {
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    // Cache the validated session (include userId so a cached entry can never be
    // reused for a different user) for a short window.
    await setCache(
      cacheKey,
      { id: activeSession.id, sessionId: activeSession.sessionId, userId: decoded.id },
      SESSION_CACHE_TTL_SECONDS,
    );

    req.user = decoded;
    req.authSession = activeSession;
    next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Session expired. Please login again." });
    }

    res.status(401).json({ message: "Invalid or expired token" });
  }
};

export const requireAuthUnlessPublic = (req, res, next) => {
  if (req.method === "OPTIONS") {
    return next();
  }

  if (isPublicRoute(req)) {
    return next();
  }

  return authMiddleware(req, res, next);
};

