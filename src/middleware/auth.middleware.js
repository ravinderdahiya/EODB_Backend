import jwt from "jsonwebtoken";

// Read auth_token from httpOnly cookie — no cookie-parser dep needed
const getCookieToken = (req) => {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

export const authMiddleware = (req, res, next) => {
  // Cookie takes priority; Authorization: Bearer <token> works as fallback
  const token = getCookieToken(req) || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
<<<<<<< HEAD
    const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret")
    console.log("✅ Token decoded:", decoded);
    req.user = decoded
    next()
  } catch (err) {
    console.log("❌ Token verification failed:", err.message);
    res.status(401).json({ message: "Invalid token" })
=======
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
>>>>>>> d9acb44 (updated by nitin)
  }
};
