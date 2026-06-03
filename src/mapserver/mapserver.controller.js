import fetch from 'node-fetch';
import prisma from '../config/db.js';
import { getCache, setCache } from '../utils/cache.js';
import { logSecurityEvent } from '../services/auditLogService.js';
import {
  UPSTREAM_CONFIG_KEYS,
  ensureRuntimeConfigEntries,
} from '../api-url/runtime-config.service.js';

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

  const shouldProxy =
    serviceKey === 'hsacMain' || `${targetUrl || ''}`.startsWith(`${hsacOrigin}/`);

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

  const config = {};
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
  { action, resource, method, body, contentType },
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

  const response = await fetch(targetUrl, {
    method: effectiveMethod,
    headers,
    body: requestBody,
  });

  const responseContentType = response.headers.get('content-type');
  if (responseContentType) {
    res.setHeader('content-type', responseContentType);
  }

  const cacheControl = response.headers.get('cache-control');
  if (cacheControl) {
    res.setHeader('cache-control', cacheControl);
  }

  const payload = Buffer.from(await response.arrayBuffer());
  res.status(response.status).send(payload);
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
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'EODB-Backend-Proxy/1.0',
      },
    });

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
