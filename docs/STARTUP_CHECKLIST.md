# ✅ STARTUP CHECKLIST - IP + Location Tracking

## 🚀 Before Starting Server

### Step 1: Restart Terminal ⚡
- [ ] Close current terminal completely
- [ ] Open new terminal window
- [ ] This fixes Prisma Windows file lock issues

### Step 2: Navigate to Backend Directory 📁
```bash
cd C:\Users\user\Ravinder_Projects\EODB_Backend
```

### Step 3: Verify Dependencies ✓
```bash
npm list geoip-lite helmet express-rate-limit
```

Expected output:
```
├── geoip-lite@1.x.x
├── helmet@7.x.x
└── express-rate-limit@7.x.x
```

If any missing, run:
```bash
npm install geoip-lite helmet express-rate-limit
```

### Step 4: Sync Database 🗄️
```bash
npx prisma db push
```

Expected output:
```
Datasource "db": PostgreSQL database "eodb_db"
Your database is now in sync with your schema.
```

**If error occurs:**
```bash
# Option 1: Generate Prisma client
npx prisma generate

# Option 2: Reset database (WARNING: deletes all data)
npx prisma migrate reset --force
```

### Step 5: View Database (Optional) 🔍
```bash
npx prisma studio
```

This opens a GUI at http://localhost:5555 to view/edit data

### Step 6: Start Server 🎮
```bash
npm run dev
```

Expected output:
```
📱 Server running on 5000
✅ API working at http://localhost:5000
```

---

## 🧪 Testing After Startup

### Test 1: Health Check
```bash
curl http://localhost:5000/health
```

Expected response with your IP & location:
```json
{
  "status": "OK",
  "timestamp": "2026-04-24T12:34:56.789Z",
  "ip": "127.0.0.1",
  "location": {
    "ip": "127.0.0.1",
    "latitude": null,
    "longitude": null,
    "country": null,
    "city": null,
    "timezone": null
  }
}
```

### Test 2: Send OTP
```bash
curl -X POST http://localhost:5000/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile": "9992676760"}'
```

Expected response:
```json
{
  "message": "OTP sent successfully",
  "phone": "+919992676760",
  "otp": 654321,
  "smsSent": true,
  "expiresIn": "5 minutes"
}
```

**Note:** OTP shown only in development mode

### Test 3: Verify OTP (Use OTP from Step 2)
```bash
curl -X POST http://localhost:5000/otp/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile": "9992676760", "otp": "654321"}'
```

Expected response with tracking data:
```json
{
  "message": "OTP verified successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "session": "clv9jk2l0000ql308abc123def",
  "user": {
    "id": 1,
    "mobile": "+919992676760",
    "email": "user_1234567890@eodb.com",
    "lastLogin": {
      "ip": "127.0.0.1",
      "latitude": null,
      "longitude": null,
      "city": null,
      "country": null
    }
  }
}
```

---

## 📊 Verify Tracking Data in Database

### Connect to PostgreSQL
```bash
psql -U postgres -d eodb_db
```

### View Login Sessions
```sql
SELECT id, "userId", "ipAddress", city, country, "loginAt", status 
FROM login_sessions 
ORDER BY "loginAt" DESC 
LIMIT 5;
```

### View User Security Info
```sql
SELECT id, mobile, "loginAttempts", "isLocked", "lastLoginIp", "lastLoginAt" 
FROM users;
```

### Exit psql
```bash
\q
```

---

## 📝 Monitor Console Logs

Watch server console for detailed logs like:

```
🌍 Client IP: 127.0.0.1
📍 Geolocation Data: { city: null, country: null, ... }
📊 Request Tracking: { ip: '127.0.0.1', latitude: null, ... }
📱 Send OTP Request - Normalized phone: +919992676760
✅ OTP Created: { phone: '+919992676760', otp: 654321, ... }
🔐 Verify OTP Request - Normalized phone: +919992676760
👤 Looking up user with mobile: +919992676760
🔑 Generating JWT Token...
📝 Recording login attempt...
🔐 Creating login session...
✅ Login completed successfully
```

---

## ⚙️ Configuration Reference

