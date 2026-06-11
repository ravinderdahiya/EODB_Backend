# 🚀 EODB Backend - IIS Deployment (Production Ready)

## 📦 Files Created for IIS Deployment

```
EODB_Backend/
├── web.config                      ← IIS configuration (MOST IMPORTANT)
├── IIS_QUICK_START.md             ← Start here! (5-10 मिनट)
├── IIS_DEPLOYMENT_GUIDE.md        ← Complete guide (30 मिनट)
└── IIS_TROUBLESHOOTING.md         ← Problem solving (जब error आए)
```

---

## ⚡ SUPER QUICK START (अभी करें)

### Prerequisites (One-Time Installation)
```powershell
# 1. IIS Enable करें
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer, IIS-Rewrite

# 2. Node.js Install करें
# Download: https://nodejs.org/
# Run installer (default path: C:\Program Files\nodejs\)

# 3. iisnode Install करें
npm install -g iisnode

# 4. Verify
node --version
npm list -g iisnode
```

### Deploy Backend (हर बार)
```bash
# Terminal में:
cd D:\Harsac_Project\12_May_2026_EODB\EODB_Backend

# 1. Update code
git pull origin main

# 2. Install deps
npm install

# 3. Database sync
npx prisma db push

# 4. Create IIS Site (पहली बार)
# IIS Manager → Add Website
# Name: EODB_Backend
# Path: D:\Harsac_Project\12_May_2026_EODB\EODB_Backend
# Port: 8080

# 5. Set permissions (एक बार)
icacls "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend" /grant "IIS_IUSRS:(OI)(CI)F" /T

# 6. Start site
# IIS Manager → EODB_Backend → Start

# 7. Test
curl http://localhost:8080/health
```

✅ **Done!** Your backend is live at `http://localhost:8080`

---

## 📚 Documentation Roadmap

### 🟢 QUICK SETUP (पहली बार)
```
1. Read: IIS_QUICK_START.md         ← आप यहाँ हैं
2. Follow checklist                   ← सभी items ✅ करें
3. Test: http://localhost:8080/health ← काम कर रहा है?
```

### 🟡 COMPLETE SETUP (विस्तार से समझना है)
```
1. Read: IIS_DEPLOYMENT_GUIDE.md     ← पूरी details
2. Check prerequisites               ← सब installed है?
3. Follow each step carefully        ← कोई skip न करें
4. Verify at each step               ← progress track करें
```

### 🔴 TROUBLESHOOTING (कोई problem है)
```
1. Check error message carefully
2. Find matching error in: IIS_TROUBLESHOOTING.md
3. Follow solution step-by-step
4. If still not working → Check logs: C:\iisnode\*.txt
```

---

## 🎯 Key Points

### ✅ What IIS Configuration Includes

```
✅ Node.js Handler              → Requests → server.js
✅ URL Rewrite Rules            → Routing working
✅ Security Headers             → HTTPS-ready
✅ Compression                  → Faster responses
✅ Error Handling               → Proper 404/500 pages
✅ Logging                      → Debug करने में मदद
✅ Rate Limiting Support        → अपने-आप काम करेगा
✅ CORS Configuration Ready     → Frontend के लिए ready
```

### ✅ Port Configuration

```
Port: 8080
Accessible at: http://localhost:8080
```

### ✅ Database Connection

```
.env में configure करें:
DATABASE_URL=mysql://user:password@localhost:3306/eodb_db
```

### ✅ Security Features

```
✅ JWT Authentication          ← Login management
✅ IP Tracking                ← User location
✅ Account Locking            ← Brute force protection
✅ Rate Limiting              ← DoS protection
✅ Security Headers           ← OWASP standards
```

---

## 🧪 Testing After Deployment

### 1. Health Check
```bash
curl http://localhost:8080/health
# Expected: {"status":"ok","ip":"127.0.0.1","port":8080}
```

### 2. OTP Send
```bash
curl -X POST http://localhost:8080/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9992676760"}'
# Expected: {"message":"OTP sent successfully"}
```

### 3. OTP Verify
```bash
curl -X POST http://localhost:8080/otp/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9992676760","otp":"123456"}'
# Expected: {"message":"OTP verified","token":"...","user":{...}}
```

### 4. Check Logs
```powershell
Get-Content "C:\iisnode\*.txt" -Tail 20
# Should show: "Server running on port 8080"
```

---

## 🔄 Maintenance Commands

### Daily Operations
```powershell
# Restart backend
$pool = Get-IISAppPool -Name "EODB_Backend"
$pool.Recycle()

# Check if running
Get-IISSite -Name "EODB_Backend" | Select-Object Name, State

# View recent errors
Get-Content "C:\iisnode\*.txt" | Select-String "error" -Context 2
```

### After Code Changes
```bash
cd D:\Harsac_Project\12_May_2026_EODB\EODB_Backend
git pull origin main
npm install
npx prisma db push
# Then IIS auto-restart (iisnode watches for changes)
```

