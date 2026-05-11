# EODB Project API Security Implementation  
**Date**: May 11, 2026  
**Objective**: Prevent unauthorized API access, data linking, and downloads

---

## 🔒 Security Architecture

### Problem Statement
- **Before**: Users could directly access the ArcGIS MapServer API endpoint by inspecting network traffic
- **Threat**: Data could be extracted, linked, or downloaded without proper authentication/authorization
- **Solution**: Route all MapServer queries through an authenticated backend proxy

---

## 1. Backend Proxy Implementation

### Location
```
d:\Harsac_Project\08_May_2026_EODB\EODB_Backend\src\mapserver\
├── mapserver.controller.js   # Proxy logic
└── mapserver.routes.js       # Route definitions
```

### How It Works

All MapServer API calls must go through the backend:

```
Frontend API Call
    ↓
JWT Token Verification (authMiddleware)
    ↓
Access Logging & Audit Trail
    ↓
Query Validation (block export/download)
    ↓
Forward to HSAC MapServer
    ↓
Return Result to Frontend (with audit log)
```

### Protected Endpoints

#### 1. **Query Endpoint** - `/mapserver/query` (POST)
Proxies to: `/server/rest/services/EODB/EODB_HR23/MapServer/{layerId}/query`

**Blocked Operations**: 
- Export (format=pdf, png, jpg, etc.)

**Example Request**:
```javascript
POST /mapserver/query
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "layerId": 26,
  "where": "n_d_code='09'",
  "outFields": ["n_d_code", "n_d_name"],
  "returnGeometry": false
}
```

#### 2. **Identify Endpoint** - `/mapserver/identify` (POST)
Proxies to: `/server/rest/services/EODB/EODB_HR23/MapServer/identify`

#### 3. **Land Record API** - `/mapserver/land-record/{method}` (GET)
Proxies to: `/LandOwnerAPI/getownername.asmx/{method}`

**Whitelisted Methods**:
- GetKhewats
- GetJamabandiPeriod
- GetKhatonis
- Owner_name
- GetOwnerInfo

#### 4. **Metadata Endpoint** - `/mapserver/metadata` (GET)
Provides non-sensitive MapServer metadata (layer structure, field names)

---

## 2. Authentication & Authorization

### Requirement: JWT Token in Every Request

All MapServer proxy requests require a valid JWT token in the Authorization header:

```
Authorization: Bearer <JWT_TOKEN>
```

**Token Verification**:
- Extracted from `Authorization` header or `auth_token` cookie
- Verified using `JWT_SECRET` from environment
- Invalid/expired tokens return **401 Unauthorized**

**Code Location**: `d:\Harsac_Project\08_May_2026_EODB\EODB_Backend\src\middleware\auth.middleware.js`

---

## 3. Access Logging & Audit Trail

Every MapServer query is logged with:
- **User ID**: WHO made the request
- **Action**: MAPSERVER_QUERY, MAPSERVER_IDENTIFY, LAND_RECORD_API_CALL
- **Resource**: Which MapServer endpoint/layer
- **IP Address**: Client IP for tracking
- **Timestamp**: When the request was made
- **Query Parameters**: WHERE clause, fields, etc. (sanitized)
- **Blocked Actions**: Attempts to export/download (logged as BLOCKED_MAPSERVER_EXPORT)

**Log Storage**: `d:\Harsac_Project\08_May_2026_EODB\EODB_Backend\src\services\auditLogService.js`

**Access logs**:
```javascript
{
  timestamp: "2026-05-11T10:30:45.123Z",
  userId: "user-123",
  action: "MAPSERVER_QUERY",
  resource: "https://hsac.org.in/server/rest/services/EODB/EODB_HR23/MapServer/26/query",
  ip: "192.168.1.100",
  params: {
    layerId: "26",
    where: "n_d_code='09'",
    outFields: ["n_d_code", "n_d_name"]
  }
}
```

---

## 4. Frontend Changes

### Before (Insecure - Direct API Calls)
```javascript
// ❌ BLOCKED: This exposed MapServer URL to users
import * as restQuery from "@arcgis/core/rest/query.js";

const url = "https://hsac.org.in/server/rest/services/EODB/EODB_HR23/MapServer/26/query";
await restQuery.executeQueryJSON(url, query);
```

### After (Secure - Backend Proxy)
```javascript
// ✅ SECURE: Routes through authenticated backend proxy
import { queryMapServer } from '@/services/mapserverProxyService';

const result = await queryMapServer({
  layerId: 26,
  where: "n_d_code='09'",
  outFields: ["n_d_code", "n_d_name"],
  returnGeometry: false
});
```

**Frontend Service**: `d:\Harsac_Project\08_May_2026_EODB\EODB_Project\src\services\mapserverProxyService.js`

---

## 5. Export/Download Prevention

### Blocked Operations
The backend actively prevents export/download operations:

```javascript
if (endpoint === 'export') {
  // Block request with 403 Forbidden
  return res.status(403).json({ 
    error: 'Export operations are not permitted' 
  });
}
```

**What's Blocked**:
- `format=pdf` → 403 Forbidden
- `format=png` → 403 Forbidden
- `format=jpg` → 403 Forbidden
- Direct download requests → 403 Forbidden

**What's Allowed**:
- `query` → Returns JSON features (only what user requested)
- `identify` → Returns feature information at clicked location

---

## 6. CORS & Network Security

### CORS Configuration
`ALLOWED_ORIGINS` environment variable controls which origins can access the API:

