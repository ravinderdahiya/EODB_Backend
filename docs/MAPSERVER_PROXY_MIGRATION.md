# MapServer Proxy Migration Guide
**Date**: May 11, 2026  
**Purpose**: Migrate frontend from direct MapServer API calls to secure backend proxy

---

## Overview

### What Changed
- **Before**: Frontend makes direct HTTP requests to HSAC MapServer
- **After**: All MapServer requests go through authenticated backend proxy at `/mapserver`

### Why This Matters
- ✅ Users cannot copy/link MapServer URLs
- ✅ Users cannot download data directly
- ✅ All access is logged and auditable
- ✅ Export operations are blocked

---

## Migration Steps

### Step 1: Update mapQueryService.js

**File**: `d:\Harsac_Project\08_May_2026_EODB\EODB_Project\src\services\mapQueryService.js`

**Current Code** (INSECURE):
```javascript
import * as restQuery from "@arcgis/core/rest/query.js";
import Query from "@arcgis/core/rest/support/Query.js";
import { HSAC_MAIN_URL } from "@/config/arcgis";

export async function getDistricts() {
  const layerPlan = await getHsacLayerPlan();
  const q = new Query({
    outFields: ["n_d_code", "n_d_name"],
    returnDistinctValues: true,
    returnGeometry: false,
    orderByFields: ["n_d_name"],
    where: "n_d_code IS NOT NULL...",
    outSpatialReference: { wkid: 4326 },
  });

  // ❌ INSECURE: Direct REST call to MapServer
  const res = await restQuery.executeQueryJSON(
    `${HSAC_MAIN_URL}/${layerPlan.districtLayerId}`,
    q,
  );

  return mapDistinctOptions(res.features, "n_d_code", "n_d_name");
}
```

**Updated Code** (SECURE):
```javascript
import { queryMapServer } from "@/services/mapserverProxyService";

export async function getDistricts() {
  const layerPlan = await getHsacLayerPlan();

  // ✅ SECURE: Routes through backend proxy
  const result = await queryMapServer({
    layerId: layerPlan.districtLayerId,
    outFields: ["n_d_code", "n_d_name"],
    returnDistinctValues: true,
    returnGeometry: false,
    orderByFields: ["n_d_name"],
    where: "n_d_code IS NOT NULL AND n_d_code <> '' AND n_d_name IS NOT NULL AND n_d_name <> ''",
    outSpatialReference: { wkid: 4326 },
  });

  return mapDistinctOptions(result.features, "n_d_code", "n_d_name");
}
```

### Step 2: Update All Direct REST Calls

**Search for these patterns in the codebase**:
```
restQuery.executeQueryJSON
restQuery.executeRelationshipQuery
fetch('https://hsac.org.in/server/rest/services...')
new Query({ ... })
```

**Replace with**:
```javascript
import { 
  queryMapServer, 
  identifyMapServer, 
  callLandRecordAPI 
} from "@/services/mapserverProxyService";

// Query operation
const result = await queryMapServer({
  layerId: 26,
  where: "...",
  outFields: [...],
});

// Identify operation
const identified = await identifyMapServer({
  geometry: { x, y },
  geometryType: "esriGeometryPoint",
  layerIds: [26, 27, 28],
  tolerance: 5,
});

// Land Record API
const khewats = await callLandRecordAPI('GetKhewats', {
  dCode: '09',
  tCode: '01',
  kCode: 'K001',
});
```

### Step 3: Update landRecordService.js

**File**: `d:\Harsac_Project\08_May_2026_EODB\EODB_Project\src\services\landRecordService.js`

**Current Code** (INSECURE):
```javascript
const res = await fetch(url, {
  method: "GET",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
});
```

**Updated Code** (SECURE):
```javascript
import { callLandRecordAPI } from "@/services/mapserverProxyService";

// Replace fetch() with:
const result = await callLandRecordAPI('GetOwnerInfo', {
  dCode: dCode,
  tCode: tCode,
  khNo: khNo,
  khewatNo: khewatNo,
});
```

---

## Service API Reference

### queryMapServer(params)
Query features from a MapServer layer.

**Parameters**:
```javascript
{
  layerId: number,              // Required: Layer ID (26, 27, 28, etc.)
  where: string,                // Required: WHERE clause
  outFields: string[],          // Fields to return
  returnGeometry: boolean,      // Include geometry (default: false)
  returnDistinctValues: boolean,// Distinct values only
  orderByFields: string[],      // Sort order
  resultOffset: number,         // Pagination offset
  resultRecordCount: number,    // Pagination limit
}
```

**Returns**: 
```javascript
{
  features: [
    {
      attributes: { ... },
      geometry: { ... }
    }
  ],
  exceededTransferLimit: boolean
}
```

**Example**:
```javascript
const result = await queryMapServer({
  layerId: 27,
  where: "n_d_code='09'",
  outFields: ["n_t_code", "n_t_name"],
  returnGeometry: false,
  orderByFields: ["n_t_name"],
});

result.features.forEach(f => {
  console.log(f.attributes.n_t_name);
});
```

---

### identifyMapServer(params)
Identify features at a geographic location.

