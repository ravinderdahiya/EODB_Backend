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

// All mapserver endpoints are protected.
router.use(authMiddleware);

// ArcGIS service proxy for map/basemap/cadastral rendering.
router.use('/service/:serviceKey', proxyArcgisService);

// MapServer metadata (layers, fields, spatial reference)
router.get('/metadata', getMapServerMetadata);

// POST /mapserver/query
router.post('/query', proxyMapServerQuery);

// POST /mapserver/identify
router.post('/identify', proxyMapServerIdentify);

// GET /mapserver/land-record/:method
router.get('/land-record/:method', proxyLandRecordAPI);

export default router;
