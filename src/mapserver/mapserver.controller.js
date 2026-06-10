import http from 'node:http';
import https from 'node:https';
import fetch from 'node-fetch';
import prisma from '../config/db.js';
import { getCache, setCache } from '../utils/cache.js';
import { logSecurityEvent } from '../services/auditLogService.js';
import {
  UPSTREAM_CONFIG_KEYS,
  ensureRuntimeConfigEntries,
  getUpstreamConfigDefaults,
} from '../api-url/runtime-config.service.js';

// Reuse TCP/TLS connections to upstream map servers. Without keep-alive, every tile /
// export / query / identify request opens a brand-new TCP + TLS handshake to the
// upstream (hsac.org.in etc.), which is the single biggest latency source when the
// map fires many requests. These pooled agents eliminate that per-request handshake.
const keepAliveHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64 });

// Map tiles/exports/legends for a given bbox+size are deterministic and rarely change,
// so let the browser cache them. This stops identical tiles from re-hitting the upstream
// GIS server on every pan/zoom and on each fresh login. Kept `private` (per-browser only,
// never a shared/CDN cache) because these responses ride on the authenticated proxy.
// Override via env if boundary/cadastral data is updated more frequently.
const MAP_TILE_CACHE_CONTROL =
  process.env.MAP_TILE_CACHE_CONTROL || 'private, max-age=3600';

// Hard ceiling for any single upstream map/GIS request. Without this a slow or
// unresponsive upstream (hsac.org.in, proxy.ashx, etc.) would keep the proxy request
// open indefinitely and tie up a worker socket.
const UPSTREAM_TIMEOUT_MS = Number(process.env.MAP_UPSTREAM_TIMEOUT_MS || 20000);

const selectKeepAliveAgent = (targetUrl) =>
  (/^https:/i.test(`${targetUrl || ''}`) ? keepAliveHttpsAgent : keepAliveHttpAgent);

function normalizeOrigin(origin) {
  return `${origin || ''}`.trim().replace(/\/+$/, '');
}

function normalizePath(path) {
  const raw = `${path || ''}`.trim();
  if (!raw) return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function joinOriginAndPath(origin, path) {
  const normalizedOrigin = normalizeOrigin(origin);
  const normalizedPath = normalizePath(path);
  return `${normalizedOrigin}${normalizedPath}`;
}

function toQueryString(queryObject = {}) {
  const params = new URLSearchParams();
  Object.entries(queryObject).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null) {
          params.append(key, String(item));
        }
      });
      return;
    }
    params.append(key, String(value));
  });
  return params.toString();
}

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(`${value || ''}`.trim());
}

function normalizeProxyUrl(value) {
  return `${value || ''}`.trim().replace(/\?+$/, '');
}

function wrapWithDotNetProxyIfNeeded(targetUrl, config, { serviceKey } = {}) {
  const proxyUrl = normalizeProxyUrl(config.VITE_HSAC_DOTNET_PROXY_URL);
  const hsacOrigin = normalizeOrigin(config.VITE_HSAC_ORIGIN);

  if (!isAbsoluteHttpUrl(proxyUrl) || !isAbsoluteHttpUrl(hsacOrigin)) {
    return targetUrl;
  }

  // Only the secured main EODB MapServer needs the ASP.NET token-injecting proxy
  // (proxy.ashx). Other hsac.org.in services (e.g. Kanal_Marla) are public and resolve
  // directly with HTTP 200 — routing them through proxy.ashx hit its service whitelist
  // and returned 404. Restrict the wrap to hsacMain so those layers load directly.
  const shouldProxy = serviceKey === 'hsacMain';

  if (!shouldProxy) {
    return targetUrl;
  }

  return `${proxyUrl}?${encodeURIComponent(targetUrl)}`;
}

