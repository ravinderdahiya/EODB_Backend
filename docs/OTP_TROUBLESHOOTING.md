# OTP API Troubleshooting Guide

## Recent Fixes Applied ✅

1. **Type Conversion** - OTP now properly converts from string to number
2. **Phone Validation** - Added phone format validation
3. **Error Details** - Errors now show actual error message (not just "Server error")
4. **JWT Secret Check** - Validates JWT_SECRET before token generation
5. **Enhanced Logging** - Console logs show exact step-by-step execution

---

## How to Test OTP APIs

### 1️⃣ Send OTP
```bash
curl -X POST http://localhost:5000/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'
```

**Expected Response (Success):**
```json
{
  "message": "OTP sent successfully",
  "phone": "+919876543210",
  "smsSent": true,
  "expiresIn": "5 minutes"
}
```

### 2️⃣ Verify OTP
```bash
curl -X POST http://localhost:5000/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "otp": "123456"}'
```

**Expected Response (Success):**
```json
{
  "message": "OTP verified successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-id-here",
    "phone": "+919876543210"
  }
}
```

---

## Common Errors & Solutions

### ❌ Error: "Server error"
**Cause:** Generic server error (usually from console logs)

**Solution:**
1. Check server console logs for detailed error message
2. Restart server: `npm run dev`
3. Check if database is connected

### ❌ Error: "JWT_SECRET missing"
**Cause:** `JWT_SECRET` not set in `.env` file

**Solution:**
```env
# In .env file, set a strong secret key:
JWT_SECRET=my-super-secret-key-with-at-least-32-characters-minimum
```
Then restart server: `npm run dev`

### ❌ Error: "Invalid OTP"
**Possible Causes:**
1. OTP doesn't exist in database
2. Wrong phone number format
3. Type mismatch (string vs number)

**Debug Steps:**
1. Check server console for logs: "OTP Record Found: null"
2. Verify you're using same phone number as send request
3. Try with exact format: `{"phone": "+919876543210", "otp": 123456}`

### ❌ Error: "OTP expired"
**Cause:** OTP was sent more than 5 minutes ago

**Solution:**
1. Request a new OTP via `/send` endpoint
2. OTP automatically expires after 5 minutes for security

### ❌ Error: "Phone and OTP required"
**Cause:** Missing phone or otp in request body

**Solution:**
```json
// ✅ Correct format:
{
  "phone": "+919876543210",
  "otp": 123456
}

// ❌ Wrong - missing fields or wrong type:
{
  "phone": "+919876543210"
  // otp missing!
}
```

---

## Console Log Debugging

When testing, watch your server console for detailed logs:

```
Send OTP Request: { phone: '+919876543210' }
OTP Created: { phone: '+919876543210', otp: 654321, expiresAt: ... }
SMS API Response: { status: 200, data: { ... } }

Verify OTP Request: { phone: '+919876543210', otp: 654321, otpType: 'number' }
OTP Record Found: { phone: '+919876543210', otp: 654321, expiresAt: ... }
User Found: { id: 'user-id', phone: '+919876543210' }
OTP deleted successfully
```

If you don't see these logs, the request isn't reaching the server.

---

## Checklist Before Testing

- [ ] Server is running: `npm run dev`
- [ ] Database is connected (PostgreSQL running)
- [ ] `.env` file has `JWT_SECRET` set
- [ ] SMS API credentials are valid (for SMS delivery)
- [ ] Phone number includes country code (+91 for India)
- [ ] Using correct endpoint paths
- [ ] API is returning detailed errors (NODE_ENV=development)

---

## Database Schema Requirements

Make sure your Prisma schema has OTP and User models:

```prisma
model OTP {
  id        Int     @id @default(autoincrement())
  phone     String
  otp       Int
  expiresAt DateTime
  createdAt DateTime @default(now())
  
  @@unique([phone])
}

model User {
  id        String  @id @default(cuid())
  phone     String  @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

If schema is different, run migrations:
```bash
npx prisma migrate dev --name init
```

---

## How to View Real-Time Logs

### Terminal 1: Start Server
```bash
npm run dev
```

### Terminal 2: Test API and watch logs
```bash
curl -X POST http://localhost:5000/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'
```

Watch Terminal 1 for console logs showing each step.

---

## Performance Tips

1. **OTP Cleanup** - Old OTPs are automatically deleted after verification
2. **Rate Limiting** - Consider adding rate limiting to prevent SMS spam
3. **Caching** - User lookups can be cached for faster verification

---

## Contact & Support

If issues persist:
1. Check server console for exact error message
2. Verify database connection
3. Ensure all env variables are set
4. Check Pixabits SMS API credentials

