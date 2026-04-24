import geoip from "geoip-lite";

// ✅ Middleware to extract IP address and geolocation
export const trackingMiddleware = (req, res, next) => {
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

    next();
  } catch (error) {
    console.error("❌ Tracking Error:", error.message);
    // Continue even if tracking fails
    req.clientIp = null;
    req.geoLocation = null;
    next();
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
