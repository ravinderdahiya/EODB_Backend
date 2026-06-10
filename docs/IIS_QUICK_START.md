# 🎯 IIS Deployment - Quick Checklist (5 मिनट में)

## ⚡ BEFORE DEPLOYMENT

### 1. Database तैयार करें
```bash
# Terminal में:
cd D:\Harsac_Project\12_May_2026_EODB\EODB_Backend
npx prisma db push
```
✅ Check: Database में tables created हैं?

### 2. Dependencies Install करें
```bash
npm install
```
✅ Check: node_modules folder बन गया?

### 3. .env File Check करें
```env
# Critical fields:
NODE_ENV=production
PORT=8080
JWT_SECRET=<32+ character secret>
SESSION_SECRET=<random secret>
DATABASE_URL=<your_mysql_url>
```
✅ Check: सभी fields filled हैं?

### 4. Locally Test करें
```bash
npm run dev
# Check: http://localhost:8080/health काम कर रहा है?
```
✅ Check: Error message नहीं आ रहा?

---

## 🏗️ IIS SETUP (One-Time)

### Step 1: IIS Enable करें
```powershell
# Admin PowerShell में एक बार चलाएं:
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer, IIS-WebServerRole, `
  IIS-CommonHttpFeatures, IIS-Rewrite, IIS-HealthAndDiagnostics, IIS-HttpCompressionStatic, `
  IIS-RequestMonitor, IIS-LoggingLibraries
```

### Step 2: Node.js Install करें
- https://nodejs.org/ से download करें
- Installation path: `C:\Program Files\nodejs\`
- ✅ Check: `node --version` काम करे?

### Step 3: iisnode Install करें
```powershell
# Admin PowerShell:
npm install -g iisnode
```
✅ Check: Installation successful?

### Step 4: URL Rewrite Module Install करें
- Download: https://www.iis.net/downloads/microsoft/url-rewrite
- या IIS में Platform Installer का use करें

✅ Check: IIS में "URL Rewrite" दिख रहा है?

---

## 🚀 DEPLOY BACKEND (हर बार)

### Step 1: Files Copy करें
```powershell
# पूरा folder copy करें या Git pull करें
cd D:\Harsac_Project\12_May_2026_EODB\EODB_Backend
git pull origin main
```

### Step 2: Dependencies Update करें
```bash
npm install
```

### Step 3: Database Migration करें
```bash
npx prisma db push
```

### Step 4: IIS में Site Create करें (पहली बार)
```
1. IIS Manager खोलें
2. Right-click "Sites" → "Add Website"
3. Settings:
   - Site Name: EODB_Backend
   - Path: D:\Harsac_Project\12_May_2026_EODB\EODB_Backend
   - Port: 8080
4. OK दबाएं
```

### Step 5: web.config Verify करें
```
✅ Check: web.config मौजूद है?
         D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\web.config
```

### Step 6: Permissions Set करें (एक बार)
```powershell
# Admin PowerShell:
$path = "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend"
icacls $path /grant "IIS_IUSRS:(OI)(CI)F" /T

# iisnode logs के लिए:
New-Item -ItemType Directory -Force -Path "C:\iisnode"
icacls "C:\iisnode" /grant "IIS_IUSRS:(OI)(CI)F" /T
```

### Step 7: IIS में Start करें
```
IIS Manager → EODB_Backend → Start
```

### Step 8: Test करें
```bash
# Browser या PowerShell में:
curl http://localhost:8080/health
# Should return: {"status":"ok","ip":"127.0.0.1"}
```

---

## ❌ अगर Error आए तो

### Error 500.19 (Invalid configuration)
```
❌ Problem: web.config में XML error है
✅ Fix: 
   1. web.config को नई file से replace करें
   2. IIS restart करें: iisreset.exe /restart
   3. File permissions check करें
```

### Error 502 (Bad Gateway)
```
❌ Problem: Node.js process क्रैश हो गया
✅ Fix:
   1. Logs check करें: C:\iisnode\*.txt
   2. .env values सही हैं?
   3. Database connected है?
   4. Application Pool restart करें
```

### No Permission Error
```
❌ Problem: IIS को folder access नहीं है
✅ Fix:
   icacls "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend" `
     /grant "IIS_IUSRS:(OI)(CI)F" /T
```

### Port 8080 Already in Use
```
❌ Problem: कोई और process port use कर रहा है
✅ Fix:
   netstat -ano | findstr :8080
   taskkill /PID <PID> /F
```

---

## 🔄 Restart Commands

```powershell
# पूरा IIS restart करें
iisreset.exe /restart

# सिर्फ EODB_Backend app pool restart करें
$pool = Get-IISAppPool -Name "EODB_Backend"
$pool.Recycle()

# Site stop/start करें
Get-IISSite -Name "EODB_Backend" | Stop-IISSite
Start-Sleep -Seconds 2
Get-IISSite -Name "EODB_Backend" | Start-IISSite
```

---

## 📋 FINAL CHECKLIST

Before going to Production:

- [ ] npm install चल गया
- [ ] npx prisma db push चल गया
- [ ] .env में सभी variables हैं
- [ ] Locally (npm run dev) काम कर रहा है
- [ ] IIS में website created है
- [ ] web.config में सही path है (src/server.js)
- [ ] Folder permissions set हैं
- [ ] C:\iisnode folder created है
- [ ] http://localhost:8080/health काम कर रहा है
- [ ] OTP API काम कर रहा है

---

## 🎉 SUCCESS!

अगर सभी checklist items ✅ हैं, तो आपका backend IIS पर production-ready है!

### Test करें:
```bash
# Health check
curl http://localhost:8080/health

# Send OTP
curl -X POST http://localhost:8080/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9992676760"}'

# Check logs
Get-Content "C:\iisnode\*.txt" -Tail 20
```

---

**Created:** May 15, 2026 | **Status:** ✅ Ready for Production
