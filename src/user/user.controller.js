import prisma from "../config/db.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import fetch from "node-fetch"
import { createLoginSession } from "../middleware/security.middleware.js"
import { getRequestDeviceIdentity } from "../utils/device-identity.utils.js"

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

// Get IP 
const getIP = (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
};

const normalizeIpValue = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let ip = raw.includes(",") ? raw.split(",")[0].trim() : raw;
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  return ip || null;
};

const safeString = (value, maxLength = 120) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const formatTimestamp = (value) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

const getEffectiveRole = async (userId, fallbackRole = null) => {
  if (!userId) return String(fallbackRole || "").toLowerCase().trim();

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  return String(dbUser?.role || fallbackRole || "").toLowerCase().trim();
};

const ensureAdminAccess = async (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ message: "Authentication required" });
    return false;
  }

  const role = await getEffectiveRole(req.user.id, req.user.role);
  if (!ADMIN_ROLES.has(role)) {
    res.status(403).json({ message: "Access denied - admin role required" });
    return false;
  }

  return true;
};

const shouldExposeAuthTokenBody = () => (
  String(process.env.EXPOSE_AUTH_TOKEN_BODY || "").toLowerCase() === "true"
);

const LOGIN_SUCCESS_EVENT_TYPES = [
  "login_success",
  "google_login_success",
  "admin_login_success",
];

const SESSION_EVENT_TYPES = [
  "session_start",
  ...LOGIN_SUCCESS_EVENT_TYPES,
];

const INDIA_TIMEZONE_OFFSET_MINUTES = 330;
const ACTIVE_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

const useSecureCookies = () => (
  String(process.env.ALLOW_INSECURE_COOKIES || "").toLowerCase() !== "true"
);

const getAuthCookieOptions = () => ({
  httpOnly: true,
  secure: useSecureCookies(),
  sameSite: useSecureCookies() ? "strict" : "lax",
  maxAge: 24 * 60 * 60 * 1000,
  path: "/",
});

const createAuthenticatedSession = (req, user) => (
  createLoginSession(
    user.id,
    req.clientIp || getIP(req),
    req.geoLocation,
    req.headers["user-agent"] || null,
    getRequestDeviceIdentity(req),
    user.mobile,
  )
);

const signAuthToken = (user, session) => {
  const sessionId = session?.sessionId || session?.id;
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
      sessionId,
      sid: sessionId,
    },
    process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret",
    { expiresIn: "1d" }
  );
};

const buildAuthSuccessPayload = ({ message, token, user }) => ({
  message,
  ...(shouldExposeAuthTokenBody() ? { token } : {}),
  user,
});

const startOfDayForOffset = (date, offsetMinutes) => {
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  return new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - offsetMinutes * 60 * 1000);
};

const startOfToday = () => startOfDayForOffset(new Date(), INDIA_TIMEZONE_OFFSET_MINUTES);

const startOfDaysAgo = (days) => (
  new Date(startOfToday().getTime() - days * 24 * 60 * 60 * 1000)
);

const buildActiveSessionWhere = (now) => {
  const fallbackWindowStart = new Date(now.getTime() - ACTIVE_SESSION_WINDOW_MS);

  return {
    type: "session_start",
    status: "active",
    userId: { not: null },
    OR: [
      { expiresAt: { gt: now } },
      {
        AND: [
          { expiresAt: null },
          { loginAt: { gte: fallbackWindowStart } },
        ],
      },
      {
        AND: [
          { expiresAt: null },
          { loginAt: null },
          { createdAt: { gte: fallbackWindowStart } },
        ],
      },
    ],
  };
};

const buildDistinctSessionWhere = (now) => ({
  ...buildActiveSessionWhere(now),
  sessionId: { not: null },
});


