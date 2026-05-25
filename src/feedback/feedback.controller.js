import prisma from "../config/db.js";

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

const safeString = (value, maxLength = 300) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const normalizeMobile = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(/[^\d+]/g, "");
  if (!/^\+?\d{8,15}$/.test(normalized)) return null;
  return normalized;
};

const normalizeEmail = (value) => {
  const email = safeString(value, 190);
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null;
};

const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
  || req.headers["x-real-ip"]
  || req.clientIp
  || req.socket.remoteAddress
  || null;

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

const formatTimestamp = (value) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

export const submitFeedback = async (req, res) => {
  try {
    const name = safeString(req.body?.name, 120);
    const message = safeString(req.body?.message, 1200);
    const mobileRaw = safeString(req.body?.mobile, 24);
    const emailRaw = safeString(req.body?.email, 190);
    const pageUrl = safeString(req.body?.pageUrl, 800);

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!message) {
      return res.status(400).json({ message: "Feedback message is required" });
    }

    let mobile = null;
    if (mobileRaw) {
      mobile = normalizeMobile(mobileRaw);
      if (!mobile) {
        return res.status(400).json({ message: "Invalid mobile number format" });
      }
    }

    let email = null;
    if (emailRaw) {
      email = normalizeEmail(emailRaw);
      if (!email) {
        return res.status(400).json({ message: "Invalid email format" });
      }
    }

    const saved = await prisma.feedback.create({
      data: {
        name,
        mobile,
        email,
        message,
        pageUrl,
        userId: req.user?.id || null,
        ipAddress: safeString(getClientIp(req), 120),
        userAgent: safeString(req.headers["user-agent"], 500),
      },
    });

    return res.status(201).json({
      message: "Feedback submitted successfully",
      feedbackId: saved.id,
    });
  } catch (error) {
    console.error("Submit Feedback Error:", error);
    return res.status(500).json({ message: "Unable to submit feedback" });
  }
};

export const getFeedbackHistory = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 5), 50);
    const skip = (page - 1) * pageSize;
    const search = safeString(req.query.search, 120);
    const status = safeString(req.query.status, 40);

    const where = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { message: { contains: search, mode: "insensitive" } },
              { mobile: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { pageUrl: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [totalCount, rows] = await Promise.all([
      prisma.feedback.count({ where }),
      prisma.feedback.findMany({
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
            },
          },
        },
      }),
    ]);

    const feedbacks = rows.map((entry) => ({
      id: entry.id,
      name: entry.name,
      mobile: entry.mobile || "-",
      email: entry.email || "-",
      message: entry.message,
      pageUrl: entry.pageUrl || "-",
      status: entry.status || "new",
      timestamp: formatTimestamp(entry.createdAt),
      ipAddress: entry.ipAddress || "-",
      userAgent: entry.userAgent || "-",
      userId: entry.user?.id ? `USR-${String(entry.user.id).padStart(4, "0")}` : "Guest",
      userName: entry.user?.fullname || "Guest",
      userRole: entry.user?.role || "-",
    }));

    return res.json({
      message: "Feedback history fetched successfully",
      page,
      pageSize,
      totalCount,
      feedbacks,
    });
  } catch (error) {
    console.error("Get Feedback History Error:", error);
    return res.status(500).json({ message: "Unable to fetch feedback history" });
  }
};