**Parameters**:
```javascript
{
  geometry: object,             // Point, extent, or polygon
  geometryType: string,         // esriGeometryPoint, esriGeometryEnvelope
  layerIds: number[],           // Layers to identify on
  tolerance: number,            // Tolerance in screen pixels
  outFields: string[],          // Fields to return
  returnGeometry: boolean,      // Include geometry
}
```

**Returns**:
```javascript
{
  results: [
    {
      layerId: number,
      value: string,
      displayFieldName: string,
      attributes: { ... },
      geometry: { ... }
    }
  ]
}
```

---

### callLandRecordAPI(method, params)
Call the Land Record ASMX Web Service.

**Parameters**:
```javascript
{
  method: string,    // GetKhewats, GetJamabandiPeriod, Owner_name, etc.
  params: object,    // Query parameters (varies by method)
}
```

**Allowed Methods**:
- `GetKhewats` - Get khewats for a location
- `GetJamabandiPeriod` - Get jamabandi periods
- `GetKhatonis` - Get khatoni information
- `Owner_name` - Get owner names
- `GetOwnerInfo` - Get full owner information

**Example**:
```javascript
const owners = await callLandRecordAPI('Owner_name', {
  dCode: '09',
  tCode: '01',
  khNo: 'K001',
  khewatNo: 'K0001',
});
```

---

## Codebase Locations to Update

### Frontend Files
```
src/
├── services/
│   ├── mapQueryService.js          ← Replace restQuery calls
│   ├── landRecordService.js        ← Replace fetch calls
│   ├── parcelRecordService.js      ← Update if needed
│   ├── mapserverProxyService.js    ← NEW: Use this for all queries
│   └── hsacLayerResolver.js        ← Update if calling MapServer
├── hooks/
│   ├── useArcGISMap.js             ← Update layer loading
│   └── useSelectFeatures.js        ← Update identify calls
├── components/
│   ├── SearchPanel.jsx             ← Update search queries
│   ├── ParcelDetailsModal.jsx      ← Update detail queries
│   └── MapStage.jsx                ← Update map interactions
└── App.jsx                         ← Update any direct calls
```

### Backend Files
```
src/
├── mapserver/
│   ├── mapserver.controller.js     ← NEW: Proxy controller
│   └── mapserver.routes.js         ← NEW: Route definitions
├── middleware/
│   ├── auth.middleware.js          ← Already checks JWT
│   └── security.middleware.js      ← CORS configuration
├── services/
│   └── auditLogService.js          ← NEW: Logging service
└── app.js                          ← Already configured
```

---

## Testing Checklist

### Unit Tests
- [ ] Test `queryMapServer()` with valid token
- [ ] Test `queryMapServer()` without token (should 401)
- [ ] Test `identifyMapServer()` returns correct features
- [ ] Test `callLandRecordAPI()` with each allowed method
- [ ] Test blocked methods (BLOCKED_MAPSERVER_EXPORT)

### Integration Tests
- [ ] Login → Query MapServer → Should succeed
- [ ] Invalid JWT → Query MapServer → Should 401
- [ ] Attempt to export → Should 403
- [ ] Check audit logs contain all queries

### Browser Tests
- [ ] Open DevTools → Network tab
- [ ] Confirm no direct calls to `hsac.org.in/server/rest/services/...`
- [ ] All calls go to `/mapserver/*`
- [ ] Right-click disabled (in production)
- [ ] F12 blocked (in production)

---

## Production Deployment

### Pre-Deployment Checklist
- [ ] All `restQuery.executeQueryJSON()` calls replaced
- [ ] All `fetch()` calls to HSAC replaced
- [ ] No direct MapServer URLs in frontend code
- [ ] Backend environment variables set (.env configured)
- [ ] CORS `ALLOWED_ORIGINS` configured correctly
- [ ] JWT_SECRET and AUTH_SECRET are strong (32+ chars)
- [ ] Rate limiting configured appropriately
- [ ] Audit logging implemented (database or file)

### Deployment Steps
1. Deploy backend changes to production
2. Verify `/mapserver/metadata` returns data
3. Deploy frontend changes
4. Run smoke tests (login → query → identify)
5. Monitor audit logs for errors
6. Check no direct MapServer calls in network tab

### Post-Deployment Monitoring
- [ ] Check backend logs for errors
- [ ] Verify audit logs are recording
- [ ] Monitor CORS rejections
- [ ] Monitor 401/403 error rates
- [ ] Check MapServer proxy response times

---

## Rollback Plan

If issues arise, rollback in this order:
1. Revert frontend code to previous version
2. Clear browser cache
3. Keep backend running (non-breaking)
4. Restart frontend application
5. Monitor error logs

---

## FAQ

**Q: Do I need to update my existing code?**  
A: Yes, any code making direct MapServer calls must be updated to use `mapserverProxyService`.

**Q: Will this impact performance?**  
A: Minimal impact - adds one backend hop but improves security significantly.

**Q: What happens if my token expires?**  
A: Request returns 401. Frontend should redirect to login.

**Q: Can users still see the MapServer URL in their browser history?**  
A: No - browser history will only show `/mapserver/*` calls, not the actual HSAC MapServer URL.

**Q: What if I need to allow exports?**  
A: Contact the security team. Exports require special authorization and should be logged separately.

---

## Contact & Support

For questions or issues:
- Security Team: security@hsac.org.in
- Backend Team: backend@hsac.org.in
- Frontend Team: frontend@hsac.org.in
