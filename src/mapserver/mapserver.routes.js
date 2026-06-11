import express from 'express';
import {
  proxyMapServerQuery,
  proxyMapServerIdentify,
  proxyLandRecordAPI,
  proxyArcgisService,
  getMapServerMetadata,
} from './mapserver.controller.js';

const router = express.Router();

// Global requireAuthUnlessPublic already validated the JWT/session. Only verify
// that the decoded token carries a user id before proxying map requests.
const mapserverAuthGuard = (req, res, next) => {
  const tokenUserId = req.user?.id ?? req.user?.sub;
  if (!tokenUserId) {
    return res.status(401).json({ message: 'Invalid token payload' });
  }
  return next();
};

router.use(mapserverAuthGuard);

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
