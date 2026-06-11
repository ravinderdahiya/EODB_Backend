# 🚀 EODB Backend - IIS Deployment Guide

## 📋 Prerequisites (पहले Install करें)

### 1. IIS को Enable करें (Windows पर)
```powershell
# Admin PowerShell में:
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer, IIS-WebServerRole, `
  IIS-WebServerManagementTools, IIS-ASPNET, IIS-ASPNET45, IIS-CommonHttpFeatures, `
  IIS-HealthAndDiagnostics, IIS-HttpCompressionStatic, IIS-HttpLogging, IIS-LoggingLibraries, `
  IIS-RequestMonitor, IIS-Rewrite, IIS-Security
```

### 2. Node.js Install करें
- Download: https://nodejs.org/ (LTS version)
- **IMPORTANT:** Path should be: `C:\Program Files\nodejs\node.exe`

### 3. iisnode Module Install करें
```powershell
# Option 1: MSI Installer (Recommended)
# Download: https://github.com/Azure/iisnode/releases
# Install latest version

# Option 2: Command Line
npm install -g iisnode
```

### 4. URL Rewrite Module Install करें
- Download: https://www.iis.net/downloads/microsoft/url-rewrite
- या IIS में: Platform Installer → URL Rewrite Module

---

## ✅ Backend Setup करें

### Step 1: Dependencies Install करें
```bash
cd D:\Harsac_Project\12_May_2026_EODB\EODB_Backend
npm install
```

### Step 2: Database Setup करें
```bash
# Database migration चलाएं
npx prisma db push

# या seed data के लिए
node seed.js
```

### Step 3: .env File Configure करें
```env
# Must be "production" for IIS
NODE_ENV=production

# Port जो IIS use करेगा
PORT=8080

# Database
DATABASE_URL=mysql://user:password@localhost:3306/eodb_db

# Security
JWT_SECRET=your_very_long_secret_key_32_characters_minimum_here
SESSION_SECRET=another_long_random_secret_key

# Features
TRACK_USER_LOCATION=true
LOG_LOGIN_ATTEMPTS=true

# Rate Limiting
API_RATE_LIMIT_WINDOW=15
API_RATE_LIMIT_MAX=100
LOGIN_RATE_LIMIT_MAX=5
OTP_RATE_LIMIT_MAX=3
```

### Step 4: Server Port बदलें (अगर जरूरत हो)
[src/server.js](src/server.js) में check करें:
```javascript
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
```

---

## 🏗️ IIS में Site Create करें

### 1. IIS Manager खोलें
```
Start → Search → IIS Manager
```

### 2. नया Website बनाएं
```
Right-click "Sites" → "Add Website"

Field                Value
─────────────────────────────────────────────────
Site Name            EODB_Backend
Physical Path        D:\Harsac_Project\12_May_2026_EODB\EODB_Backend
Binding Type         HTTP
IP Address           All Unassigned
Port                 8080
Host Name            (blank for all)
```

### 3. Application Pool Settings
```
Application Pool Name:    EODB_Backend
.NET CLR Version:         No Managed Code
Managed Pipeline Mode:    Integrated

Identity:  ApplicationPoolIdentity
           (या NetworkService)
```

### 4. iisnode Handler Add करें
IIS Manager में site select करें:
```
⚙️ Feature: Handler Mappings → Add Managed Handler

Request Path:         src/server.js
Module:               iisnode
Name:                 iisnode
```

---

## 🔧 IIS में Permissions Set करें

### 1. Folder Permissions दें
```powershell
# Admin PowerShell:
$path = "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend"
$user = "IIS_IUSRS"  # या "NetworkService"

# Full permissions दें
icacls $path /grant "${user}:(OI)(CI)F" /T
```

### 2. node_modules के लिए
```powershell
icacls "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\node_modules" `
  /grant "IIS_IUSRS:(OI)(CI)F" /T
```

### 3. iisnode log directory create करें
```powershell
# AdminPowerShell में:
New-Item -ItemType Directory -Force -Path "C:\iisnode"
icacls "C:\iisnode" /grant "IIS_IUSRS:(OI)(CI)F" /T
```

---

## 🧪 IIS पर Test करें

### Step 1: IIS में Start करें
```
IIS Manager → EODB_Backend (site) → Start
```

### Step 2: Health Check करें
```bash
# सीधे browser में या PowerShell में:
curl http://localhost:8080/health

# Expected Response:
{
  "status": "ok",
  "ip": "127.0.0.1",
  "port": 8080
}
```

