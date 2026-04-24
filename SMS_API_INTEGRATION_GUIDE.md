# SMS API Integration Guide - EODB Backend

## Overview
Successfully integrated **Pixabits SMS API** into the EODB Backend OTP system. The SMS API automatically sends OTPs to users' phone numbers.

---

## Changes Made

### 1. **Updated Package Dependencies**
- ✅ Added `axios` for making SMS API HTTP requests
- Command: `npm install axios`

### 2. **Updated OTP Controller** ([src/otp/otp.controller.js](src/otp/otp.controller.js))
- Added imports: `axios`, `jwt`, `dotenv`
- Enhanced `sendOtp()` function with SMS API integration
- Automatic SMS sending when OTP is created
- Graceful error handling (OTP saved even if SMS fails)

### 3. **Environment Configuration** ([.env](.env))
Added SMS API credentials:
```env
JWT_SECRET=your_jwt_secret_key_here

# SMS API Configuration (Pixabits)
SMS_API_KEY=eyJhbGciOiJIUzI1NiJ9...
SMS_SENDER_ID=EODB
SMS_TEMP_DLT_ID=1407169838783023275
```

---

## How It Works

### OTP Send Flow:
```
1. User requests OTP with phone number
2. OTP is generated (6-digit random number)
3. OTP stored in database with 5-minute expiration
4. SMS API sends OTP to user's phone via Pixabits
5. Response includes SMS delivery status
```

### API Response Examples:

**Success (SMS sent):**
```json
{
  "message": "OTP sent successfully",
  "phone": "+919876543210",
  "smsSent": true
}
```

**Success (OTP saved, SMS failed):**
```json
{
  "message": "OTP created (SMS delivery pending)",
  "phone": "+919876543210",
  "smsSent": false,
  "warning": "OTP saved but SMS delivery failed"
}
```

---

## Configuration

### Update Environment Variables
Edit `.env` file with your SMS API credentials:

```env
# Required for JWT authentication
JWT_SECRET=your-secure-secret-key-min-32-chars

# SMS API credentials from Pixabits
SMS_API_KEY=your_pixabits_api_key_here
SMS_SENDER_ID=Your_Sender_ID (EODB)
SMS_TEMP_DLT_ID=Your_DLT_template_ID_here
```

### Get Pixabits SMS API Credentials:
1. Go to [Pixabits.in](https://sms.pixabits.in/)
2. Register/Login to your account
3. Navigate to API Settings
4. Copy your API Key, Sender ID, and DLT Template ID
5. Update `.env` file with these values

---

## Testing

### Test OTP Send:
```bash
curl -X POST http://localhost:5000/otp/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210"}'
```

### Test OTP Verify:
```bash
curl -X POST http://localhost:5000/otp/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "+919876543210", "otp": "123456"}'
```

---

## Error Handling

### Common Issues:

| Issue | Solution |
|-------|----------|
| SMS not sending | Check SMS API credentials in `.env` |
| OTP expired | OTP expires after 5 minutes |
| Invalid phone format | Ensure phone includes country code (+91 for India) |
| SMS API rate limit | Add rate limiting or check Pixabits limits |

---

## File References

- **Controller**: [src/otp/otp.controller.js](src/otp/otp.controller.js)
- **Configuration**: [.env](.env)
- **Package Manager**: [package.json](package.json)

---

## Next Steps

1. ✅ Update `.env` with your Pixabits API credentials
2. ✅ Restart the server: `npm run dev`
3. ✅ Test OTP sending with a real phone number
4. ✅ Monitor logs for SMS delivery status

---

## Support

For Pixabits API documentation, visit: [Pixabits SMS API Docs](https://sms.pixabits.in/)

For any integration issues, check the console logs for detailed error messages.
