import geoip from "geoip-lite";
import prisma from "../config/db.js";
import analyticsService from "../services/analyticsService.js";
import { getRequestDeviceIdentity } from "../utils/device-identity.utils.js";
import { getIPLocation } from "../utils/ipLocation.js";

const shouldSkipPersistentTracking = (req) => {
  const path = String(req.path || req.originalUrl || "");
  if (!path) return false;

  if (path.startsWith("/mapserver/service/")) return true;
  if (path === "/mapserver/metadata") return true;
  return false;
};

const normalizeIp = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let ip = raw;
  if (ip.includes(",")) ip = ip.split(",")[0].trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  return ip || null;
};

const resolveClientIp = (req) => {
  const candidates = [
    req.headers["cf-connecting-ip"],
    req.headers["x-forwarded-for"],
    req.headers["x-real-ip"],
    req.headers["x-client-ip"],
    req.ip,
    req.socket?.remoteAddress,
    req.connection?.remoteAddress,
  ];

  for (const candidate of candidates) {
    const ip = normalizeIp(candidate);
    if (ip) return ip;
  }

  return "127.0.0.1";
};

export const trackingMiddleware = async (req, res, next) => {
  try {
    const ip = resolveClientIp(req);

    const geo = geoip.lookup(ip);
    let latitude = geo?.ll?.[0] || null;
    let longitude = geo?.ll?.[1] || null;
    let country = geo?.country || null;
    let city = geo?.city || null;

    if ((!city || latitude == null || longitude == null) && ip !== "127.0.0.1") {
      const fallback = await getIPLocation(ip);
      latitude = latitude ?? fallback?.latitude ?? null;
      longitude = longitude ?? fallback?.longitude ?? null;
      country = country || fallback?.country || null;
      city = city || fallback?.city || null;
    }

    req.clientIp = ip;
    req.geoLocation = {
      ip,
      latitude,
      longitude,
      country,
      city,
      timezone: geo?.timezone || null,
    };

    if (!shouldSkipPersistentTracking(req)) {
      saveLocationLog(req).catch((err) => {
        console.error("Location log save failed:", err.message);
      });
    }

    res.on("finish", () => {
      analyticsService.trackApiUsage(
        req.path,
        req.method,
        res.statusCode,
        req.user?.id,
      );
    });

    next();
  } catch (error) {
    console.error("Tracking error:", error.message);
    req.clientIp = null;
    req.geoLocation = null;
    next();
  }
};

export const saveLocationLog = async (req) => {
  try {
    const geoLocation = req.geoLocation;
    const deviceIdentity = getRequestDeviceIdentity(req);
    const userId = req.user?.id || null;
    const mobile =
      req.user?.mobile ||
      req.body?.mobile ||
      req.body?.phone ||
      req.query?.mobile ||
      req.query?.phone ||
      null;

    await prisma.loginSessionLog.create({
      data: {
        ipAddress: geoLocation?.ip || req.clientIp || "unknown",
        latitude: geoLocation?.latitude || null,
        longitude: geoLocation?.longitude || null,
        country: geoLocation?.country || null,
        city: geoLocation?.city || null,
        timezone: geoLocation?.timezone || null,
        userAgent: req.headers["user-agent"] || null,
        deviceId: deviceIdentity.deviceId,
        deviceImei: deviceIdentity.deviceImei,
        deviceInfo: deviceIdentity.deviceInfo,
        method: req.method || null,
        url: req.originalUrl || req.url || null,
        responseStatus: null,
        userId,
        mobile: mobile ? String(mobile).replace(/\D/g, "") : null,
        type: "request",
      },
    });
  } catch (error) {
    console.error("Error saving location log:", error.message);
  }
};

export const getGeolocation = async (ip) => {
  try {
    const normalizedIp = normalizeIp(ip);
    if (!normalizedIp) return null;

    const geo = geoip.lookup(normalizedIp);
    let latitude = geo?.ll?.[0] || null;
    let longitude = geo?.ll?.[1] || null;
    let country = geo?.country || null;
    let city = geo?.city || null;

    if ((!city || latitude == null || longitude == null) && normalizedIp !== "127.0.0.1") {
      const fallback = await getIPLocation(normalizedIp);
      latitude = latitude ?? fallback?.latitude ?? null;
      longitude = longitude ?? fallback?.longitude ?? null;
      country = country || fallback?.country || null;
      city = city || fallback?.city || null;
    }

    return {
      ip: normalizedIp,
      latitude,
      longitude,
      country,
      city,
      timezone: geo?.timezone || null,
    };
  } catch (error) {
    console.error("Geolocation error:", error.message);
    return null;
  }
};