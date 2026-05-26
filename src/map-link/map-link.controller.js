import fetch from "node-fetch";

const GOOGLE_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "google.com",
  "www.google.com",
  "maps.google.com",
]);

const isValidLatLng = (lat, lng) => (
  Number.isFinite(lat)
  && Number.isFinite(lng)
  && lat >= -90
  && lat <= 90
  && lng >= -180
  && lng <= 180
);

const normalizeUrl = (value) => {
  const raw = `${value || ""}`.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
};

const extractCoordinatesFromText = (text) => {
  const source = `${text || ""}`;
  const decoded = (() => {
    try {
      return decodeURIComponent(source);
    } catch {
      return source;
    }
  })();

  const candidates = [decoded, source];

  for (const item of candidates) {
    const atMatch = item.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (atMatch) {
      const lat = Number.parseFloat(atMatch[1]);
      const lng = Number.parseFloat(atMatch[2]);
      if (isValidLatLng(lat, lng)) return { lat, lng, source: "@pattern" };
    }

    const qMatch = item.match(/[?&](?:q|query|ll|sll|destination|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
    if (qMatch) {
      const lat = Number.parseFloat(qMatch[1]);
      const lng = Number.parseFloat(qMatch[2]);
      if (isValidLatLng(lat, lng)) return { lat, lng, source: "query-param" };
    }

    const encodedMatch = item.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (encodedMatch) {
      const lat = Number.parseFloat(encodedMatch[1]);
      const lng = Number.parseFloat(encodedMatch[2]);
      if (isValidLatLng(lat, lng)) return { lat, lng, source: "3d4d-pattern" };
    }
  }

  return null;
};

const ensureGoogleHost = (value) => {
  const parsed = new URL(value);
  const host = `${parsed.hostname || ""}`.toLowerCase();
  if (!GOOGLE_HOSTS.has(host)) {
    throw new Error("Only Google Maps links are supported");
  }
  return parsed;
};

export const resolveMapLink = async (req, res) => {
  try {
    const normalizedInput = normalizeUrl(req.query?.url || req.body?.url);
    if (!normalizedInput) {
      return res.status(400).json({ message: "Map URL is required" });
    }

    let parsedInput;
    try {
      parsedInput = ensureGoogleHost(normalizedInput);
    } catch (error) {
      return res.status(400).json({ message: error.message || "Invalid map URL" });
    }

    // Fast path: direct extraction from the provided URL string.
    const direct = extractCoordinatesFromText(parsedInput.toString());
    if (direct) {
      return res.json({
        message: "Location resolved successfully",
        data: {
          latitude: direct.lat,
          longitude: direct.lng,
          resolvedUrl: parsedInput.toString(),
          method: direct.source,
        },
      });
    }

    // Fallback for shortened Google links (maps.app.goo.gl etc.).
    const response = await fetch(parsedInput.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "EODB-MapLink-Resolver/1.0",
      },
    });

    const resolvedUrl = response.url || parsedInput.toString();
    const resolvedCoords = extractCoordinatesFromText(resolvedUrl);

    if (!resolvedCoords) {
      return res.status(422).json({
        message: "Could not extract latitude/longitude from the provided map link",
        resolvedUrl,
      });
    }

    return res.json({
      message: "Location resolved successfully",
      data: {
        latitude: resolvedCoords.lat,
        longitude: resolvedCoords.lng,
        resolvedUrl,
        method: `redirect-${resolvedCoords.source}`,
      },
    });
  } catch (error) {
    console.error("Resolve Map Link Error:", error.message);
    return res.status(500).json({ message: "Unable to resolve map link" });
  }
};
