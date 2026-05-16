import jwt from "jsonwebtoken";

// Read auth_token from httpOnly cookie (no cookie-parser dep needed)
const getCookieToken = (req) => {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const PUBLIC_ROUTE_RULES = [
  { method: "POST", path: "/user/signup" },
  { method: "POST", path: "/user/login" },
  { method: "POST", path: "/user/admin-login" },
  { method: "POST", path: "/user/google-login" },
  { method: "POST", path: "/otp/send-otp" },
  { method: "POST", path: "/otp/resend-otp" },
  { method: "POST", path: "/otp/verify-otp" },
  { method: "GET", path: "/api-url/frontend-config" },
  { method: "GET", path: "/health" },
];

function isPublicRoute(req) {
  const method = (req.method || "").toUpperCase();
  const path = req.path || req.originalUrl || "";

  return PUBLIC_ROUTE_RULES.some((rule) => (
    rule.method === method && path === rule.path
  ));
}

export const authMiddleware = (req, res, next) => {
  // Authorization header takes priority; cookie works as fallback
  const token = req.headers.authorization?.split(" ")[1] || getCookieToken(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret");
    req.user = decoded;
    next();
  } catch {
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