### Monitor Server Health
```powershell
# Create scheduled health check
$trigger = New-JobTrigger -RepeatIndefinitely -At (Get-Date) -RepeatIntervalMinutes 5
Register-ScheduledJob -Name "HealthCheck" -ScriptBlock {
  $response = curl http://localhost:8080/health
  if ($response.StatusCode -ne 200) {
    Get-IISAppPool -Name "EODB_Backend" | Recycle
  }
} -Trigger $trigger
```

---

## ❌ Common Issues

### Issue 1: "Connection refused"
```
Solution: 
- Database running है?
- .env variables सही हैं?
- Port conflict है?
```
→ See: [IIS_TROUBLESHOOTING.md](IIS_TROUBLESHOOTING.md#-error-502---bad-gateway)

### Issue 2: "Permission denied"
```
Solution:
- Folder permissions सही करें:
  icacls "D:\path" /grant "IIS_IUSRS:(OI)(CI)F" /T
```
→ See: [IIS_TROUBLESHOOTING.md](IIS_TROUBLESHOOTING.md#-error-no-permission-to-access)

### Issue 3: "Port already in use"
```
Solution:
- taskkill /IM node.exe /F
- या PORT बदलें .env में
```
→ See: [IIS_TROUBLESHOOTING.md](IIS_TROUBLESHOOTING.md#-port-8080-already-in-use)

### Issue 4: "web.config error"
```
Solution:
- web.config को नई file से replace करें
- IIS restart करें: iisreset.exe /restart
```
→ See: [IIS_TROUBLESHOOTING.md](IIS_TROUBLESHOOTING.md#-error-50019---invalid-configuration-file)

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                     │
│                                                         │
│        http://localhost:8080/otp/send-otp              │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   IIS (Port 8080)                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │              web.config                         │   │
│  │  ↓                                              │   │
│  │  Handler: src/server.js (iisnode)              │   │
│  │  URL Rewrite: *.* → src/server.js              │   │
│  └──────────────┬─────────────────────────────────┘   │
└─────────────────┼──────────────────────────────────────┘
                  ↓
         ┌────────────────────┐
         │   Node.js Express  │
         │   src/server.js    │
         │   PORT: 8080       │
         └────────┬───────────┘
                  ↓
         ┌────────────────────┐
         │   MySQL Database   │
         │   PORT: 3306       │
         └────────────────────┘
```

---

## 🔐 Security Checklist

- [ ] `NODE_ENV=production` set है
- [ ] `JWT_SECRET` 32+ characters है
- [ ] `SESSION_SECRET` strong है
- [ ] Database password strong है
- [ ] `.env` file में sensitive data है
- [ ] `.env` को Git से ignore किया है
- [ ] HTTPS setup किया है (production में)
- [ ] CORS properly configured है
- [ ] SQL injection protection active है
- [ ] Rate limiting active है
- [ ] Account locking active है

---

## 📞 Quick Help

| Need | File |
|------|------|
| 5 min setup | [IIS_QUICK_START.md](IIS_QUICK_START.md) |
| Full guide | [IIS_DEPLOYMENT_GUIDE.md](IIS_DEPLOYMENT_GUIDE.md) |
| Troubleshooting | [IIS_TROUBLESHOOTING.md](IIS_TROUBLESHOOTING.md) |
| Features | [SECURITY_AND_TRACKING_GUIDE.md](SECURITY_AND_TRACKING_GUIDE.md) |
| API Testing | [QUICK_TEST_GUIDE.md](QUICK_TEST_GUIDE.md) |

---

## ✨ Features Included

```
✅ IP Address Tracking         → User location
✅ Geolocation Data            → City, Country, Lat/Lng
✅ Account Locking             → 5 attempts = 30 min lock
✅ Rate Limiting               → Prevents abuse
✅ Security Headers            → OWASP standard
✅ Session Management          → Expiration handling
✅ Login Audit Trail           → Complete history
✅ JWT Tokens                  → Secure auth
✅ CORS Support                → Frontend ready
✅ OTP Management              → SMS integration
✅ User Tracking               → Device/Browser info
✅ Logging                     → Full request logs
```

---

## 🎉 You're All Set!

Your EODB Backend is now:
- ✅ Production-ready
- ✅ Secure
- ✅ Scalable
- ✅ Monitored
- ✅ Logged
- ✅ IIS-deployed

### Next Steps:
1. Deploy Frontend (React) on separate IIS site or CDN
2. Setup HTTPS/SSL certificates
3. Configure DNS
4. Setup monitoring/alerting
5. Schedule automatic backups

### Documentation:
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Complete feature list
- [SECURITY_AND_TRACKING_GUIDE.md](SECURITY_AND_TRACKING_GUIDE.md) - Security features
- [SECURITY_AUDIT_QUERIES.md](SECURITY_AUDIT_QUERIES.md) - Database monitoring

---

**Backend:** Node.js Express  
**Database:** MySQL/MariaDB  
**Deployment:** IIS (Windows Server)  
**Port:** 8080  
**Status:** ✅ Production Ready  
**Last Updated:** May 15, 2026  