```bash
# Production: Only allow EODB frontend
ALLOWED_ORIGINS=https://hsac.org.in,https://eodb.org.in

# Development: Allow localhost
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Direct MapServer Access Prevention
The browser's **Content Security Policy** (if enabled) prevents inline scripts from making HTTP requests to external MapServer URLs.

**Current CORS Configuration** (`src/middleware/security.middleware.js`):
```javascript
export const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow server-to-server
    if (allowedOrigins.has(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: origin not allowed`)); // Block unauthorized origins
  },
  credentials: true,
  optionsSuccessStatus: 200,
};
```

---

## 7. Deployment Checklist

### Backend (.env Configuration)
```bash
# JWT Configuration
JWT_SECRET=your_super_secret_key_min_32_chars
AUTH_SECRET=your_super_secret_key_min_32_chars
SESSION_SECRET=your_session_secret_min_32_chars

# HSAC MapServer Configuration
HSAC_ORIGIN=https://hsac.org.in
HSAC_MAP_SERVICE_PATH=/server/rest/services/EODB/EODB_HR23/MapServer
HSAC_ASMX_BASE_PATH=/LandOwnerAPI/getownername.asmx

# CORS Configuration
ALLOWED_ORIGINS=https://hsac.org.in,https://eodb.org.in

# Rate Limiting
GENERAL_RATE_LIMIT_WINDOW_MS=900000
GENERAL_RATE_LIMIT_MAX_REQUESTS=100

# Environment
NODE_ENV=production
```

### Frontend (.env Configuration)
```bash
# Backend API Base URL (must match production server)
VITE_SERVER_BASE_URL=https://hsac.org.in/eodb_backend

# MapServer queries will be routed through /mapserver proxy
# No direct HSAC_ORIGIN URLs should be used in frontend code
```

---

## 8. Testing & Validation

### Test 1: Verify JWT Token Requirement
```bash
# Without token - should return 401
curl -X POST https://hsac.org.in/eodb_backend/mapserver/query

# With valid token - should work
curl -X POST https://hsac.org.in/eodb_backend/mapserver/query \
  -H "Authorization: Bearer <valid_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"layerId": 26, "where": "1=1"}'
```

### Test 2: Verify Export Blocking
```bash
# Should return 403 Forbidden
curl -X POST https://hsac.org.in/eodb_backend/mapserver/query \
  -H "Authorization: Bearer <valid_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"endpoint": "export", "format": "pdf"}'
```

### Test 3: Verify Audit Logging
```bash
# Check logs for MapServer access
tail -f /path/to/audit-logs.txt | grep MAPSERVER_QUERY
```

### Test 4: Verify CORS Blocking
```bash
# Request from unauthorized origin - should be blocked
curl -X POST https://hsac.org.in/eodb_backend/mapserver/query \
  -H "Origin: https://attacker.com" \
  -H "Authorization: Bearer <valid_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"layerId": 26}'
```

---

## 9. Attack Surface Reduction

### Before This Implementation
```
┌─────────────┐
│   User      │
│  Browser    │
└──────┬──────┘
       │ 1. Inspect Network Tab
       │ 2. Find MapServer URL
       │ 3. Copy URL
       ↓
┌──────────────────────────────────────────────┐
│  https://hsac.org.in/server/rest/services/... │
│        (Direct Access - No Auth Required)     │
└──────────────────────────────────────────────┘
       │
       │ Can download all data!
       ↓
   [ Data Leak ]
```

### After This Implementation
```
┌─────────────┐
│   User      │
│  Browser    │
└──────┬──────┘
       │
       ↓
┌──────────────────────────────────┐
│  Frontend Code (mapserverProxy)  │
│  Sends JWT token + query params  │
└──────┬───────────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│  Backend Proxy (/mapserver)          │
│  1. Verify JWT token                 │
│  2. Block export/download operations │
│  3. Log all access                   │
│  4. Forward to MapServer             │
└──────┬───────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│  HSAC MapServer                      │
│  (Protected - Internal Network)      │
└──────────────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│  Backend logs the access             │
│  Audit Trail for Security Team       │
└──────────────────────────────────────┘

User cannot:
✓ Find or access MapServer URL
✓ Download data files
✓ Link to API endpoints
✓ Bypass authentication
```

---

## 10. Monitoring & Maintenance

### Monthly Security Audit
1. Review access logs: `auditLogService.getSecurityLogs()`
2. Check for suspicious patterns (bulk downloads, repeated export attempts)
3. Verify all API calls have valid JWT tokens
4. Monitor CORS rejection logs

### Blocked Attempts Alert
```javascript
// Alert if export attempts detected
const exportBlocks = filterSecurityLogs({
  action: 'BLOCKED_MAPSERVER_EXPORT'
});
if (exportBlocks.length > 5) {
  // Send alert to security team
  notifySecurityTeam('Multiple export attempts blocked');
}
```

---

## 11. Future Enhancements

- [ ] Add field-level access control (user can only see certain columns)
- [ ] Implement per-layer rate limiting (lower limits for heavy queries)
- [ ] Add geofencing (only allow queries in assigned districts)
- [ ] Database audit log storage (persistent, searchable logs)
- [ ] Elasticsearch integration (log analysis & alerting)
- [ ] User activity dashboard in admin panel
- [ ] Automated blocking of repeated violations

---

## Summary

✅ **All MapServer API calls now require JWT authentication**  
✅ **Direct access to MapServer blocked at application level**  
✅ **All access logged for audit trail**  
✅ **Export/download operations prevented**  
✅ **CORS restricts requests to authorized origins**  

**Result**: Users cannot copy, link, or download API data.