async function getUpstreamRuntimeConfig() {
  await ensureRuntimeConfigEntries(prisma);

  const version = (await getCache('apiUrls_version')) || '0';
  const cacheKey = `upstreamRuntimeConfig:${version}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const entries = await prisma.apiUrl.findMany({
    where: {
      name: { in: UPSTREAM_CONFIG_KEYS },
      isActive: true,
    },
    select: {
      name: true,
      url: true,
    },
  });

  // Seed defaults form the base so a missing/inactive DB row never leaves a service
  // key unresolved (which surfaced as 404s for kanalMarla / governmentAssets). Active
  // DB values still win — admins can override any upstream URL from the apiUrl table.
  const config = { ...getUpstreamConfigDefaults() };
  for (const item of entries) {
    if (typeof item.url === 'string' && item.url.trim()) {
      config[item.name] = item.url.trim();
    }
  }

  await setCache(cacheKey, config, 300);
  return config;
}

function resolveServiceBaseUrl(serviceKey, config) {
  switch (`${serviceKey || ''}`.trim()) {
    case 'hsacMain':
      return joinOriginAndPath(config.VITE_HSAC_ORIGIN, config.VITE_HSAC_MAP_SERVICE_PATH);
    case 'kanalMarla':
      return joinOriginAndPath(config.VITE_HSAC_ORIGIN, config.VITE_KANAL_MARLA_PATH);
    case 'governmentAssets':
      return config.VITE_HSACGGM_ASSETS_URL;
    case 'nhaiRoads':
      return config.VITE_NHAI_ROADS_URL;
    case 'haryanaRoads':
      return config.VITE_HARYANA_ROADS_URL;
    case 'haryanaBoundary':
      return config.VITE_HARYANA_BOUNDARY_URL;
    case 'geocoder':
      return config.VITE_ARCGIS_GEOCODER_URL;
    default:
      return null;
  }
}

function buildProxyBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (!req.body) return undefined;

  if (typeof req.body === 'string') {
    return req.body;
  }

  if (req.is('application/json')) {
    return JSON.stringify(req.body);
  }

  if (typeof req.body === 'object') {
    const form = new URLSearchParams();
    Object.entries(req.body).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) {
        value.forEach((item) => form.append(key, String(item)));
      } else {
        form.append(key, String(value));
      }
    });
    return form.toString();
  }

  return undefined;
}

async function forwardRequest(
  req,
  res,
  targetUrl,
  { action, resource, method, body, contentType, cacheControlOverride },
) {
  const userId = req.user?.sub || req.user?.id || 'unknown';

  await logSecurityEvent({
    userId,
    action,
    resource,
    ip: req.ip,
    params: req.query,
  });

  const headers = {
    'User-Agent': 'EODB-Backend-Proxy/1.0',
    Accept: req.get('accept') || '*/*',
  };

  const effectiveMethod = method || req.method;
  const requestBody = body !== undefined ? body : (method ? undefined : buildProxyBody(req));

  if (requestBody !== undefined) {
    headers['Content-Type'] =
      contentType || req.get('content-type') || 'application/x-www-form-urlencoded';
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(targetUrl, {
      method: effectiveMethod,
      headers,
      body: requestBody,
      agent: selectKeepAliveAgent(targetUrl),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutHandle);
    if (error?.name === 'AbortError') {
      if (!res.headersSent) {
        res.status(504).json({ error: 'Upstream map request timed out' });
      }
      return;
    }
    throw error;
  }
  // Connection + headers received; the stream itself is allowed to run to completion.
  clearTimeout(timeoutHandle);

  const responseContentType = response.headers.get('content-type');
  if (responseContentType) {
    res.setHeader('content-type', responseContentType);
  }

  const effectiveMethod2 = `${effectiveMethod || ''}`.toUpperCase();
  const cacheControl = response.headers.get('cache-control');
  if (cacheControlOverride && response.ok && (effectiveMethod2 === 'GET' || effectiveMethod2 === 'HEAD')) {
    // Cacheable map tile/service response: prefer our deterministic policy over the
    // upstream's (ArcGIS often returns no-cache/private which defeats browser caching).
    res.setHeader('cache-control', cacheControlOverride);
  } else if (cacheControl) {
    res.setHeader('cache-control', cacheControl);
  }

  res.status(response.status);

  // Stream the upstream response straight to the client instead of buffering the whole
  // body first. This improves time-to-first-byte for large tile/image responses.
  if (response.body && typeof response.body.pipe === 'function') {
    await new Promise((resolve, reject) => {
      response.body.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
      response.body.pipe(res);
    }).catch((streamError) => {
      if (!res.headersSent) {
        res.status(502);
      }
      if (!res.writableEnded) {
        res.end();
      }
      throw streamError;
    });
    return;
  }

  const payload = Buffer.from(await response.arrayBuffer());
  res.send(payload);
}

/**
 * Generic authenticated ArcGIS proxy
 * /mapserver/service/:serviceKey/<optional-path>?...
 */
export const proxyArcgisService = async (req, res) => {
  try {
    const { serviceKey } = req.params;
    const config = await getUpstreamRuntimeConfig();
    const baseUrl = resolveServiceBaseUrl(serviceKey, config);

    if (!baseUrl) {
      return res.status(404).json({ error: `Unknown map service key: ${serviceKey}` });
    }

    if (!isAbsoluteHttpUrl(baseUrl)) {
      return res.status(500).json({ error: `Service URL for ${serviceKey} is not configured` });
    }

    const pathSuffix = req.path === '/' ? '' : req.path;
    const queryString = toQueryString(req.query);
    const upstreamUrl = `${baseUrl.replace(/\/+$/, '')}${pathSuffix}${queryString ? `?${queryString}` : ''}`;
    const targetUrl = wrapWithDotNetProxyIfNeeded(upstreamUrl, config, { serviceKey });

    return await forwardRequest(req, res, targetUrl, {
      action: 'MAPSERVER_SERVICE_PROXY',
      resource: `${serviceKey}${pathSuffix || '/'}`,
      cacheControlOverride: MAP_TILE_CACHE_CONTROL,
    });
  } catch (error) {
    console.error('Map service proxy error:', error);

    const userId = req.user?.sub || req.user?.id || 'unknown';
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_SERVICE_PROXY_ERROR',
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({ error: 'Map service proxy request failed' });
  }
};

/**
 * Forward authenticated REST query to HSAC MapServer
 * POST /mapserver/query
 * Body: { endpoint, layerId, where, outFields, ... } (ArcGIS REST params)
 */
export const proxyMapServerQuery = async (req, res) => {
  try {
    const { endpoint = 'query', layerId = '', ...queryParams } = req.body;
    const config = await getUpstreamRuntimeConfig();
    const hsacMain = resolveServiceBaseUrl('hsacMain', config);

    if (!isAbsoluteHttpUrl(hsacMain)) {
      return res.status(500).json({ error: 'HSAC MapServer URL is not configured' });
    }

    const searchParams = new URLSearchParams({
      f: 'json',
      ...queryParams,
    });

    const upstreamUrl = `${hsacMain.replace(/\/+$/, '')}/${layerId}/${endpoint}?${searchParams.toString()}`;
    const targetUrl = wrapWithDotNetProxyIfNeeded(upstreamUrl, config, { serviceKey: 'hsacMain' });
    return await forwardRequest(req, res, targetUrl, {
      action: 'MAPSERVER_QUERY',
      resource: `${layerId}/${endpoint}`,
      method: 'GET',
    });
  } catch (error) {
    console.error('MapServer query proxy error:', error);

    const userId = req.user?.sub || req.user?.id || 'unknown';
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_QUERY_ERROR',
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({
      error: 'MapServer request failed',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Forward authenticated REST identify to HSAC MapServer
 * POST /mapserver/identify
 */
export const proxyMapServerIdentify = async (req, res) => {
  try {
    const { layerIds = [], ...identifyParams } = req.body;
    const config = await getUpstreamRuntimeConfig();
    const hsacMain = resolveServiceBaseUrl('hsacMain', config);

    if (!isAbsoluteHttpUrl(hsacMain)) {
      return res.status(500).json({ error: 'HSAC MapServer URL is not configured' });
    }

    const searchParams = new URLSearchParams({
      f: 'json',
      ...identifyParams,
      ...(layerIds.length ? { layerIds: layerIds.join(',') } : {}),
    });

    const upstreamUrl = `${hsacMain.replace(/\/+$/, '')}/identify?${searchParams.toString()}`;
    const targetUrl = wrapWithDotNetProxyIfNeeded(upstreamUrl, config, { serviceKey: 'hsacMain' });
    return await forwardRequest(req, res, targetUrl, {
      action: 'MAPSERVER_IDENTIFY',
      resource: 'identify',
      method: 'GET',
    });
  } catch (error) {
    console.error('MapServer identify proxy error:', error);

    const userId = req.user?.sub || req.user?.id || 'unknown';
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_IDENTIFY_ERROR',
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({ error: 'Identify request failed' });
  }
};

/**
 * Forward authenticated ASMX land-record API call
 * GET /mapserver/land-record/:method
 */
export const proxyLandRecordAPI = async (req, res) => {
  try {
    const { method } = req.params;

    const allowedMethods = [
      'GetKhewats',
      'GetJamabandiPeriod',
      'GetKhatonis',
      'Owner_name',
      'GetOwnerInfo',
    ];

    if (!allowedMethods.includes(method)) {
      return res.status(403).json({ error: 'Method not allowed' });
    }

    const config = await getUpstreamRuntimeConfig();
    const hsacOrigin = normalizeOrigin(config.VITE_HSAC_ORIGIN);
    const asmxPath = normalizePath(config.VITE_ASMX_BASE_PATH);

    if (!isAbsoluteHttpUrl(hsacOrigin) || !asmxPath) {
      return res.status(500).json({ error: 'ASMX service URL is not configured' });
    }

    const queryString = toQueryString(req.query);
    const targetUrl = `${hsacOrigin}${asmxPath}/${method}${queryString ? `?${queryString}` : ''}`;

    return await forwardRequest(req, res, targetUrl, {
      action: 'LAND_RECORD_API_CALL',
      resource: `${asmxPath}/${method}`,
    });
  } catch (error) {
    console.error('Land record API proxy error:', error);

    const userId = req.user?.sub || req.user?.id || 'unknown';
    await logSecurityEvent({
      userId,
      action: 'LAND_RECORD_ERROR',
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({ error: 'Land Record API request failed' });
  }
};

/**
 * Get MapServer metadata (layers, fields, etc.)
 * GET /mapserver/metadata
 */
export const getMapServerMetadata = async (req, res) => {
  try {
    const config = await getUpstreamRuntimeConfig();
    const hsacMain = resolveServiceBaseUrl('hsacMain', config);

    if (!isAbsoluteHttpUrl(hsacMain)) {
      return res.status(500).json({ error: 'HSAC MapServer URL is not configured' });
    }

    const version = (await getCache('apiUrls_version')) || '0';
    const cacheKey = `mapserverMetadata:${version}`;
    const cachedMeta = await getCache(cacheKey);
    if (cachedMeta) {
      return res.json({ message: 'MapServer metadata fetched successfully (cached)', ...cachedMeta });
    }

    const upstreamUrl = `${hsacMain.replace(/\/+$/, '')}?f=json`;
    const targetUrl = wrapWithDotNetProxyIfNeeded(upstreamUrl, config, { serviceKey: 'hsacMain' });
    const metadataController = new AbortController();
    const metadataTimeout = setTimeout(() => metadataController.abort(), UPSTREAM_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'EODB-Backend-Proxy/1.0',
        },
        agent: selectKeepAliveAgent(targetUrl),
        signal: metadataController.signal,
      });
    } finally {
      clearTimeout(metadataTimeout);
    }

    if (!response.ok) {
      throw new Error(`MapServer returned ${response.status}`);
    }

    const data = await response.json();
    const payload = {
      layers: data.layers || [],
      spatialReference: data.spatialReference || {},
      documentInfo: data.documentInfo || {},
    };

    await setCache(cacheKey, payload, 300);
    res.json(payload);
  } catch (error) {
    console.error('Metadata request error:', error);

    const userId = req.user?.sub || req.user?.id || 'unknown';
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_METADATA_ERROR',
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({ error: 'Could not retrieve metadata' });
  }
};
