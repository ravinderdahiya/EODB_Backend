import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  proxyMapServerQuery,
  proxyMapServerIdentify,
  proxyLandRecordAPI,
  proxyArcgisService,
  getMapServerMetadata,
} from './mapserver.controller.js';

const router = express.Router();

/**
 * MapServer Proxy Routes
 * ────────────────────────────────────────────────────────────────────────────
 * Public read-only service routes are exposed for ArcGIS layer rendering.
 * Sensitive query/identify/land-record routes remain JWT-protected.
 */

// Public ArcGIS service proxy for map/basemap/cadastral layer rendering.
// Example:
//   /mapserver/service/hsacMain
//   /mapserver/service/hsacMain/26/query?f=json
//   /mapserver/service/geocoder/findAddressCandidates?f=json...
router.use('/service/:serviceKey', proxyArcgisService);

// Get MapServer metadata (layers, fields, spatial reference)
// GET /mapserver/metadata
router.get('/metadata', getMapServerMetadata);

// Protected endpoints below this point.
router.use(authMiddleware);

// POST /mapserver/query
router.post('/query', proxyMapServerQuery);

// POST /mapserver/identify
router.post('/identify', proxyMapServerIdentify);

// GET /mapserver/land-record/:method
router.get('/land-record/:method', proxyLandRecordAPI);

export default router;
