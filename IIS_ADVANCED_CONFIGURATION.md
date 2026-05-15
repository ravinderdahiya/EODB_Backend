# 🔧 IIS पर Node.js Backend Deployment - Advanced Configuration

## 🎯 Key Concepts

### 1. IIS Virtual Directory vs Application
```
┌─ Default Web Site
│  ├── /eodb          (Virtual Directory → React frontend)
│  └── /eodb_backend  (Application → Node.js backend) ← हम यह हैं
│
Node.js को Application के रूप में होना जरूरी है,
Virtual Directory नहीं!
```

### 2. IIS Request Flow
```
Browser Request
    ↓
https://hsac.org.in/eodb_backend/otp/send-otp
    ↓
IIS (Port 80/443)
    ↓
Route to Application Pool
    ↓
iisnode Handler (src/server.js)
    ↓
Node.js Process (PORT=8080 internally)
    ↓
Express App receives: /otp/send-otp
    (middleware strips /eodb_backend)
    ↓
Route handler processes request
    ↓
Response back to client
```

### 3. Express App का Config
```javascript
// app.js में:
app.use((req, res, next) => {
  // IIS से /eodb_backend/otp/send-otp आता है
  // हम उसे /otp/send-otp में convert करते हैं
  if (req.url.startsWith("/eodb_backend/")) {
    req.url = req.url.replace(/^\/eodb_backend/, "");
  }
  next();
});

app.use("/otp", otpRoutes);
// तो अब /otp/send-otp काम करेगा
```

---

## 🔍 Common Configuration Issues

### Issue 1: iisnode Cannot Find Node.js

**Symptom:**
```
502 Bad Gateway
Handler "iisnode" has a bad module "iisnode" in its module list
```

**Solution:**
```xml
<!-- web.config में explicit path दें: -->
<iisnode 
  nodeProcessCommandLine="C:\Program Files\nodejs\node.exe"
  watchedFiles="web.config;*.js"
/>
```

**Verify:**
```powershell
# Node.js path correct है?
Test-Path "C:\Program Files\nodejs\node.exe"
# Should return: True
```

---

### Issue 2: PORT Conflict

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::8080
```

**Solution:**
```powershell
# Check who's using port 8080
netstat -ano | findstr :8080

# Kill the process
taskkill /PID <PID> /F

# Or use different port in .env:
PORT=8081
```

---

### Issue 3: CORS Errors

**Symptom:**
```
CORS policy: The requested resource does not have the 
'Access-Control-Allow-Origin' header.
```

**Solution in web.config:**
```xml
<httpProtocol>
  <customHeaders>
    <add name="Access-Control-Allow-Origin" value="https://hsac.org.in" />
    <add name="Access-Control-Allow-Credentials" value="true" />
    <add name="Access-Control-Allow-Methods" value="GET,POST,PUT,DELETE,OPTIONS" />
    <add name="Access-Control-Allow-Headers" value="Content-Type,Authorization" />
  </customHeaders>
</httpProtocol>
```

**Or in Express (app.js):**
```javascript
import cors from "cors";

