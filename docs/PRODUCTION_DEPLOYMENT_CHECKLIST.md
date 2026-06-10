# ✅ Production Deployment Checklist - Backend को /eodb_backend पर Deploy करना

## 🚀 Quick Deployment (30 मिनट)

### Phase 1: Setup (5 मिनट)

```powershell
# Admin PowerShell खोलें

# Step 1: Folder बनाएं
New-Item -ItemType Directory -Path "D:\inetpub\wwwroot\eodb_backend" -Force
cd D:\inetpub\wwwroot\eodb_backend

# Step 2: Backend files copy करें
Copy-Item "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\*" -Destination . -Recurse -Force -Exclude node_modules
```

✅ **Verify:** 
- [ ] Folder बन गया: `D:\inetpub\wwwroot\eodb_backend`
- [ ] Files copy हो गई

---

### Phase 2: Code Preparation (5 मिनट)

```bash
# Terminal में:
cd D:\inetpub\wwwroot\eodb_backend

# Step 3: Dependencies install करें
npm install

# Step 4: .env configure करें
# .env file को production settings से update करें:
```

**Update करें [.env](.env):**
```env
NODE_ENV=production
PORT=8080
DATABASE_URL=mysql://user:password@localhost:3306/eodb_db
JWT_SECRET=your_32_character_minimum_secret_here
SESSION_SECRET=your_32_character_minimum_secret_here
SMS_API_KEY=your_sms_api_key
SMS_SENDER_ID=your_sender_id
SMS_TEMP_DLT_ID=your_temp_id
```

✅ **Verify:**
- [ ] npm install completed successfully
- [ ] .env में सभी required variables हैं

---

### Phase 3: Database Setup (5 मिनट)

```bash
# Terminal में:
cd D:\inetpub\wwwroot\eodb_backend

# Step 5: Database migration चलाएं
npx prisma db push
```

✅ **Verify:**
- [ ] Migration successful (no errors)
- [ ] Database tables created

---

### Phase 4: IIS Configuration (10 मिनट)

#### A. IIS में Application बनाएं

```
Start → IIS Manager (inetmgr)
  ↓
Default Web Site (left panel में select करें)
  ↓
Right-click → "Add Application"
  ↓
┌────────────────────────────────────────────┐
│ Alias:              eodb_backend           │
│ Physical Path:      D:\inetpub\wwwroot\... │ 
│ Application Pool:   DefaultAppPool         │
└────────────────────────────────────────────┘
  ↓
OK
```

✅ **Verify:**
- [ ] Application "eodb_backend" create हो गया
- [ ] Default Web Site के under दिख रहा है

---

#### B. Permissions Set करें

```powershell
# Admin PowerShell में:

# Step 6: IIS को folder access दें
icacls "D:\inetpub\wwwroot\eodb_backend" /grant "IIS_IUSRS:(OI)(CI)F" /T

# Step 7: node_modules को specifically allow करें
icacls "D:\inetpub\wwwroot\eodb_backend\node_modules" /grant "IIS_IUSRS:(OI)(CI)F" /T

# Step 8: iisnode log folder बनाएं
New-Item -ItemType Directory -Path "C:\iisnode\eodb_backend" -Force
icacls "C:\iisnode\eodb_backend" /grant "IIS_IUSRS:(OI)(CI)F" /T
```

✅ **Verify:**
- [ ] Permissions commands executed without errors
- [ ] C:\iisnode\eodb_backend folder बन गया

---

#### C. web.config Verify करें

✅ **Check:**
- [ ] `D:\inetpub\wwwroot\eodb_backend\web.config` मौजूद है
- [ ] File में `<handlers>` section है
- [ ] iisnode handler configure है

---

### Phase 5: Startup (5 मिनट)

```powershell
# IIS को restart करें
iisreset.exe /restart

# Wait 10 seconds
Start-Sleep -Seconds 10
```

✅ **Verify:**
- [ ] iisreset successfully completed

---

### Phase 6: Testing (5 मिनट)

#### Test 1: Health Check
```powershell
curl https://hsac.org.in/eodb_backend/health

# Expected Response:
# {
#   "status": "OK",
#   "timestamp": "2026-05-15T..."
# }
```

