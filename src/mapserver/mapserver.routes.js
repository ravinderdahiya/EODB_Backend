import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  proxyMapServerQuery,
  proxyMapServerIdentify,
  proxyLandRecordAPI,
  getMapServerMetadata,
} from './mapserver.controller.js';

const router = express.Router();

/**
 * MapServer Secure Proxy Routes
 * ────────────────────────────────────────────────────────────────────────────
 * All routes require JWT authentication. These endpoints proxy to HSAC MapServer
 * with token verification, access logging, and export prevention.
 */

// ✅ All MapServer routes require authentication
router.use(authMiddleware);

// GET/POST MapServer query endpoint
// Forwards to: /server/rest/services/EODB/EODB_HR23/MapServer/{layerId}/query
router.post('/query', proxyMapServerQuery);

// GET/POST MapServer identify endpoint
// Forwards to: /server/rest/services/EODB/EODB_HR23/MapServer/identify
router.post('/identify', proxyMapServerIdentify);

// Land Record ASMX API
// GET /mapserver/land-record/GetKhewats?...
// Forwards to: /LandOwnerAPI/getownername.asmx/GetKhewats?...
router.get('/land-record/:method', proxyLandRecordAPI);

// Get MapServer metadata (layers, fields, spatial reference)
// GET /mapserver/metadata
router.get('/metadata', getMapServerMetadata);

export default router;
