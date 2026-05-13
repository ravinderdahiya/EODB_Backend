import prisma from "../config/db.js";

const ADMIN_ROLES = new Set(["admin", "superadmin"]);
const CATEGORY_COLORS = [
  "var(--green)",
  "var(--blue)",
  "var(--orange)",
  "var(--mint)",
  "#93d64c",
  "#5cc8ff",
];

const safeString = (value, maxLength = 300) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
  || req.headers["x-real-ip"]
  || req.socket.remoteAddress
  || null;

const getEffectiveRole = async (userId, fallbackRole = null) => {
  if (!userId) return String(fallbackRole || "").toLowerCase();

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

const getDateWindow = (days) => {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to: now };
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

export const captureAnalyticsEvent = async (req, res) => {
  try {
    const eventType = safeString(req.body?.eventType, 120);
    if (!eventType) {
      return res.status(400).json({ message: "eventType is required" });
    }

    const payload = {
      eventType,
      category: safeString(req.body?.category, 120),
      action: safeString(req.body?.action, 180),
      label: safeString(req.body?.label, 500),
      value: toNumberOrNull(req.body?.value),
      page: safeString(req.body?.page, 500),
      title: safeString(req.body?.title, 240),
      userId: req.user?.id || null,
      clientId: safeString(req.body?.clientId, 120),
      source: safeString(req.body?.source, 40) || "frontend",
      metadata:
        req.body?.metadata && typeof req.body.metadata === "object"
          ? req.body.metadata
          : null,
      ipAddress: safeString(getClientIp(req), 120),
      userAgent: safeString(req.headers["user-agent"], 500),
    };

    const saved = await prisma.analyticsEvent.create({ data: payload });

    return res.status(201).json({
      message: "Analytics event saved",
      id: saved.id,
    });
  } catch (error) {
    console.error("Capture Analytics Event Error:", error);
    return res.status(500).json({ message: "Unable to save analytics event" });
  }
};

export const getAnalyticsSummary = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);
    const { from, to } = getDateWindow(days);
    const where = { createdAt: { gte: from, lte: to } };

    const [
      totalEvents,
      topCategoriesRaw,
      topEventTypesRaw,
      usersWithEvents,
      recentEventsRaw,
      trendRows,
      latestEvent,
    ] = await Promise.all([
      prisma.analyticsEvent.count({ where }),
      prisma.analyticsEvent.groupBy({
        by: ["category"],
        where: { ...where, category: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { category: "desc" } },
        take: 6,
      }),
      prisma.analyticsEvent.groupBy({
        by: ["eventType"],
        where,
        _count: { _all: true },
        orderBy: { _count: { eventType: "desc" } },
        take: 6,
      }),
      prisma.analyticsEvent.groupBy({
        by: ["userId"],
        where: { ...where, userId: { not: null } },
      }),
      prisma.analyticsEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.analyticsEvent.findMany({
        where,
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      prisma.analyticsEvent.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);

    const trendMap = new Map();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(from);
      date.setDate(from.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      trendMap.set(key, {
        label: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        value: 0,
      });
    }

    trendRows.forEach((row) => {
      const key = row.createdAt.toISOString().slice(0, 10);
      const item = trendMap.get(key);
      if (item) item.value += 1;
    });

    const categorySeries = topCategoriesRaw.map((entry, index) => ({
      id: `${entry.category || "uncategorized"}-${index}`,
      label: entry.category || "Uncategorized",
      events: entry._count._all,
      fill: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    }));

    const topEventTypes = topEventTypesRaw.map((entry) => ({
      type: entry.eventType,
      count: entry._count._all,
    }));

    const recentEvents = recentEventsRaw.map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      category: entry.category || "-",
      action: entry.action || "-",
      page: entry.page || "-",
      timestamp: formatTimestamp(entry.createdAt),
      userId: entry.userId ? `USR-${String(entry.userId).padStart(4, "0")}` : "Guest",
      source: entry.source || "frontend",
    }));

    return res.json({
      message: "Analytics summary fetched successfully",
      data: {
        stats: {
          totalEvents,
          uniqueTrackedUsers: usersWithEvents.length,
          activeDays: days,
          lastEventAt: latestEvent?.createdAt || null,
        },
        trendSeries: Array.from(trendMap.values()),
        categorySeries,
        topEventTypes,
        recentEvents,
      },
    });
  } catch (error) {
    console.error("Get Analytics Summary Error:", error);
    return res.status(500).json({ message: "Unable to fetch analytics summary" });
  }
};

export const getAnalyticsEvents = async (req, res) => {
  try {
    const hasAccess = await ensureAdminAccess(req, res);
    if (!hasAccess) return;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 5), 50);
    const skip = (page - 1) * pageSize;
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 120);
    const search = safeString(req.query.search, 120);
    const category = safeString(req.query.category, 120);
    const eventType = safeString(req.query.eventType, 120);
    const { from, to } = getDateWindow(days);

    const where = {
      createdAt: { gte: from, lte: to },
      ...(category ? { category } : {}),
      ...(eventType ? { eventType } : {}),
      ...(search
        ? {
            OR: [
              { category: { contains: search, mode: "insensitive" } },
              { action: { contains: search, mode: "insensitive" } },
              { label: { contains: search, mode: "insensitive" } },
              { page: { contains: search, mode: "insensitive" } },
              { eventType: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [totalCount, events] = await Promise.all([
      prisma.analyticsEvent.count({ where }),
      prisma.analyticsEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    const rows = events.map((entry) => ({
      id: entry.id,
      eventType: entry.eventType,
      category: entry.category || "-",
      action: entry.action || "-",
      label: entry.label || "-",
      value: entry.value ?? "-",
      page: entry.page || "-",
      title: entry.title || "-",
      userId: entry.userId ? `USR-${String(entry.userId).padStart(4, "0")}` : "Guest",
      source: entry.source || "frontend",
      ipAddress: entry.ipAddress || "-",
      timestamp: formatTimestamp(entry.createdAt),
    }));

    return res.json({
      message: "Analytics events fetched successfully",
      page,
      pageSize,
      totalCount,
      events: rows,
    });
  } catch (error) {
    console.error("Get Analytics Events Error:", error);
    return res.status(500).json({ message: "Unable to fetch analytics events" });
  }
};
