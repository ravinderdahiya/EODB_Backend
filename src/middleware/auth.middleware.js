import jwt from "jsonwebtoken";

// Read auth_token from httpOnly cookie (no cookie-parser dep needed)
const getCookieToken = (req) => {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

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

