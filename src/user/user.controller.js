import prisma from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const getIP = (req) => req.headers["x-forwarded-for"] || req.socket.remoteAddress;

const setAuthCookie = (res, token) => {
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });
};

// SIGNUP
export const signup = async (req, res) => {
  try {
    const { fullname, email, password, mobile } = req.body;

    if (!fullname || !email || !password || !mobile) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const exist = await prisma.user.findUnique({ where: { email } });
    if (exist) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { fullname, email, password: hash, mobile } });

    res.json({ message: "Signup successful" });
  } catch (error) {
    console.error("Signup Error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// LOGIN (email + password)
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Generic message — do not distinguish "user not found" vs "wrong password"
    const INVALID_MSG = "Invalid email or password";

    if (!user) {
      // Still run bcrypt to prevent timing attack
      await bcrypt.compare(password, "$2b$10$invalidhashtopreventtimingattack00000000000");
      return res.status(401).json({ message: INVALID_MSG });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: INVALID_MSG });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    req.session.user = { id: user.id, email: user.email, ip: getIP(req) };
    setAuthCookie(res, token);

    res.json({
      message: "Login success",
      user: { id: user.id, email: user.email, fullname: user.fullname, role: user.role },
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

// LOGOUT
export const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout Error:", err.message);
      return res.status(500).json({ message: "Logout failed" });
    }
    res.clearCookie("auth_token", { httpOnly: true, path: "/" });
    res.json({ message: "Logout success" });
  });
};

// ADMIN LOGIN
export const adminLogin = async (req, res) => {
  try {
    const { adminId, password } = req.body;

    if (!adminId || !password) {
      return res.status(400).json({ message: "Admin ID and password required" });
    }

    const admin = await prisma.user.findFirst({
      where: {
        OR: [{ email: adminId }, { fullname: adminId }],
        role: { in: ["admin", "superadmin"] },
      },
    });

<<<<<<< HEAD
    console.log("🔍 Admin lookup result:", admin);

    if (!admin) {
      console.log("❌ Admin not found for:", adminId);
      return res.status(404).json({ message: "Admin not found" });
=======
    const INVALID_MSG = "Invalid admin ID or password";

    if (!admin) {
      await bcrypt.compare(password, "$2b$10$invalidhashtopreventtimingattack00000000000");
      return res.status(401).json({ message: INVALID_MSG });
>>>>>>> d9acb44 (updated by nitin)
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) {
      return res.status(401).json({ message: INVALID_MSG });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

<<<<<<< HEAD
    console.log("🔑 JWT Token created with payload - id:", admin.id, "email:", admin.email, "role:", admin.role);

    const ip = getIP(req);

    req.session.user = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      ip: ip
    };
=======
    req.session.user = { id: admin.id, email: admin.email, role: admin.role, ip: getIP(req) };
    setAuthCookie(res, token);
>>>>>>> d9acb44 (updated by nitin)

    res.json({
      message: "Admin login success",
      user: { id: admin.id, email: admin.email, fullname: admin.fullname, role: admin.role },
    });
  } catch (error) {
    console.error("Admin Login Error:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getLoginLogs = async (req, res) => {
  try {
    console.log("🔍 getLoginLogs called");
    console.log("📦 req.user full object:", JSON.stringify(req.user, null, 2));

    if (!req.user) {
      console.log("❌ ERROR: No req.user - auth middleware may have failed");
      return res.status(403).json({ message: "Access denied - no user in token" });
    }

    const userId = req.user.id;
    const userEmail = req.user.email;
    const userRole = req.user.role;

    console.log(`📋 User - ID: ${userId}, Email: ${userEmail}, Role: "${userRole}" (type: ${typeof userRole})`);

    const normalizedRole = String(userRole || "").toLowerCase().trim();
    console.log(`🔑 Normalized role: "${normalizedRole}"`);

    if (!["admin", "superadmin"].includes(normalizedRole)) {
      console.log(`❌ Access denied - role "${normalizedRole}" is not admin/superadmin`);
      return res.status(403).json({
        message: "Access denied - user must be admin or superadmin",
        userRole: userRole,
        normalizedRole: normalizedRole,
      });
    }

    console.log("✅ Role check passed, fetching login logs...");

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 5), 50);
    const skip = (page - 1) * pageSize;

    const totalCount = await prisma.loginSessionLog.count();

    const logs = await prisma.loginSessionLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        user: {
          select: {
            id: true,
            fullname: true,
            email: true,
            role: true,
          },
        },
      },
    });

    const formatted = logs.map((entry) => ({
      id: entry.id,
      userId: entry.user?.id ? `USR-${entry.user.id.toString().padStart(4, "0")}` : entry.mobile || "Unknown",
      name: entry.user?.fullname || entry.mobile || "Unknown",
      email: entry.user?.email || "-",
      role: entry.user?.role || "-",
      timestamp: entry.loginAt
        ? new Date(entry.loginAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : new Date(entry.createdAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
      ipAddress: entry.ipAddress || "-",
      device: entry.userAgent || "-",
      mobile: entry.mobile || "-",
      city: entry.city || "-",
      country: entry.country || "-",
      latitude: entry.latitude != null ? entry.latitude : null,
      longitude: entry.longitude != null ? entry.longitude : null,
      coordinates:
        entry.latitude != null && entry.longitude != null
          ? `${entry.latitude}, ${entry.longitude}`
          : "-",
      status: entry.status || (entry.type === "login_failed" ? "Failed" : "Success"),
    }));

    res.json({
      logs: formatted,
      totalCount,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Get Login Logs Error:", error);
    res.status(500).json({ message: "Unable to load login logs" });
  }
};

export const getMe = (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
};
<<<<<<< HEAD

// DEBUG: Check current token user info
export const getTokenInfo = async (req, res) => {
  try {
    console.log("🔍 Token Info - req.user:", req.user);
    
    if (!req.user) {
      return res.status(401).json({ message: "No valid token" });
    }

    // Get user from database to compare
    const dbUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, fullname: true, role: true }
    });

    res.json({
      tokenInfo: req.user,
      databaseInfo: dbUser,
      roleMatch: dbUser?.role === req.user.role,
      isAdmin: ["admin", "superadmin"].includes(String(req.user.role || "").toLowerCase())
    });
  } catch (error) {
    console.error("Get Token Info Error:", error);
    res.status(500).json({ message: "Error fetching token info" });
  }
};

// DEBUG: List all admin users in database
export const getAdminUsers = async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: {
        role: { in: ["admin", "superadmin"] }
      },
      select: { id: true, email: true, fullname: true, role: true, mobile: true }
    });

    res.json({
      count: admins.length,
      admins: admins
    });
  } catch (error) {
    console.error("Get Admin Users Error:", error);
    res.status(500).json({ message: "Error fetching admin users" });
  }
};
=======
>>>>>>> d9acb44 (updated by nitin)