### Rate Limiting Settings (in .env)
```env
API_RATE_LIMIT_WINDOW=15      # minutes
API_RATE_LIMIT_MAX=100        # requests per window
LOGIN_RATE_LIMIT_MAX=5        # login attempts per window
OTP_RATE_LIMIT_MAX=3          # OTP attempts per 5 minutes
```

### Tracking Settings (in .env)
```env
TRACK_USER_LOCATION=true      # Enable location tracking
LOG_LOGIN_ATTEMPTS=true       # Log all attempts
NODE_ENV=development          # development or production
```

### Security Settings
```env
JWT_SECRET=your_secret_key    # Must be 32+ characters
SESSION_SECRET=session_secret  # Session encryption key
```

---

## 🐛 Troubleshooting

### Problem: "Port 5000 already in use"
```bash
# Find process using port 5000
netstat -ano | findstr :5000

# Kill process (replace PID)
taskkill /PID <PID> /F
```

### Problem: "Database connection failed"
```bash
# Check PostgreSQL is running
# Windows: Services -> PostgreSQL (should be "Running")
# Or start PostgreSQL:
# pg_ctl -D "C:\Program Files\PostgreSQL\data" start
```

### Problem: "Prisma file lock error"
```bash
# Simply restart terminal - Windows file lock resolves
# Then run:
npx prisma generate
```

### Problem: "JWT_SECRET missing or too short"
```bash
# Update .env with a strong key:
JWT_SECRET=your_super_secret_key_with_at_least_32_characters_minimum
```

### Problem: "Rate limit error immediately"
```bash
# Check if running localhost test
# In production, real IP will be used
# For testing, temporarily increase limits in .env
```

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) | Overview of everything added |
| [SECURITY_AND_TRACKING_GUIDE.md](./SECURITY_AND_TRACKING_GUIDE.md) | Detailed security features |
| [SECURITY_AUDIT_QUERIES.md](./SECURITY_AUDIT_QUERIES.md) | SQL queries for monitoring |
| [OTP_TROUBLESHOOTING.md](./OTP_TROUBLESHOOTING.md) | OTP-specific help |
| [QUICK_TEST_GUIDE.md](./QUICK_TEST_GUIDE.md) | Quick testing reference |
| [SMS_API_INTEGRATION_GUIDE.md](./SMS_API_INTEGRATION_GUIDE.md) | SMS API setup |

---

## 🎯 First Run Summary

1. ✅ Restart terminal
2. ✅ Run `npx prisma db push`
3. ✅ Run `npm run dev`
4. ✅ Test with health check
5. ✅ Test OTP send/verify
6. ✅ Check database for session records
7. ✅ Read SECURITY_AND_TRACKING_GUIDE.md for next steps

---

## ✨ Success Indicators

You'll know everything is working when:

- ✅ Server starts without errors
- ✅ Health endpoint returns current tracking data
- ✅ OTP endpoints respond with correct format
- ✅ Console shows detailed tracking logs
- ✅ Database contains new `LoginSession` records
- ✅ User security fields are updated (`lastLoginIp`, etc.)
- ✅ Subsequent logins increment `loginAttempts`
- ✅ 5th failed attempt locks the account

---

## 🔐 Security Verification

Test rate limiting:
```bash
# Send 6 OTP requests in 5 minutes (limit is 3)
for i in {1..6}; do
  curl -X POST http://localhost:5000/otp/send-otp \
    -H "Content-Type: application/json" \
    -d '{"mobile": "9992676760"}'
  echo "\nRequest $i - Status: $?"
  sleep 1
done
```

6th request should fail with 429 (Too Many Requests)

---

## 📞 Support

If you encounter issues:

1. **Check Console Logs** - Look for error messages with emoji indicators
2. **Verify .env** - Ensure all required variables are set
3. **Test Database** - Run health check endpoint
4. **Read Docs** - Check relevant troubleshooting guide
5. **Restart Server** - Fresh start often resolves issues

---

## 🎉 Ready to Go!

Your EODB Backend is now secured with IP + location tracking!

**Start server and test now:** `npm run dev`

Happy coding! 🚀

