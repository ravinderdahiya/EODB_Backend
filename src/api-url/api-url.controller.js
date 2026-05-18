import { PrismaClient } from "@prisma/client";
import fetch from "node-fetch";
import {
  FRONTEND_LITERAL_KEYS,
  ensureRuntimeConfigEntries,
} from "./runtime-config.service.js";

const prisma = new PrismaClient();

function normalizeBasePath(value) {
  const raw = `${value || ""}`.trim();
  if (!raw) return "";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

function withBasePath(basePath, path) {
  if (!basePath) return path;
  return `${basePath}${path}`;
}

function extractBasePathFromAbsoluteUrl(value) {
  const raw = `${value || ""}`.trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return normalizeBasePath(parsed.pathname);
  } catch {
    return normalizeBasePath(raw);
  }
}

function inferBackendBasePathFromRequest(req) {
  const endpointSuffix = "/api-url/frontend-config";
  const originalPath = `${req.originalUrl || ""}`.split("?")[0];

  if (originalPath.endsWith(endpointSuffix)) {
    const prefix = originalPath.slice(0, -endpointSuffix.length);
    return normalizeBasePath(prefix);
  }

  return "";
}

function resolveFrontendBackendBasePath(req) {
  const fromEnv = normalizeBasePath(process.env.FRONTEND_BACKEND_BASE_PATH);
  if (fromEnv) return fromEnv;

  const fromProxy = normalizeBasePath(
    req.get("x-forwarded-prefix") || req.get("x-original-prefix"),
  );
  if (fromProxy) return fromProxy;

  const fromApiBase = extractBasePathFromAbsoluteUrl(process.env.VITE_SERVER_BASE_URL);
  if (fromApiBase) return fromApiBase;

  return inferBackendBasePathFromRequest(req);
}

// ✅ Create new API URL
export const createApiUrl = async (req, res) => {
  try {
    const { name, url, description, category } = req.body;

    if (!name || !url) {
      return res.status(400).json({ 
        error: "Name and URL are required" 
      });
    }

    const apiUrl = await prisma.apiUrl.create({
      data: {
        name,
        url,
        description: description || null,
        category: category || null,
        isActive: true,
      },
    });

    res.status(201).json({
      message: "API URL created successfully",
      data: apiUrl,
    });
  } catch (error) {
    console.error("❌ Error creating API URL:", error.message);
    res.status(500).json({ error: "Failed to create API URL" });
  }
};

// ✅ Get all API URLs
export const getAllApiUrls = async (req, res) => {
  try {
    const { category, active } = req.query;

    const where = {};
    
    if (category) {
      where.category = category;
    }
    
    if (active !== undefined) {
      where.isActive = active === "true";
    }

    const apiUrls = await prisma.apiUrl.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({
      message: "API URLs fetched successfully",
      count: apiUrls.length,
      data: apiUrls,
    });
  } catch (error) {
    console.error("❌ Error fetching API URLs:", error.message);
    res.status(500).json({ error: "Failed to fetch API URLs" });
  }
};

// ✅ Get single API URL by ID
export const getApiUrlById = async (req, res) => {
  try {
    const { id } = req.params;

    const apiUrl = await prisma.apiUrl.findUnique({
      where: { id: parseInt(id) },
    });

    if (!apiUrl) {
      return res.status(404).json({ error: "API URL not found" });
    }

    res.json({
      message: "API URL fetched successfully",
      data: apiUrl,
    });
  } catch (error) {
    console.error("❌ Error fetching API URL:", error.message);
    res.status(500).json({ error: "Failed to fetch API URL" });
  }
};

// ✅ Update API URL
export const updateApiUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, url, description, category, isActive } = req.body;

    const existing = await prisma.apiUrl.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: "API URL not found" });
    }

    const apiUrl = await prisma.apiUrl.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name }),
        ...(url && { url }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json({
      message: "API URL updated successfully",
      data: apiUrl,
    });
  } catch (error) {
    console.error("❌ Error updating API URL:", error.message);
    res.status(500).json({ error: "Failed to update API URL" });
  }
};

// ✅ Delete API URL
export const deleteApiUrl = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.apiUrl.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: "API URL not found" });
    }

    await prisma.apiUrl.delete({
      where: { id: parseInt(id) },
    });

    res.json({
      message: "API URL deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting API URL:", error.message);
    res.status(500).json({ error: "Failed to delete API URL" });
  }
};

// ✅ Toggle API URL active status
export const toggleApiUrlStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.apiUrl.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existing) {
      return res.status(404).json({ error: "API URL not found" });
    }

    const apiUrl = await prisma.apiUrl.update({
      where: { id: parseInt(id) },
      data: {
        isActive: !existing.isActive,
      },
    });

    res.json({
      message: `API URL ${apiUrl.isActive ? "activated" : "deactivated"} successfully`,
      data: apiUrl,
    });
  } catch (error) {
    console.error("❌ Error toggling API URL status:", error.message);
    res.status(500).json({ error: "Failed to toggle API URL status" });
  }
};

