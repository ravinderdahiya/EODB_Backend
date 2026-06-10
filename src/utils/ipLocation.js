import fetch from "node-fetch";

// External IP geolocation (ip-api.com) is slow and rate-limited. To keep it from
// ever blocking/hanging an API request we:
//   1. Cache each IP -> location result in memory for 24h.
//   2. De-duplicate concurrent lookups for the same IP (single in-flight promise).
//   3. Abort the upstream call after a short timeout so a slow/down provider
//      never stalls the caller.
//   4. Allow disabling external lookups entirely via DISABLE_EXTERNAL_GEOIP=true.
const ipLocationCache = new Map(); // ip -> { value, expiry }
const inFlightLookups = new Map(); // ip -> Promise

const IP_CACHE_TTL_MS = Number(process.env.IP_LOCATION_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const IP_LOOKUP_TIMEOUT_MS = Number(process.env.IP_LOOKUP_TIMEOUT_MS || 2000);
const EXTERNAL_LOOKUP_DISABLED =
  String(process.env.DISABLE_EXTERNAL_GEOIP || "").toLowerCase() === "true";

// Synchronous, non-blocking read of an already-cached IP location (or null).
export const getCachedIPLocation = (ip) => {
  if (!ip) return null;
  const entry = ipLocationCache.get(ip);
  if (!entry) return null;
  if (entry.expiry && Date.now() > entry.expiry) {
    ipLocationCache.delete(ip);
    return null;
  }
  return entry.value;
};

export const getIPLocation = async (ip) => {
  if (!ip) return null;

  const cached = getCachedIPLocation(ip);
  if (cached) return cached;

  if (EXTERNAL_LOOKUP_DISABLED) return null;

  if (inFlightLookups.has(ip)) {
    return inFlightLookups.get(ip);
  }

  const lookupPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);
    try {
      const res = await fetch(`https://ip-api.com/json/${ip}`, {
        signal: controller.signal,
      });
      const data = await res.json();

      const value = {
        latitude: data.lat ?? null,
        longitude: data.lon ?? null,
        city: data.city || data.regionName || null,
        country: data.country || null,
      };

      ipLocationCache.set(ip, { value, expiry: Date.now() + IP_CACHE_TTL_MS });
      return value;
    } catch (error) {
      // Timeout/abort/network errors are non-fatal: caller falls back to local geoip.
      return null;
    } finally {
      clearTimeout(timer);
      inFlightLookups.delete(ip);
    }
  })();

  inFlightLookups.set(ip, lookupPromise);
  return lookupPromise;
};
