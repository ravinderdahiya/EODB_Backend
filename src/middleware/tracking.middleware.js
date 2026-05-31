import geoip from "geoip-lite";
import prisma from "../config/db.js";
import analyticsService from "../services/analyticsService.js";
import { getRequestDeviceIdentity } from "../utils/device-identity.utils.js";

const shouldSkipPersistentTracking = (req) => {
  const path = String(req.path || req.originalUrl || "");
  if (!path) return false;

  // High-frequency map tile traffic can overwhelm DB logging and app pool resources.
  if (path.startsWith("/mapserver/service/")) return true;
  if (path === "/mapserver/metadata") return true;
  return false;
};

// ✅ Middleware to extract IP address and geolocation
export const trackingMiddleware = async (req, res, next) => {
  try {
    // ✅ Extract IP address from various headers
    let ip =
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.headers["x-real-ip"] ||
      req.socket.remoteAddress ||
      req.connection.remoteAddress;

    // Convert IPv6 localhost to IPv4
    if (ip === "::1") {
      ip = "127.0.0.1";
    }

    console.log("🌍 Client IP:", ip);

    // ✅ Get geolocation from IP
    const geo = geoip.lookup(ip);

    console.log("📍 Geolocation Data:", geo);

    // ✅ Attach to request object for use in controllers
    req.clientIp = ip;
    req.geoLocation = {
      ip,
      latitude: geo?.ll?.[0] || null,
      longitude: geo?.ll?.[1] || null,
      country: geo?.country || null,
      city: geo?.city || null,
      timezone: geo?.timezone || null,
    };

    console.log("📊 Request Tracking:", req.geoLocation);

    // ✅ Save location to database asynchronously (non-blocking)
    // Skip very high-volume endpoints to avoid DB pressure in production.
    if (!shouldSkipPersistentTracking(req)) {
      saveLocationLog(req).catch((err) => {
        console.error("❌ Failed to save location log:", err.message);
      });
    }

    // ✅ Track API usage in Google Analytics after response completes
    // so statusCode is accurate (avoids status_null events).
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
    console.error("❌ Tracking Error:", error.message);
    // Continue even if tracking fails
    req.clientIp = null;
    req.geoLocation = null;
    next();
  }
};

// ✅ Function to save location log to database
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
        responseStatus: null, // Will be updated by response middleware
        userId: userId,
        mobile: mobile ? String(mobile).replace(/\D/g, "") : null,
        type: "request", // Default type for general requests
      },
    });

    console.log("✅ Location log saved to database");
  } catch (error) {
    console.error("❌ Error saving location log:", error.message);
  }
};

// ✅ Helper function to extract geolocation
export const getGeolocation = (ip) => {
  try {
    const geo = geoip.lookup(ip);
    return {
      ip,
      latitude: geo?.ll?.[0] || null,
      longitude: geo?.ll?.[1] || null,
      country: geo?.country || null,
      city: geo?.city || null,
      timezone: geo?.timezone || null,
    };
  } catch (error) {
    console.error("❌ Geolocation Error:", error.message);
    return null;
  }
};
