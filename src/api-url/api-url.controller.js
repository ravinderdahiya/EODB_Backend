import { PrismaClient } from "@prisma/client";
import fetch from "node-fetch";
import {
  FRONTEND_LITERAL_KEYS,
  UPSTREAM_CONFIG_KEYS,
  ensureRuntimeConfigEntries,
} from "./runtime-config.service.js";

const prisma = new PrismaClient();

function normalizeLookupText(value) {
  return `${value || ""}`
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

function escapeSqlValue(value) {
  return `${value || ""}`.replace(/'/g, "''");
}

function extractHindiField(sourceText, labels, allLabels) {
  const text = `${sourceText || ""}`.trim().replace(/\s+/g, " ");
  if (!text) return "";

  const labelPattern = labels
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const stopPattern = allLabels
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const regex = new RegExp(
    `(?:^|\\s)(?:${labelPattern})\\s+(.+?)(?=\\s+(?:${stopPattern})(?:\\s|$)|$)`,
    "i",
  );
  const match = regex.exec(text);
  return `${match?.[1] || ""}`.trim();
}

function parseHindiLandQuery(inputQuery) {
  const allLabels = [
    "नाम",
    "मालिक",
    "जिला",
    "तहसील",
    "गांव",
    "गाँव",
    "ग्राम",
    "मुरबा",
    "मुरब्बा",
    "खसरा",
  ];

  return {
    owner: extractHindiField(inputQuery, ["नाम", "मालिक"], allLabels),
    district: extractHindiField(inputQuery, ["जिला"], allLabels),
    tehsil: extractHindiField(inputQuery, ["तहसील"], allLabels),
    village: extractHindiField(inputQuery, ["गांव", "गाँव", "ग्राम"], allLabels),
    murabba: extractHindiField(inputQuery, ["मुरबा", "मुरब्बा"], allLabels),
    khasra: extractHindiField(inputQuery, ["खसरा"], allLabels),
  };
}

function getMissingHindiLandFields(hints) {
  const missing = [];
  if (!hints?.district) missing.push("जिला");
  if (!hints?.tehsil) missing.push("तहसील");
  if (!hints?.village) missing.push("गांव");
  if (!hints?.murabba) missing.push("मुरबा");
  if (!hints?.khasra) missing.push("खसरा");
  return missing;
}

async function getUpstreamConfigMap() {
  await ensureRuntimeConfigEntries(prisma);

  const entries = await prisma.apiUrl.findMany({
    where: {
      name: { in: UPSTREAM_CONFIG_KEYS },
      isActive: true,
    },
    select: { name: true, url: true },
  });

  const config = {};
  entries.forEach((entry) => {
    const key = `${entry?.name || ""}`.trim();
    const value = `${entry?.url || ""}`.trim();
    if (key && value) {
      config[key] = value;
    }
  });
  return config;
}

function resolveHsacMapBaseUrl(config) {
  const origin = `${config?.VITE_HSAC_ORIGIN || ""}`.trim().replace(/\/+$/, "");
  const servicePath = `${config?.VITE_HSAC_MAP_SERVICE_PATH || ""}`.trim();
  const normalizedPath = servicePath
    ? (servicePath.startsWith("/") ? servicePath : `/${servicePath}`)
    : "";
  if (!origin || !normalizedPath) return "";
  return `${origin}${normalizedPath}`.replace(/\/+$/, "");
}

async function queryMapLayerFeatures(baseUrl, layerId, where, outFields = "*", orderByFields = "", num = 2000) {
  const params = new URLSearchParams({
    f: "json",
    where,
    outFields,
    returnGeometry: "false",
    returnDistinctValues: "false",
    num: String(num),
  });
  if (orderByFields) {
    params.set("orderByFields", orderByFields);
  }

  const url = `${baseUrl}/${layerId}/query?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "EODB-Backend-Query/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`MapServer query failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(payload.error?.message || "MapServer returned query error");
  }

  return Array.isArray(payload?.features) ? payload.features : [];
}

function pickBestNameMatch(features, nameField, targetName) {
  const targetNorm = normalizeLookupText(targetName);
  if (!targetNorm || !features.length) return null;

  const mapped = features
    .map((feature) => ({
      feature,
      name: `${feature?.attributes?.[nameField] || ""}`.trim(),
    }))
    .filter((entry) => entry.name);

  const exact = mapped.find((entry) => normalizeLookupText(entry.name) === targetNorm);
  if (exact) return exact.feature;

  const starts = mapped.find((entry) => normalizeLookupText(entry.name).startsWith(targetNorm));
  if (starts) return starts.feature;

  const includes = mapped.find((entry) => normalizeLookupText(entry.name).includes(targetNorm));
  if (includes) return includes.feature;

  return null;
}

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
      VITE_CADASTRAL_HINDI_SEARCH_ENDPOINT: withBasePath(backendBasePath, "/api-url/cadastral-hindi-search"),
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

export const resolveHindiCadastralSearch = async (req, res) => {
  try {
    const rawQuery = `${req.query?.query || req.body?.query || ""}`.trim();
    if (!rawQuery) {
      return res.status(400).json({ error: "query is required" });
    }

    const hints = parseHindiLandQuery(rawQuery);
    const missingFields = getMissingHindiLandFields(hints);
    if (missingFields.length) {
      return res.status(400).json({
        error: "Missing required Hindi land fields",
        missingFields,
        parsed: hints,
      });
    }

    const config = await getUpstreamConfigMap();
    const hsacBase = resolveHsacMapBaseUrl(config);
    if (!hsacBase) {
      return res.status(500).json({ error: "HSAC map service is not configured" });
    }

    const districtFeatures = await queryMapLayerFeatures(
      hsacBase,
      26,
      "n_d_code IS NOT NULL AND n_d_code <> '' AND n_d_name IS NOT NULL AND n_d_name <> ''",
      "n_d_code,n_d_name",
      "n_d_name",
      100,
    );
    const districtFeature = pickBestNameMatch(districtFeatures, "n_d_name", hints.district);
    if (!districtFeature) {
      return res.status(404).json({ error: "District not found", parsed: hints });
    }
    const districtCode = `${districtFeature.attributes?.n_d_code || ""}`.trim();
    const districtName = `${districtFeature.attributes?.n_d_name || hints.district}`.trim();

    const tehsilFeatures = await queryMapLayerFeatures(
      hsacBase,
      27,
      `n_d_code='${escapeSqlValue(districtCode)}' AND n_t_code IS NOT NULL AND n_t_code <> '' AND n_t_name IS NOT NULL AND n_t_name <> ''`,
      "n_d_code,n_d_name,n_t_code,n_t_name",
      "n_t_name",
      300,
    );
    const tehsilFeature = pickBestNameMatch(tehsilFeatures, "n_t_name", hints.tehsil);
    if (!tehsilFeature) {
      return res.status(404).json({ error: "Tehsil not found", parsed: hints, districtCode });
    }
    const tehsilCode = `${tehsilFeature.attributes?.n_t_code || ""}`.trim();
    const tehsilName = `${tehsilFeature.attributes?.n_t_name || hints.tehsil}`.trim();

    const villageFeatures = await queryMapLayerFeatures(
      hsacBase,
      28,
      `n_d_code='${escapeSqlValue(districtCode)}' AND n_t_code='${escapeSqlValue(tehsilCode)}' AND n_v_code IS NOT NULL AND n_v_code <> '' AND n_v_name IS NOT NULL AND n_v_name <> ''`,
      "n_d_code,n_d_name,n_t_code,n_t_name,n_v_code,n_v_name",
      "n_v_name",
      4000,
    );
    const villageFeature = pickBestNameMatch(villageFeatures, "n_v_name", hints.village);
    if (!villageFeature) {
      return res.status(404).json({ error: "Village not found", parsed: hints, districtCode, tehsilCode });
    }
    const villageCode = `${villageFeature.attributes?.n_v_code || ""}`.trim();
    const villageName = `${villageFeature.attributes?.n_v_name || hints.village}`.trim();

    const cadastralLayerId = Number.parseInt(String(districtCode).replace(/^0+/, "") || districtCode, 10);
    if (!Number.isFinite(cadastralLayerId)) {
      return res.status(500).json({ error: "Could not resolve cadastral sublayer for district", districtCode });
    }

    const cadastralWhere =
      `n_d_code='${escapeSqlValue(districtCode)}'` +
      ` AND n_t_code='${escapeSqlValue(tehsilCode)}'` +
      ` AND n_v_code='${escapeSqlValue(villageCode)}'` +
      ` AND n_murr_no='${escapeSqlValue(hints.murabba)}'` +
      ` AND n_khas_no='${escapeSqlValue(hints.khasra)}'`;

    const cadastralFeatures = await queryMapLayerFeatures(
      hsacBase,
      cadastralLayerId,
      cadastralWhere,
      "n_d_code,n_t_code,n_v_code,n_d_name,n_t_name,n_v_name,n_murr_no,n_khas_no,n_kanal,n_marla",
      "",
      5,
    );

    if (!cadastralFeatures.length) {
      return res.status(404).json({
        error: "Cadastral parcel not found",
        parsed: hints,
        codes: {
          district: districtCode,
          tehsil: tehsilCode,
          village: villageCode,
        },
      });
    }

    const attrs = cadastralFeatures[0]?.attributes || {};
    const responsePayload = {
      ok: true,
      source: "hsac_cadastral_hindi_query",
      query: rawQuery,
      parsed: hints,
      codes: {
        district: `${attrs.n_d_code || districtCode}`.trim(),
        tehsil: `${attrs.n_t_code || tehsilCode}`.trim(),
        village: `${attrs.n_v_code || villageCode}`.trim(),
        murabba: `${attrs.n_murr_no || hints.murabba}`.trim(),
        khasra: `${attrs.n_khas_no || hints.khasra}`.trim(),
      },
      names: {
        district: `${attrs.n_d_name || districtName}`.trim(),
        tehsil: `${attrs.n_t_name || tehsilName}`.trim(),
        village: `${attrs.n_v_name || villageName}`.trim(),
        murabba: `${attrs.n_murr_no || hints.murabba}`.trim(),
        khasra: `${attrs.n_khas_no || hints.khasra}`.trim(),
        owner: `${hints.owner || ""}`.trim(),
      },
      land_records: {
        nd_code: `${attrs.n_d_code || districtCode}`.trim(),
        nt_code: `${attrs.n_t_code || tehsilCode}`.trim(),
        nv_code: `${attrs.n_v_code || villageCode}`.trim(),
        district: `${attrs.n_d_name || districtName}`.trim(),
        tehsil: `${attrs.n_t_name || tehsilName}`.trim(),
        village: `${attrs.n_v_name || villageName}`.trim(),
        murraba_no: `${attrs.n_murr_no || hints.murabba}`.trim(),
        khasra_no: `${attrs.n_khas_no || hints.khasra}`.trim(),
        owner_name: `${hints.owner || ""}`.trim(),
      },
    };

    return res.json(responsePayload);
  } catch (error) {
    console.error("Error resolving Hindi cadastral search:", error.message);
    return res.status(500).json({ error: "Failed to resolve Hindi cadastral search query" });
  }
};