const buildPublicAnnouncements = ({
  registeredLast7Days,
  loggedInToday,
  activeSessions,
  latestSessionLog,
}) => {
  const nowIso = new Date().toISOString();

  const announcements = [
    {
      id: "ann-registered-7d",
      title: "New User Growth",
      description: `${registeredLast7Days} users registered in the last 7 days.`,
      createdAt: nowIso,
      category: "growth",
    },
    {
      id: "ann-login-today",
      title: "Today's Login Activity",
      description: `${loggedInToday} unique users logged in today.`,
      createdAt: nowIso,
      category: "activity",
    },
    {
      id: "ann-active-sessions",
      title: "Current Active Sessions",
      description: `${activeSessions} sessions are currently active.`,
      createdAt: nowIso,
      category: "session",
    },
  ];

  if (latestSessionLog?.createdAt) {
    const latestAt = latestSessionLog.createdAt.toISOString();
    const place = [latestSessionLog.city, latestSessionLog.country].filter(Boolean).join(", ");
    announcements.unshift({
      id: `ann-latest-${latestSessionLog.id}`,
      title: "Latest Platform Activity",
      description: place
        ? `Recent login activity observed from ${place}.`
        : "Recent login activity observed on the platform.",
      createdAt: latestAt,
      category: "latest",
    });
  }

  return announcements
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 4);
};

const recordAuthSuccessLog = async (req, user, type = "login_success") => {
  try {
    await prisma.loginSessionLog.create({
      data: {
        userId: user?.id || null,
        ipAddress: req.clientIp || getIP(req) || "unknown",
        latitude: req.geoLocation?.latitude || null,
        longitude: req.geoLocation?.longitude || null,
        country: req.geoLocation?.country || null,
        city: req.geoLocation?.city || null,
        timezone: req.geoLocation?.timezone || null,
        userAgent: req.headers["user-agent"] || null,
        mobile: user?.mobile ? String(user.mobile).replace(/\D/g, "").slice(-10) : null,
        type,
        status: "success",
        loginAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Auth success log insert failed:", error.message);
  }
};

const updateUserLastLoginSnapshot = async (req, userId) => {
  if (!userId) return;

  try {
    // Update snapshot asynchronously so it does not block login response
    prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginIp: normalizeIpValue(req.clientIp || getIP(req)),
        lastLoginLat: req.geoLocation?.latitude ?? null,
        lastLoginLng: req.geoLocation?.longitude ?? null,
        lastLoginAt: new Date(),
      },
    }).then(() => {
      // no-op on success
    }).catch((error) => {
      console.error("Last login snapshot update failed (async):", error.message);
    });
  } catch (error) {
    console.error("Last login snapshot update failed:", error.message);
  }
};

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

    const session = await createAuthenticatedSession(req, user);

    if (!session?.sessionId) {
      return res.status(500).json({ message: "Unable to create login session" });
    }

    const token = signAuthToken(user, session)

    const ip = getIP(req);

    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.sessionId,
      ip: ip
    };

    await updateUserLastLoginSnapshot(req, user.id);
    await recordAuthSuccessLog(req, user, "login_success");

    res.cookie("auth_token", token, getAuthCookieOptions());

    res.json(buildAuthSuccessPayload({
      message: "Login success",
      token,
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        role: user.role,
        sessionId: session.sessionId
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

    const session = await createAuthenticatedSession(req, user);

    if (!session?.sessionId) {
      return res.status(500).json({ message: "Unable to create login session" });
    }

    const token = signAuthToken(user, session);

    const ip = getIP(req);

    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.sessionId,
      ip: ip
    };

    await updateUserLastLoginSnapshot(req, user.id);
    await recordAuthSuccessLog(req, user, "google_login_success");

    res.cookie("auth_token", token, getAuthCookieOptions());

    res.json(buildAuthSuccessPayload({
      message: "Google login success",
      token,
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        role: user.role,
        sessionId: session.sessionId
      },
    }));
  } catch (error) {
    console.error("Google Login Error:", error);
    res.status(500).json({ message: error.message || "Google login failed" });
  }
};