✅ **Check:**
- [ ] Status code 200
- [ ] Response: {"status":"OK"}

---

#### Test 2: Frontend से API Call
```
1. Browser खोलें: https://hsac.org.in/eodb
2. Login page खोलें
3. Mobile number enter करें
4. "Send OTP" दबाएं
5. OTP successfully send होना चाहिए
```

✅ **Check:**
- [ ] No 404 errors in browser console
- [ ] OTP request successful

---

#### Test 3: Direct OTP Test
```powershell
$body = @{
  mobile = "9992676760"
} | ConvertTo-Json

curl -X POST https://hsac.org.in/eodb_backend/otp/send-otp `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body

# Expected: {"message":"OTP sent successfully"} or similar
```

✅ **Check:**
- [ ] Status code 200
- [ ] Message: "OTP sent successfully"

---

#### Test 4: Verify OTP
```powershell
# Check console logs or database for actual OTP

$body = @{
  mobile = "9992676760"
  otp = "123456"  # Replace with actual OTP
} | ConvertTo-Json

curl -X POST https://hsac.org.in/eodb_backend/otp/verify-otp `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body

# Expected: {"message":"OTP verified","token":"...","user":{...}}
```

✅ **Check:**
- [ ] Status code 200
- [ ] Token returned

---

### Phase 7: Monitoring & Logs (2 मिनट)

```powershell
# Check iisnode logs
Get-Content "C:\iisnode\eodb_backend\*.txt" | Select-Object -Last 20

# Should show:
# - No error messages
# - "Server running on port 8080"
# - Request logs
```

✅ **Verify:**
- [ ] No errors in logs
- [ ] Server started successfully message

---

## 🎯 Final Checklist - सब कुछ Done?

**Setup:**
- [ ] Backend folder बन गया: `D:\inetpub\wwwroot\eodb_backend`
- [ ] Files copy हो गई

**Dependencies:**
- [ ] npm install successfully completed
- [ ] node_modules folder बन गया

**Configuration:**
- [ ] .env सभी required variables के साथ configured है
- [ ] Database connection working है

**Database:**
- [ ] `npx prisma db push` successfully run हुआ
- [ ] Database tables created हैं

**IIS:**
- [ ] "eodb_backend" application created है
- [ ] Permissions properly set हैं

**Deployment:**
- [ ] `iisreset.exe /restart` चल गया
- [ ] Health check working है

**Testing:**
- [ ] Health endpoint काम कर रहा है
- [ ] OTP send काम कर रहा है
- [ ] Frontend से API calls successful हैं
- [ ] Browser console में कोई 404 नहीं है

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| 404 on `/eodb_backend` | Check: IIS application created, web.config present, app.js has route prefix logic |
| 502 Bad Gateway | Check: npm install done, .env variables correct, database accessible |
| "No Permission" | Run: `icacls "D:\inetpub\wwwroot\eodb_backend" /grant "IIS_IUSRS:(OI)(CI)F" /T` |
| Database Error | Check: DATABASE_URL in .env, MySQL running, credentials correct |
| OTP Not Working | Check: SMS_API_KEY configured, database has users table |

---

## 📊 After Deployment

### Health Monitoring
```powershell
# Every 5 minutes, check if backend is healthy
$trigger = New-JobTrigger -RepeatIndefinitely -RepeatIntervalMinutes 5 -At (Get-Date)
Register-ScheduledJob -Name "HealthCheck" -ScriptBlock {
  $health = curl https://hsac.org.in/eodb_backend/health -ErrorAction SilentlyContinue
  if ($health.status -ne "OK") {
    # Alert or restart
    iisreset.exe /restart
  }
} -Trigger $trigger
```

### View Logs
```powershell
# Real-time log monitoring
Get-Content "C:\iisnode\eodb_backend\*.txt" -Wait -Tail 10
```

---

## ✨ Success!

अब आपका backend production पर ready है:

```
✅ Frontend:  https://hsac.org.in/eodb
✅ Backend:   https://hsac.org.in/eodb_backend
✅ Health:    https://hsac.org.in/eodb_backend/health
✅ OTP:       https://hsac.org.in/eodb_backend/otp/send-otp
```

---

**Deployment Date:** May 15, 2026
**Status:** ✅ Production Ready
