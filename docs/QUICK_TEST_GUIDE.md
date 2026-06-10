# OTP API Test - Step by Step

## ✅ FIXED Issues:

1. **Phone Format Normalization** - Now automatically converts:
   - `9992676760` → `+919992676760`
   - `919992676760` → `+919992676760`
   - `+919992676760` → `+919992676760` (stays same)

2. **Enhanced Logging** - Console now shows exactly where the error occurs with emoji indicators:
   - 📱 = Phone number processing
   - 🔐 = OTP verification
   - 🔍 = Database search
   - 👤 = User lookup
   - 🔑 = Token generation
   - 🗑️ = Cleanup operations

3. **Better Error Messages** - No more generic "Server error", now shows actual problem

---

## 📋 Test Flow:

### Step 1: Send OTP
```bash
curl -X POST http://localhost:5000/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9992676760"}'
```

**Expected Response:**
```json
{
  "message": "OTP sent successfully",
  "phone": "+919992676760",
  "otp": 824446,
  "smsSent": true,
  "expiresIn": "5 minutes"
}
```

**Save the OTP number** from response (or check server console)

### Step 2: Verify OTP (within 5 minutes)
```bash
curl -X POST http://localhost:5000/otp/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "9992676760", "otp": "824446"}'
```

**Expected Response:**
```json
{
  "message": "OTP verified successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clv123abc...",
    "phone": "+919992676760"
  }
}
```

---

## 🐛 If Still Getting Error:

### Check Server Console Logs:
When you run `/verify-otp`, you should see something like:

```
🔐 Verify OTP Request - Raw: { phone: '9992676760', otp: '824446', otpType: 'string' }
🔐 Verify OTP Request - Normalized phone: +919992676760
🔐 Converted OTP: { original: '824446', converted: 824446 }
🔍 Searching for OTP in database...
🔍 OTP Record Found: YES ✅ (shows record details)
⏰ OTP Expiration Check - Current: 2026-04-24T12:34:56.789Z Expires: 2026-04-24T12:39:56.789Z
👤 Looking up user with phone: +919992676760
👤 User Found: YES ✅ (shows user ID)
🔑 Generating JWT Token...
🔑 JWT Token Generated Successfully
🗑️ Deleting used OTP...
🗑️ OTP deleted successfully
```

### Common Issues:

**❌ "OTP Record Found: NO"**
- This means OTP doesn't exist in database
- Solution: Make sure you sent OTP first with same phone number

**❌ "OTP expired"**
- OTP was sent more than 5 minutes ago
- Solution: Request a new OTP

**❌ "JWT_SECRET missing"**
- Environment variable not set
- Solution: Add to `.env`:
  ```env
  JWT_SECRET=my-super-secret-key-with-at-least-32-characters
  ```

**❌ Database error**
- Check PostgreSQL is running
- Verify DATABASE_URL in `.env`
- Run: `npx prisma migrate dev`

---

## 🚀 Commands to Run:

```bash
# 1. Go to backend directory
cd C:\Users\user\Ravinder_Projects\EODB_Backend

# 2. Install dependencies
npm install

# 3. Setup database
npx prisma migrate dev

# 4. Start server
npm run dev
```

---

## 📝 Your Current Request Body:
```json
{
  "phone": "9992676760",
  "otp": "824446"
}
```

✅ Now this will be normalized to: `"+919992676760"`

Test again and check server console for detailed logs!