// ✅ Get all unique categories
export const getCategories = async (req, res) => {
  try {
    const categories = await prisma.apiUrl.findMany({
      select: { category: true },
      distinct: ["category"],
      where: {
        category: { not: null },
      },
    });

    res.json({
      message: "Categories fetched successfully",
      data: categories.map((c) => c.category).filter(Boolean),
    });
  } catch (error) {
    console.error("❌ Error fetching categories:", error.message);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

export const getFrontendRuntimeConfig = async (req, res) => {
  try {
    await ensureRuntimeConfigEntries(prisma);

    const entries = await prisma.apiUrl.findMany({
      where: {
        name: { in: FRONTEND_LITERAL_KEYS },
        isActive: true,
      },
      select: {
        name: true,
        url: true,
      },
    });

    const backendBasePath = resolveFrontendBackendBasePath(req);
    const config = {
      // Frontend now consumes backend-only proxy URLs.
      VITE_HSAC_MAIN_URL: withBasePath(backendBasePath, "/mapserver/service/hsacMain"),
      VITE_HSACGGM_ASSETS_URL: withBasePath(backendBasePath, "/mapserver/service/governmentAssets"),
      VITE_NHAI_ROADS_URL: withBasePath(backendBasePath, "/mapserver/service/nhaiRoads"),
      VITE_HARYANA_ROADS_URL: withBasePath(backendBasePath, "/mapserver/service/haryanaRoads"),
      VITE_HARYANA_BOUNDARY_URL: withBasePath(backendBasePath, "/mapserver/service/haryanaBoundary"),
      VITE_ARCGIS_GEOCODER_URL: withBasePath(backendBasePath, "/mapserver/service/geocoder"),
      VITE_ARCGIS_IMAGERY_URL: withBasePath(backendBasePath, "/mapserver/service/imagery"),
      VITE_ARCGIS_REFERENCE_URL: withBasePath(backendBasePath, "/mapserver/service/reference"),
      VITE_ARCGIS_TOPO_URL: withBasePath(backendBasePath, "/mapserver/service/topo"),
      VITE_ARCGIS_STREETS_URL: withBasePath(backendBasePath, "/mapserver/service/streets"),
      VITE_ASMX_BASE_PATH: withBasePath(backendBasePath, "/mapserver/land-record"),
      VITE_OWNER_API_ENDPOINT: withBasePath(backendBasePath, "/api-url/owner-search"),
      VITE_ARCGIS_API_KEY: process.env.VITE_ARCGIS_API_KEY || "",
      VITE_GA_MEASUREMENT_ID: process.env.VITE_GA_MEASUREMENT_ID || "",
    };

    for (const item of entries) {
      config[item.name] = item.url;
    }

    res.json({
      message: "Frontend runtime config fetched successfully",
      data: config,
    });
  } catch (error) {
    console.error("Error fetching frontend runtime config:", error.message);
    res.status(500).json({ error: "Failed to fetch frontend runtime config" });
  }
};

export const proxyOwnerSearch = async (req, res) => {
  try {
    const rawQuery = `${req.query?.query || ""}`.trim();
    if (!rawQuery) {
      return res.status(400).json({ error: "query is required" });
    }

    await ensureRuntimeConfigEntries(prisma);
    const upstreamEntry = await prisma.apiUrl.findFirst({
      where: {
        name: "VITE_OWNER_SEARCH_UPSTREAM_URL",
        isActive: true,
      },
      select: { url: true },
    });

    const upstreamUrl = `${upstreamEntry?.url || ""}`.trim();
    if (!upstreamUrl) {
      return res.status(500).json({ error: "Owner search upstream URL is not configured" });
    }

    const attempts = [
      {
        url: upstreamUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
        },
        body: JSON.stringify({ speech: rawQuery }),
      },
      {
        url: upstreamUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json, text/plain, */*",
        },
        body: `speech=${encodeURIComponent(rawQuery)}`,
      },
      {
        url: `${upstreamUrl}?query=${encodeURIComponent(rawQuery)}`,
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
        },
      },
    ];

    let lastStatus = 502;
    let lastMessage = "Owner search upstream request failed";
    for (const attempt of attempts) {
      try {
        const upstreamResponse = await fetch(attempt.url, {
          method: attempt.method,
          headers: attempt.headers,
          body: attempt.body,
        });

        const payload = Buffer.from(await upstreamResponse.arrayBuffer());
        const contentType = upstreamResponse.headers.get("content-type") || "application/json";
        if (!upstreamResponse.ok) {
          lastStatus = upstreamResponse.status;
          lastMessage = `Upstream responded with status ${upstreamResponse.status}`;
          continue;
        }

        res.setHeader("content-type", contentType);
        return res.status(upstreamResponse.status).send(payload);
      } catch (error) {
        lastMessage = error?.message || "Owner search upstream request failed";
      }
    }

    return res.status(lastStatus).json({ error: lastMessage });
  } catch (error) {
    console.error("Error proxying owner search:", error.message);
    return res.status(500).json({ error: "Failed to proxy owner search request" });
  }
};