const corsOptions = {
  origin: ["https://hsac.org.in", "http://localhost:5173"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
```

---

### Issue 4: Large File Upload Error

**Symptom:**
```
413 Payload Too Large
Request entity too large
```

**Solution in web.config:**
```xml
<system.webServer>
  <security>
    <requestFiltering>
      <requestLimits maxAllowedContentLength="52428800" /> <!-- 50 MB -->
    </requestFiltering>
  </security>
</system.webServer>
```

**And in Express (app.js):**
```javascript
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
```

---

### Issue 5: Timeout Errors

**Symptom:**
```
504 Gateway Timeout
```

**Solution in web.config:**
```xml
<iisnode
  nodeProcessCommandLine="C:\Program Files\nodejs\node.exe"
  maxRequestsPerProcess="10000"
  asyncCompletionThreadCount="4"
/>
```

**And in Express (app.js):**
```javascript
// Long-running request के लिए:
app.post("/otp/send-otp", async (req, res) => {
  // Set timeout to 30 seconds
  req.setTimeout(30000);
  res.setTimeout(30000);
  
  try {
    // Your code
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 📋 Required Files in Root Directory

```
D:\inetpub\wwwroot\eodb_backend\
├── web.config              ✅ MUST HAVE
├── package.json            ✅ MUST HAVE  
├── .env                    ✅ MUST HAVE (gitignored)
├── node_modules/           ✅ Created by npm install
├── src/
│   ├── server.js           ✅ Entry point
│   ├── app.js              ✅ Express app
│   ├── config/
│   ├── middleware/
│   ├── otp/
│   ├── user/
│   └── api-url/
├── prisma/
│   └── schema.prisma
├── logs/                   (Optional)
└── README.md              (Optional)
```

---

## 🧪 Advanced Testing

### Test 1: Check iisnode Process
```powershell
# Is iisnode process running?
Get-Process | findstr node

# Output should show node.exe running
```

### Test 2: Monitor Real-Time Logs
```powershell
# Watch logs in real-time
Get-Content "C:\iisnode\eodb_backend\*.txt" -Wait -Tail 20
```

### Test 3: Test All Endpoints
```powershell
# Health
curl https://hsac.org.in/eodb_backend/health

# API Config
curl https://hsac.org.in/eodb_backend/api-url/frontend-config

# OTP Send
curl -X POST https://hsac.org.in/eodb_backend/otp/send-otp `
  -H "Content-Type: application/json" `
  -d '{"mobile":"9992676760"}'
```

### Test 4: Check Request Headers
```powershell
# Detailed request info
$response = curl -i https://hsac.org.in/eodb_backend/health
$response.Headers
```

---

## 🔐 Security Best Practices

### 1. Disable Node Version Exposure
```xml
<!-- web.config -->
<httpProtocol>
  <customHeaders>
    <add name="X-Powered-By" value="" />
    <add name="X-AspNet-Version" value="" />
    <add name="Server" value="IIS" />
  </customHeaders>
</httpProtocol>
```

### 2. Restrict Access to Sensitive Files
```xml
<system.webServer>
  <security>
    <requestFiltering>
      <hiddenSegments>
        <add segment="node_modules" />
        <add segment=".env" />
        <add segment=".git" />
        <add segment="prisma" />
      </hiddenSegments>
    </requestFiltering>
  </security>
</system.webServer>
```

### 3. HTTPS Enforcement
```xml
<system.webServer>
  <rewrite>
    <rules>
      <rule name="Enforce HTTPS">
        <match url="(.*)" />
        <conditions logicalGrouping="MatchAll">
          <add input="{HTTPS}" pattern="^OFF$" />
        </conditions>
        <action type="Redirect" url="https://{HTTP_HOST}{REQUEST_URI}" />
      </rule>
    </rules>
  </rewrite>
</system.webServer>
```

---

## 🚀 Performance Optimization

### 1. Enable Compression
```xml
<system.webServer>
  <urlCompression doStaticCompression="true" doDynamicCompression="true" />
</system.webServer>
```

### 2. Set Cache Headers
```xml
<system.webServer>
  <staticContent>
    <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAgeSeconds="31536000" />
  </staticContent>
</system.webServer>
```

### 3. Optimize Node Process Count
```xml
<iisnode 
  nodeProcessCommandLine="C:\Program Files\nodejs\node.exe"
  nodeProcessCountPerProcessor="1"
  maxRequestsPerProcess="10000"
/>
```

---

## 📊 Load Testing

```powershell
# Simple load test using Apache Bench (if installed)
ab -n 100 -c 10 https://hsac.org.in/eodb_backend/health

# Or using PowerShell
$url = "https://hsac.org.in/eodb_backend/health"
1..100 | ForEach-Object {
  Measure-Command {
    curl $url -OutFile $null
  }
}
```

---

## 🔄 Deployment Updates

### Deploy New Version
```powershell
# Step 1: Stop application
$appPool = Get-IISAppPool -Name "DefaultAppPool"
$appPool.Stop()

# Step 2: Update code
cd D:\inetpub\wwwroot\eodb_backend
git pull origin main
npm install

# Step 3: Update database if needed
npx prisma db push

# Step 4: Restart
$appPool.Start()
```

### Rollback if Issues
```powershell
# Keep backup of previous version
Copy-Item -Path "D:\inetpub\wwwroot\eodb_backend" `
          -Destination "D:\Backups\eodb_backend_backup_$(Get-Date -Format yyyyMMdd_HHmmss)" `
          -Recurse
```

---

## ✅ Deployment Verification Checklist

- [ ] web.config में `/eodb_backend` path handling है
- [ ] app.js में URL path stripping middleware है
- [ ] CORS properly configured है
- [ ] .env में सभी variables हैं
- [ ] Database connection working है
- [ ] npm install successfully completed
- [ ] node_modules में सभी dependencies हैं
- [ ] IIS में application created है (virtual directory नहीं)
- [ ] Permissions properly set हैं
- [ ] Health endpoint accessible है
- [ ] Frontend से API calls successful हैं
- [ ] HTTPS working है
- [ ] Error logs check किए

---

**Status:** ✅ Production Ready  
**Last Updated:** May 15, 2026
