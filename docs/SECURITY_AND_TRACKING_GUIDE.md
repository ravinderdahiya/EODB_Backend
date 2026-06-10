# 🔐 IP + Location Tracking & API Security Implementation

## ✅ What's Been Added

### 1. **Database Schema Updates**
- Added `LoginSession` table to track all login attempts with:
  - IP Address
  - Latitude & Longitude
  - Country & City
  - User Agent
  - Login timestamp & expiration
  
- Enhanced `User` table with:
  - Last login IP, latitude, longitude
  - Login attempts counter
  - Account lock mechanism
  - Lock expiration time

### 2. **Security Middleware**
- ✅ **IP Tracking** - Extracts client IP from request headers
- ✅ **Geolocation** - Gets lat/long from IP using geoip-lite
- ✅ **Security Headers** - Helmet.js security headers
- ✅ **Rate Limiting** - Multiple rate limit strategies
- ✅ **Account Locking** - Auto-lock after 5 failed attempts (30 minutes)
- ✅ **Request Logging** - All API requests logged with tracking data

### 3. **Rate Limiting Strategy**
| Limit Type | Max Attempts | Window | Purpose |
|-----------|-------------|--------|---------|
| General API | 100 | 15 min | Prevent DoS attacks |
| Login/OTP Verify | 5 | 15 min | Prevent brute force |
| OTP Send | 3 | 5 min | Prevent SMS spam |

### 4. **API Response Enhanced**
Login response now includes location data:
```json
{
  "message": "OTP verified successfully",
  "token": "jwt_token_here",
  "session": "session_id",
  "user": {
    "id": 1,
    "mobile": "+919992676760",
    "email": "user@eodb.com",
    "lastLogin": {
      "ip": "203.0.113.45",
      "latitude": 28.6139,
      "longitude": 77.2090,
      "city": "Delhi",
      "country": "IN"
    }
  }
}
```

---

## 🔧 Setup Instructions

### Step 1: Restart Terminal
```bash
# Close and reopen terminal to fix Prisma file lock issue
# Then verify migration:
npx prisma db push
```

### Step 2: Update .env Variables
Already done ✅

### Step 3: Start Server
```bash
npm run dev
```

---

## 📊 Security Features Explained

### 1️⃣ **IP Address Extraction**
- Checks `X-Forwarded-For` header (proxy/load balancer)
- Falls back to `X-Real-IP` header
- Finally uses direct socket connection
- Handles IPv6 localhost conversion

### 2️⃣ **Geolocation Lookup**
- Uses `geoip-lite` database (offline, no external API calls)
- Returns: Country, City, Latitude, Longitude, Timezone
- Stored in `LoginSession` table for audit trail

### 3️⃣ **Account Locking**
```
Failed Attempt 1 → loginAttempts = 1
Failed Attempt 2 → loginAttempts = 2
Failed Attempt 3 → loginAttempts = 3
Failed Attempt 4 → loginAttempts = 4
Failed Attempt 5 → 🔒 Account LOCKED for 30 minutes
                 → Returns HTTP 423 (Locked)
```

### 4️⃣ **Login Session Tracking**
Each successful login creates a `LoginSession` record with:
- User ID
- IP Address
- Geographic location
- Browser/Device info (User Agent)
- Expiration time (24 hours)

---

## 📝 API Endpoints with Tracking

### Send OTP
```bash
curl -X POST http://localhost:5000/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile": "+919992676760"}'
```

**Rate Limited:** 3 per 5 minutes per phone number

### Verify OTP
```bash
curl -X POST http://localhost:5000/otp/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile": "+919992676760", "otp": "123456"}'
```

**Rate Limited:** 5 per 15 minutes per IP

**Response includes:**
- JWT Token
- Session ID
- Location data (IP, lat, lng, city, country)

### Health Check
```bash
curl http://localhost:5000/health
```

Returns server status with your current location tracking info.

---

## 🔍 Monitoring & Debugging

### View Login Sessions (SQL)
```sql
SELECT 
  ls.id,
  ls.userId,
  u.mobile,
  ls.ipAddress,
  ls.latitude,
  ls.longitude,
  ls.city,
  ls.country,
  ls.loginAt,
  ls.status
FROM login_sessions ls
JOIN users u ON ls.userId = u.id
ORDER BY ls.loginAt DESC
LIMIT 10;
```

### View Failed Login Attempts (SQL)
```sql
SELECT 
  id,
  mobile,
  loginAttempts,
  isLocked,
  lockedUntil,
  lastLoginAt,
  lastLoginIp
FROM users
WHERE loginAttempts > 0
ORDER BY loginAttempts DESC;
```