export const logout = async (req, res) => {
  const sessionId = req.user?.sessionId || req.user?.sid || req.session?.user?.sessionId;

  if (sessionId) {
    await prisma.loginSessionLog.updateMany({
      where: {
        sessionId,
        type: "session_start",
        status: "active",
      },
      data: {
        status: "revoked",
        revokedAt: new Date(),
      },
    });
  }

  // Clear session
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout Error:", err);
      return res.status(500).json({ message: "Logout failed" });
    }

    // Clear auth cookie + client-side storage hints
    res.clearCookie("auth_token", {
      path: "/",
      httpOnly: true,
      secure: useSecureCookies(),
      sameSite: useSecureCookies() ? "strict" : "lax",
    });

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

    // Find admin user by email or full name, preferring the indexed email lookup first.
    let admin = await prisma.user.findUnique({
      where: { email: adminId },
    });

    if (!admin) {
      admin = await prisma.user.findFirst({
        where: {
          fullname: adminId,
          role: { in: ["admin", "superadmin"] },
        },
      });
    }

    if (!admin || !["admin", "superadmin"].includes(admin.role)) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res.status(401).json({ message: "Wrong password" });
    }

    const session = await createAuthenticatedSession(req, admin);

    if (!session?.sessionId) {
      return res.status(500).json({ message: "Unable to create login session" });
    }

    const token = signAuthToken(admin, session);

    const ip = getIP(req);

    req.session.user = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      sessionId: session.sessionId,
      ip: ip
    };

    await updateUserLastLoginSnapshot(req, admin.id);
    await recordAuthSuccessLog(req, admin, "admin_login_success");

    res.cookie("auth_token", token, getAuthCookieOptions());

    res.json(buildAuthSuccessPayload({
      message: "Admin login success",
      token,
      user: {
        id: admin.id,
        email: admin.email,
        fullname: admin.fullname,
        role: admin.role,
        sessionId: session.sessionId
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
    const search = safeString(req.query.search, 120);
    const isSmeQuery = safeString(req.query.issme ?? req.query.isSme, 10);
    const issme = isSmeQuery
      ? ["true", "1", "yes", "y"].includes(isSmeQuery.toLowerCase())
      : false;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const loginEventTypes = [
      ...SESSION_EVENT_TYPES,
      "login_failed",
    ];
    const where = {
      createdAt: { gte: twoDaysAgo },
      type: { in: loginEventTypes },
      ...(issme
        ? {
            user: {
              is: { role: "sme" },
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { ipAddress: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
              { country: { contains: search, mode: "insensitive" } },
              { mobile: { contains: search, mode: "insensitive" } },
              { userAgent: { contains: search, mode: "insensitive" } },
              {
                user: {
                  is: {
                    OR: [
                      { fullname: { contains: search, mode: "insensitive" } },
                      { email: { contains: search, mode: "insensitive" } },
                      { mobile: { contains: search, mode: "insensitive" } },
                      { role: { contains: search, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const totalCount = await prisma.loginSessionLog.count({
      where,
    });

    const logs = await prisma.loginSessionLog.findMany({
      where,
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
            mobile: true,
          },
        },
      },
    });

    const formatted = logs.map((entry) => {
      const deviceParts = [
        entry.userAgent ? `UA: ${entry.userAgent}` : null,
        entry.deviceId ? `DeviceID: ${entry.deviceId}` : null,
        entry.deviceImei ? `IMEI: ${entry.deviceImei}` : null,
      ].filter(Boolean);

      return {
      id: entry.id,
      userId: entry.user?.id ? `USR-${entry.user.id.toString().padStart(4, "0")}` : entry.mobile || entry.user?.mobile || "Unknown",
      name: entry.user?.fullname || entry.mobile || entry.user?.mobile || "Unknown",
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
      device: deviceParts.length ? deviceParts.join(" | ") : "-",
      deviceId: entry.deviceId || "-",
      deviceImei: entry.deviceImei || "-",
      deviceInfo: entry.deviceInfo || "-",
      mobile: entry.mobile || entry.user?.mobile || "-",
      city: entry.city || "-",
      country: entry.country || "-",
      latitude: entry.latitude != null ? entry.latitude : null,
      longitude: entry.longitude != null ? entry.longitude : null,
      coordinates:
        entry.latitude != null && entry.longitude != null
          ? `${entry.latitude}, ${entry.longitude}`
          : "-",
      status: entry.status || (entry.type === "login_failed" ? "Failed" : "Success"),
      };
    });

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

export const getPublicLoginInsights = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = startOfToday();
    const sevenDaysAgo = startOfDaysAgo(7);
    const activeSessionWhere = buildActiveSessionWhere(now);
    const distinctSessionWhere = buildDistinctSessionWhere(now);

    const [
      totalRegisteredUsers,
      registeredLast7Days,
      loggedInTodayUsersRaw,
      activeSessionsRaw,
      activeUsersRaw,
      latestSessionLog,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.loginSessionLog.findMany({
        where: {
          type: { in: LOGIN_SUCCESS_EVENT_TYPES },
          createdAt: { gte: todayStart },
          userId: { not: null },
        },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.loginSessionLog.findMany({
        where: distinctSessionWhere,
        select: { sessionId: true },
        distinct: ["sessionId"],
      }),
      prisma.loginSessionLog.findMany({
        where: activeSessionWhere,
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.loginSessionLog.findFirst({
        where: {
          type: { in: SESSION_EVENT_TYPES },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          city: true,
          country: true,
        },
      }),
    ]);

    const loggedInToday = loggedInTodayUsersRaw.length;
    const activeSessions = activeSessionsRaw.length;

    const announcements = buildPublicAnnouncements({
      registeredLast7Days,
      loggedInToday,
      activeSessions,
      latestSessionLog,
    });

    return res.json({
      metrics: {
        totalRegisteredUsers,
        activeSessions,
        activeUsers: activeUsersRaw.length,
        loggedInToday,
      },
      announcements,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("Get Public Login Insights Error:", error);
    const nowIso = new Date().toISOString();
    return res.json({
      metrics: {
        totalRegisteredUsers: 0,
        activeSessions: 0,
        activeUsers: 0,
        loggedInToday: 0,
      },
      announcements: [],
      generatedAt: nowIso,
      degraded: true,
    });
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

export const getUsersList = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 5), 50);
    const skip = (page - 1) * pageSize;
    const search = safeString(req.query.search, 120);
    const role = safeString(req.query.role, 40);
    const isSmeQuery = safeString(req.query.issme ?? req.query.isSme, 10);
    const issme = isSmeQuery
      ? ["true", "1", "yes", "y"].includes(isSmeQuery.toLowerCase())
      : false;

    const effectiveRoleFilter = role || (issme ? "sme" : null);

    const where = {
      ...(effectiveRoleFilter ? { role: effectiveRoleFilter } : {}),
      ...(search
        ? {
            OR: [
              { fullname: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { mobile: { contains: search, mode: "insensitive" } },
              { role: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [totalCount, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          fullname: true,
          email: true,
          mobile: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
          lastLoginIp: true,
          isLocked: true,
          loginAttempts: true,
        },
      }),
    ]);

    const rows = users.map((entry) => ({
      id: entry.id,
      userId: `USR-${String(entry.id).padStart(4, "0")}`,
      name: entry.fullname || "-",
      email: entry.email || "-",
      mobile: entry.mobile || "-",
      role: entry.role || "-",
      createdAt: formatTimestamp(entry.createdAt),
      lastLoginAt: entry.lastLoginAt ? formatTimestamp(entry.lastLoginAt) : "-",
      lastLoginIp: entry.lastLoginIp || "-",
      isLocked: Boolean(entry.isLocked),
      loginAttempts: entry.loginAttempts ?? 0,
      status: entry.isLocked ? "Locked" : "Active",
    }));

    return res.json({
      message: "Users fetched successfully",
      page,
      pageSize,
      totalCount,
      users: rows,
    });
  } catch (error) {
    console.error("Get Users List Error:", error);
    return res.status(500).json({ message: "Unable to fetch users list" });
  }
};
