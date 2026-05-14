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

// Token-based guard for every mapserver endpoint.
// In addition to JWT verification, ensure token payload carries a user identifier.
const mapserverAuthGuard = (req, res, next) => {
  authMiddleware(req, res, () => {
    const tokenUserId = req.user?.id ?? req.user?.sub;
    if (!tokenUserId) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }
    return next();
  });
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
