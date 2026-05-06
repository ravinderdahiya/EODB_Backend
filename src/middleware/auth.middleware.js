import jwt from "jsonwebtoken"

export const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]

  if (!token) {
    return res.status(401).json({ message: "No token" })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret")
    console.log("✅ Token decoded:", decoded);
    req.user = decoded
    next()
  } catch (err) {
    console.log("❌ Token verification failed:", err.message);
    res.status(401).json({ message: "Invalid token" })
  }
}