### Step 3: OTP API Test करें
```bash
# Send OTP
curl -X POST http://localhost:8080/otp/send-otp `
  -H "Content-Type: application/json" `
  -d '{"mobile": "9992676760"}'

# Expected Response:
{
  "message": "OTP sent successfully",
  "mobile": "+919992676760"
}
```

### Step 4: Verify OTP
```bash
curl -X POST http://localhost:8080/otp/verify-otp `
  -H "Content-Type: application/json" `
  -d '{"mobile": "9992676760", "otp": "123456"}'
```

---

## 🔍 Troubleshooting

### 1. Error 500.19 - Invalid configuration
```
Solution: 
✅ web.config में syntax check करें (XML valid है?)
✅ iisnode module installed है?
✅ URL Rewrite module installed है?
✅ Permissions सही हैं?
```

### 2. Error 502 - Bad Gateway
```
Solution:
✅ Node.js process crash हो गया
✅ port 8080 already in use है?
  
Check: netstat -ano | findstr :8080
Kill:  taskkill /PID <PID> /F
```

### 3. No Permission Error
```
Solution:
✅ Folder permissions दोबारा set करें:
   icacls "D:\path" /grant "IIS_IUSRS:(OI)(CI)F" /T
   
✅ Application Pool identity check करें
✅ node_modules को write access दें
```

### 4. OTP काम नहीं कर रहा
```
Solution:
✅ .env में DATABASE_URL सही है?
✅ Database accessible है?
✅ Prisma migration run हो गई?
   npx prisma db push
✅ SMS API configured है?
```

### 5. iisnode Logs देखें
```powershell
# iisnode के logs को देखें:
Get-Content "C:\iisnode\*.txt" -Tail 20

# या IIS में:
IIS Manager → EODB_Backend → iisnode
```

---

## 🚀 Production Setup

### 1. Environment बदलें
[.env](.env) में:
```env
NODE_ENV=production
devErrorsEnabled=false
DEBUG=false
```

### 2. Auto-restart Setup करें
Windows Task Scheduler में:
```
Trigger:  Daily at 2:00 AM (या reboot पर)
Action:   iisreset.exe /restart
```

### 3. Monitoring Add करें
```powershell
# Health check हर 5 मिनट
$schedule = New-JobTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepeatIndefinitely -At (Get-Date)

Register-ScheduledJob -Name "CheckEODB" -ScriptBlock {
  $response = (curl http://localhost:8080/health).StatusCode
  if ($response -ne 200) {
    # Alert या restart
  }
} -Trigger $schedule
```

### 4. Backup Setup करें
```powershell
# हर दिन backup बनाएं:
Copy-Item -Path "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend" `
  -Destination "D:\Backups\EODB_Backend_$(Get-Date -Format yyyyMMdd)" `
  -Recurse
```

---

## 📊 Deployment Checklist

- [ ] Node.js installed है (C:\Program Files\nodejs\)
- [ ] iisnode module installed है
- [ ] URL Rewrite module installed है
- [ ] IIS में website created है (port 8080)
- [ ] Folder permissions सही हैं
- [ ] .env file configured है
- [ ] Database migration run हो गई (npx prisma db push)
- [ ] node_modules installed है (npm install)
- [ ] web.config सही location पर है (EODB_Backend\ folder)
- [ ] Health endpoint काम कर रहा है (http://localhost:8080/health)
- [ ] OTP API काम कर रहा है
- [ ] Database accessible है
- [ ] Logs readable हैं (C:\iisnode\)

---

## 🎯 Quick Restart Commands

```powershell
# पूरा IIS restart करें
iisreset.exe /restart

# सिर्फ app pool restart करें
$appPool = Get-IISAppPool -Name "EODB_Backend"
$appPool.Recycle()

# Site stop/start करें
Get-IISSite -Name "EODB_Backend" | Stop-IISSite
Get-IISSite -Name "EODB_Backend" | Start-IISSite
```

---

## 🆘 Need Help?

Check these files:
- [SECURITY_AND_TRACKING_GUIDE.md](SECURITY_AND_TRACKING_GUIDE.md) - Features
- [QUICK_TEST_GUIDE.md](QUICK_TEST_GUIDE.md) - API testing
- [README_SECURITY.md](README_SECURITY.md) - Security features

---

**Last Updated:** May 15, 2026
**Status:** ✅ Production Ready
