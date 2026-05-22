import prisma from "../config/db.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import fetch from "node-fetch"


// Get IP 
const getIP = (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
};

const shouldExposeAuthTokenBody = () => (
  String(process.env.EXPOSE_AUTH_TOKEN_BODY || "").toLowerCase() === "true"
);

const buildAuthSuccessPayload = ({ message, token, user }) => ({
  message,
  ...(shouldExposeAuthTokenBody() ? { token } : {}),
  user,
});

const verifyGoogleIdToken = async (idToken) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Google Client ID is not configured on the server");
  }

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Invalid Google token: ${body}`);
  }

  const payload = await response.json();

  if (!payload.email || payload.email_verified === false || payload.email_verified === "false") {
    throw new Error("Google account is not verified");
  }

  if (payload.aud !== clientId) {
    throw new Error("Google token audience mismatch");
  }

  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) {
    throw new Error("Invalid Google token issuer");
  }

  return payload;
};

const createGoogleUserMobile = (sub) => {
  return `google:${sub}`;
};

// SIGNUP
export const signup = async (req, res) => {
  try {
    const { fullname, email, password, mobile } = req.body

    // basic validation
    if (!fullname || !email || !password || !mobile) {
      return res.status(400).json({ message: "All fields are required" })
    }

    const exist = await prisma.user.findUnique({
      where: { email }
    })

    if (exist) {
      return res.status(400).json({ message: "User already exists" })
    }

    const hash = await bcrypt.hash(password, 10)

    await prisma.user.create({
      data: {
        fullname,
        email,
        password: hash,
        mobile
      }
    })

    res.json({ message: "Signup successful" })

  } catch (error) {
    console.error("Signup Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}


// LOGIN

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    console.log(req.body)

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" })
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    const match = await bcrypt.compare(password, user.password)

    if (!match) {
      return res.status(401).json({ message: "Wrong password" })
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret",
      { expiresIn: "1d" }
    )

    const ip = getIP(req);

    req.session.user = {
      id: user.id,
      email: user.email,
      ip: ip
    };

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json(buildAuthSuccessPayload({
      message: "Login success",
      token,
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        role: user.role
      },
    }))

  } catch (error) {
    console.error("Login Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: "Google credential is required" });
    }

    const googlePayload = await verifyGoogleIdToken(credential);
    const { email, name, sub } = googlePayload;

    let user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      const randomPassword = await bcrypt.hash(`${Date.now()}-${Math.random()}`, 10);
      user = await prisma.user.create({
        data: {
          fullname: name || email.split("@")[0],
          email,
          password: randomPassword,
          mobile: createGoogleUserMobile(sub)
        }
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret",
      { expiresIn: "1d" }
    );

    const ip = getIP(req);

    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      ip: ip
    };

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json(buildAuthSuccessPayload({
      message: "Google login success",
      token,
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        role: user.role
      },
    }));
  } catch (error) {
    console.error("Google Login Error:", error);
    res.status(500).json({ message: error.message || "Google login failed" });
  }
};

export const logout = (req, res) => {
  // Clear session
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout Error:", err);
      return res.status(500).json({ message: "Logout failed" });
    }

    // Clear auth cookie + client-side storage hints
    res.clearCookie("auth_token", { path: "/" });

    res.json({
      message: "Logout success",
      clearStorage: true
    });
  });
};

// ADMIN LOGIN (supports both admin and superadmin roles)
export const adminLogin = async (req, res) => {
  try {
    const { adminId, password } = req.body;

    if (!adminId || !password) {
      return res.status(400).json({ message: "Admin ID and password required" });
    }

    // Find admin user by email/adminId and role (admin or superadmin)
    const admin = await prisma.user.findFirst({
      where: {
        OR: [
          { email: adminId },
          { fullname: adminId }
        ],
        role: { in: ["admin", "superadmin"] }
      }
    });

    console.log("Admin lookup result:", admin);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res.status(401).json({ message: "Wrong password" });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role
      },
      process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret",
      { expiresIn: "1d" }
    );

    const ip = getIP(req);

    req.session.user = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      ip: ip
    };

    res.cookie("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.json(buildAuthSuccessPayload({
      message: "Admin login success",
      token,
      user: {
        id: admin.id,
        email: admin.email,
        fullname: admin.fullname,
        role: admin.role
      },
    }));

  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getLoginLogs = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(403).json({ message: "Access denied - no user in token" });
    }

    const userId = req.user.id;
    const tokenRole = req.user.role;

    // Use DB role as source of truth (token may carry stale role)
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const effectiveRole = String(dbUser?.role || tokenRole || "").toLowerCase().trim();

    if (!["admin", "superadmin"].includes(effectiveRole)) {
      return res.status(403).json({
        message: "Access denied - user must be admin or superadmin",
        tokenRole,
        dbRole: dbUser?.role || null,
      });
    }

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
  } else if (req.user) {
    res.json({
      id: req.user.id,
      email: req.user.email || null,
      role: req.user.role || null,
      mobile: req.user.mobile || null,
    });
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
};

// DEBUG: Check current token user info
export const getTokenInfo = async (req, res) => {
  try {
    console.log("Token Info - req.user:", req.user);

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