### Console Logs During Login
```
📱 Send OTP Request - Raw phone: 9992676760
📱 Send OTP Request - Normalized phone: +919992676760
✅ OTP Created: { phone: '+919992676760', otp: 654321, ... }
📨 SMS API Response: { status: 200, data: {...} }

🔐 Verify OTP Request - Raw: { phone: '9992676760', otp: '654321' }
🌍 Client IP: 203.0.113.45
📍 Geolocation Data: { city: 'Delhi', country: 'IN', ... }
👤 Looking up user with mobile: +919992676760
➕ Creating new user...
🔑 Generating JWT Token...
📝 Recording login attempt...
🔐 Creating login session...
✅ Login completed successfully
```

---

## 🛡️ Security Best Practices Implemented

1. **Helmet.js** - Sets 15+ security HTTP headers
2. **CORS Restricted** - Only allowed origins can access API
3. **Rate Limiting** - Prevents brute force & DoS attacks
4. **Account Locking** - Automatic lock after failed attempts
5. **Session Management** - Each login gets unique session ID
6. **Audit Trail** - All logins recorded with location data
7. **JWT Expiration** - Tokens expire after 1 day
8. **HTTPOnly Cookies** - Session cookies cannot be accessed by JavaScript
9. **SameSite Policy** - CSRF protection enabled
10. **Input Validation** - Phone format normalization & validation

---

## 🚀 Production Checklist

- [ ] Update `.env` `NODE_ENV=production`
- [ ] Change `SESSION_SECRET` to random string
- [ ] Update `JWT_SECRET` to strong random key (32+ chars)
- [ ] Configure `CORS` origins for your frontend domain
- [ ] Set `secure: true` in session cookies for HTTPS
- [ ] Monitor rate limit violations in logs
- [ ] Periodically review `LoginSession` table for suspicious activity
- [ ] Implement auto-cleanup of expired sessions
- [ ] Add 2FA (Two-Factor Authentication) for extra security
- [ ] Use HTTPS only (redirect HTTP to HTTPS)

---

## 📞 Testing Commands

### 1. Get Health Status
```bash
curl http://localhost:5000/health
```

### 2. Send OTP with Tracking
```bash
curl -X POST http://localhost:5000/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile": "9992676760"}'
```

### 3. Verify OTP (gets tracked)
```bash
curl -X POST http://localhost:5000/otp/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile": "9992676760", "otp": "123456"}'
```

### 4. Test Rate Limiting (send 6+ in 5 mins)
```bash
for i in {1..6}; do
  curl -X POST http://localhost:5000/otp/send-otp \
    -H "Content-Type: application/json" \
    -d '{"mobile": "9992676760"}'
  echo "\nRequest $i"
  sleep 1
done
```

Expected: 6th request returns 429 (Too Many Requests)

---

## 📂 File Structure

```
EODB_Backend/
├── src/
│   ├── middleware/
│   │   ├── tracking.middleware.js    ← IP & Geolocation
│   │   ├── security.middleware.js    ← Rate limiting & auth
│   │   └── auth.middleware.js        ← JWT verification
│   ├── otp/
│   │   ├── otp.controller.js         ← Updated with tracking
│   │   └── otp.routes.js             ← Updated with rate limits
│   ├── app.js                         ← Updated with middleware
│   ├── server.js
│   └── config/
├── prisma/
│   ├── schema.prisma                  ← Updated schema
│   └── migrations/
└── .env                               ← Updated config
```

---

## 🐛 Troubleshooting

### Issue: Prisma file lock error
**Solution:** Restart terminal and run `npx prisma db push`

### Issue: Rate limit error too soon
**Solution:** Wait for window time or increase `API_RATE_LIMIT_MAX` in `.env`

### Issue: No location data in response
**Solution:** Check if geoip-lite database is installed: `npm list geoip-lite`

### Issue: Account locked but can't unlock
**Solution:** Update user directly in database or wait 30 minutes for auto-unlock

### Issue: IP showing as 127.0.0.1 (localhost)
**Solution:** Normal in development. In production, will show real IP from reverse proxy headers.

---

## 🎯 Next Steps

1. ✅ Restart server after migration
2. ✅ Test with OTP endpoints
3. ✅ Check console logs for tracking data
4. ✅ Monitor `login_sessions` table in database
5. ✅ Add frontend notification for location-based login alerts
6. ✅ Implement "Unknown Location" login alerts
7. ✅ Add device/browser recognition
8. ✅ Implement session revocation endpoint

---

## 📚 Security References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- JWT Best Practices: https://tools.ietf.org/html/rfc8725
- Rate Limiting Guide: https://cheatsheetseries.owasp.org/cheatsheets/Brute_Force_Cheat_Sheet.html
- Helmet.js Docs: https://helmetjs.github.io/

