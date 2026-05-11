import fetch from 'node-fetch';
import { logSecurityEvent } from '../services/auditLogService.js';

const HSAC_ORIGIN = process.env.HSAC_ORIGIN || 'https://hsac.org.in';
const HSAC_MAP_SERVICE_PATH = process.env.HSAC_MAP_SERVICE_PATH || '/server/rest/services/EODB/EODB_HR23/MapServer';
const HSAC_ASMX_BASE_PATH = process.env.HSAC_ASMX_BASE_PATH || '/LandOwnerAPI/getownername.asmx';

/**
 * Secure MapServer Proxy Controller
 * ────────────────────────────────────────────────────────────────────────────
 * All MapServer queries are routed through this authenticated proxy to:
 * 1. Verify JWT token before forwarding
 * 2. Prevent direct access to MapServer from clients
 * 3. Log all access attempts for security audit
 * 4. Control download/export capabilities
 */

/**
 * Forward authenticated REST query to HSAC MapServer
 * POST /mapserver/query
 * Body: { endpoint, layerId, where, outFields, ... } (ArcGIS REST params)
 */
export const proxyMapServerQuery = async (req, res) => {
  try {
    const { endpoint = 'query', layerId = '', ...queryParams } = req.body;
    const userId = req.user?.sub || req.user?.id || 'unknown';
    const requestPath = `${HSAC_ORIGIN}${HSAC_MAP_SERVICE_PATH}`;

    // Security: Prevent export/download operations
    if (endpoint === 'export') {
      await logSecurityEvent({
        userId,
        action: 'BLOCKED_MAPSERVER_EXPORT',
        resource: `${requestPath}/${layerId}`,
        ip: req.ip,
        reason: 'Export operations are disabled for security',
      });
      return res.status(403).json({ 
        error: 'Export operations are not permitted' 
      });
    }

    // Log the access
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_QUERY',
      resource: `${requestPath}/${layerId}/${endpoint}`,
      ip: req.ip,
      params: {
        layerId,
        endpoint,
        where: queryParams.where || '',
      },
    });

    // Build the full URL
    let targetUrl = `${requestPath}/${layerId}/${endpoint}`;
    
    // Add f=json for all requests
    const searchParams = new URLSearchParams({
      f: 'json',
      ...queryParams,
    });
    
    targetUrl += `?${searchParams.toString()}`;

    // Forward the request to HSAC MapServer
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'EODB-Backend-Proxy/1.0',
      },
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`MapServer returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MapServer proxy error:', error);
    
    const userId = req.user?.sub || req.user?.id || 'unknown';
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_ERROR',
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
 * Body: { geometry, layerIds, tolerance, ... }
 */
export const proxyMapServerIdentify = async (req, res) => {
  try {
    const { layerIds = [], ...identifyParams } = req.body;
    const userId = req.user?.sub || req.user?.id || 'unknown';
    const requestPath = `${HSAC_ORIGIN}${HSAC_MAP_SERVICE_PATH}`;

    // Log the access
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_IDENTIFY',
      resource: `${requestPath}/identify`,
      ip: req.ip,
      params: {
        layerIds: layerIds.join(','),
        tolerance: identifyParams.tolerance || '',
      },
    });

    const targetUrl = `${requestPath}/identify`;
    const searchParams = new URLSearchParams({
      f: 'json',
      ...identifyParams,
      ...(layerIds.length && { layerIds: layerIds.join(',') }),
    });

    const response = await fetch(`${targetUrl}?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'EODB-Backend-Proxy/1.0',
      },
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`MapServer returned ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('MapServer identify error:', error);
    
    const userId = req.user?.sub || req.user?.id || 'unknown';
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_IDENTIFY_ERROR',
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({ 
      error: 'Identify request failed' 
    });
  }
};

/**
 * Forward authenticated ASMX land-record API call
 * GET /mapserver/land-record/:method
 * Proxies: /LandOwnerAPI/getownername.asmx/:method
 */
export const proxyLandRecordAPI = async (req, res) => {
  try {
    const { method } = req.params;
    const userId = req.user?.sub || req.user?.id || 'unknown';
    
    // Whitelist allowed methods
    const allowedMethods = [
      'GetKhewats',
      'GetJamabandiPeriod',
      'GetKhatonis',
      'Owner_name',
      'GetOwnerInfo',
    ];

    if (!allowedMethods.includes(method)) {
      await logSecurityEvent({
        userId,
        action: 'BLOCKED_LAND_RECORD_METHOD',
        resource: method,
        ip: req.ip,
        reason: `Method '${method}' not in whitelist`,
      });
      return res.status(403).json({ 
        error: 'Method not allowed' 
      });
    }

    // Log the access
    await logSecurityEvent({
      userId,
      action: 'LAND_RECORD_API_CALL',
      resource: `${HSAC_ASMX_BASE_PATH}/${method}`,
      ip: req.ip,
      params: req.query,
    });

    const targetUrl = `${HSAC_ORIGIN}${HSAC_ASMX_BASE_PATH}/${method}`;
    const queryString = new URLSearchParams(req.query).toString();
    
    const response = await fetch(`${targetUrl}?${queryString}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'EODB-Backend-Proxy/1.0',
      },
      timeout: 30000,
    });

    if (!response.ok) {
      throw new Error(`Land Record API returned ${response.status}`);
    }

    // Return raw response (XML for ASMX)
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const data = await response.json();
      res.json(data);
    } else {
      const text = await response.text();
      res.type('text/xml').send(text);
    }
  } catch (error) {
    console.error('Land Record API error:', error);
    
    const userId = req.user?.sub || req.user?.id || 'unknown';
    await logSecurityEvent({
      userId,
      action: 'LAND_RECORD_ERROR',
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({ 
      error: 'Land Record API request failed' 
    });
  }
};

/**
 * Get MapServer metadata (layers, fields, etc.)
 * GET /mapserver/metadata
 * Returns publicly available metadata about MapServer structure
 */
export const getMapServerMetadata = async (req, res) => {
  try {
    const userId = req.user?.sub || req.user?.id || 'unknown';
    const requestPath = `${HSAC_ORIGIN}${HSAC_MAP_SERVICE_PATH}`;

    // Log access
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_METADATA_REQUEST',
      resource: requestPath,
      ip: req.ip,
    });

    const response = await fetch(`${requestPath}?f=json`, {
      method: 'GET',
      headers: {
        'User-Agent': 'EODB-Backend-Proxy/1.0',
      },
      timeout: 15000,
    });

    if (!response.ok) {
      throw new Error(`MapServer returned ${response.status}`);
    }

    const data = await response.json();
    
    // Filter sensitive information if needed
    res.json({
      layers: data.layers || [],
      spatialReference: data.spatialReference || {},
      documentInfo: data.documentInfo || {},
    });
  } catch (error) {
    console.error('Metadata request error:', error);
    
    const userId = req.user?.sub || req.user?.id || 'unknown';
    await logSecurityEvent({
      userId,
      action: 'MAPSERVER_METADATA_ERROR',
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({ 
      error: 'Could not retrieve metadata' 
    });
  }
};
