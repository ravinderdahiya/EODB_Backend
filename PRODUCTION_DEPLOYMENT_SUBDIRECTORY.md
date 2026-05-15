# 🚀 Backend को IIS पर /eodb_backend Path पर Deploy करना

## 📋 Quick Steps

### 1️⃣ Backend Folder तैयार करें
```bash
# Create subdirectory for backend
mkdir "D:\inetpub\wwwroot\eodb_backend"

# Copy backend files वहाँ
xcopy "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\*" `
      "D:\inetpub\wwwroot\eodb_backend" /E /I

# Dependencies install करें
cd "D:\inetpub\wwwroot\eodb_backend"
npm install
```

### 2️⃣ .env Configure करें
```bash
# Copy .env file
copy "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\.env" .

# File edit करें:
```

`.env` में ये changes करें:
```env
NODE_ENV=production
PORT=8080                                # Keep same (IIS proxy करेगा)
DATABASE_URL=your_production_database    # Production DB
JWT_SECRET=your_production_secret_32_chars
SESSION_SECRET=your_production_secret
API_BASE_PATH=/eodb_backend             # 🔑 ADD THIS LINE
```

### 3️⃣ Backend Code में API_BASE_PATH Support डालें

[src/app.js](../EODB_Backend/src/app.js) में:

```javascript
// Add this near the top after imports:
const API_BASE_PATH = process.env.API_BASE_PATH || '';

// All routes को wrap करें:
// Instead of:
// app.use('/otp', otpRoutes);

// Do this:
app.use(`${API_BASE_PATH}/otp`, otpRoutes);
app.use(`${API_BASE_PATH}/user`, userRoutes);
app.use(`${API_BASE_PATH}/api-url`, apiUrlRoutes);
app.get(`${API_BASE_PATH}/health`, (req, res) => { ... });
```

### 4️⃣ IIS में Application बनाएं

```
IIS Manager खोलें
↓
Default Web Site (select करें)
↓
Right-click → Add Application
↓
Alias:                    eodb_backend
Physical Path:            D:\inetpub\wwwroot\eodb_backend
Application Pool:         DefaultAppPool (या नया बनाएँ)
OK
```

### 5️⃣ web.config को `/eodb_backend` के लिए Update करें

[D:\inetpub\wwwroot\eodb_backend\web.config] में modify करें:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    
    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- Node.js Handler                                             -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <handlers>
      <add name="iisnode" path="src/server.js" verb="*" modules="iisnode" />
      <add name="StaticFile" path="*" verb="*" modules="StaticModule" 
           resourceType="File" requireAccess="Read" />
    </handlers>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- iisnode Config                                              -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <iisnode 
      nodeProcessCommandLine="C:\Program Files\nodejs\node.exe"
      nodeProcessCountPerProcessor="1"
      enableXFF="true"
      devErrorsEnabled="false"
      loggingEnabled="true"
      logDirectory="%SystemDrive%\iisnode\eodb_backend" />

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- URL Rewrite - For /eodb_backend subdirectory                -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <rewrite>
      <rules>
        <!-- Route all requests to Node.js server -->
        <rule name="DynamicContent">
          <match url="^(?!iisnode).*$" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="src/server.js" />
        </rule>
      </rules>

      <outboundRules>
        <rule name="RemoveX-AspNet-Version" patternSyntax="Wildcard">
          <match serverVariable="RESPONSE_X_AspNet_Version" pattern=".*" />
          <action type="Rewrite" value="" />
        </rule>
      </outboundRules>
    </rewrite>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- Security Headers                                            -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <httpProtocol>
      <customHeaders>
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="DENY" />
      </customHeaders>
    </httpProtocol>

    <!-- ═══════════════════════════════════════════════════════════ -->
    <!-- CORS Headers (Frontend से requests allow करने के लिए)      -->
    <!-- ═══════════════════════════════════════════════════════════ -->
    <httpProtocol>
      <customHeaders>
        <add name="Access-Control-Allow-Origin" value="https://hsac.org.in" />
        <add name="Access-Control-Allow-Credentials" value="true" />
        <add name="Access-Control-Allow-Methods" value="GET, POST, PUT, DELETE, OPTIONS" />
        <add name="Access-Control-Allow-Headers" value="Content-Type, Authorization" />
      </customHeaders>
    </httpProtocol>

  </system.webServer>
  
  <appSettings>
    <add key="NODE_ENV" value="production" />
    <add key="PORT" value="8080" />
    <add key="API_BASE_PATH" value="/eodb_backend" />
  </appSettings>

</configuration>
```

### 6️⃣ Database Migration चलाएं
```bash
cd "D:\inetpub\wwwroot\eodb_backend"
npx prisma db push
```

### 7️⃣ iisnode Log Directory बनाएं
```powershell
New-Item -ItemType Directory -Force -Path "C:\iisnode\eodb_backend"
icacls "C:\iisnode\eodb_backend" /grant "IIS_IUSRS:(OI)(CI)F" /T
```

### 8️⃣ Permissions Set करें
```powershell
icacls "D:\inetpub\wwwroot\eodb_backend" /grant "IIS_IUSRS:(OI)(CI)F" /T
icacls "D:\inetpub\wwwroot\eodb_backend\node_modules" /grant "IIS_IUSRS:(OI)(CI)F" /T
```

### 9️⃣ IIS को Restart करें
```powershell
iisreset.exe /restart
```

### 🔟 Test करें
```bash
# Health check
curl https://hsac.org.in/eodb_backend/health

# Send OTP
curl -X POST https://hsac.org.in/eodb_backend/otp/send-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9992676760"}'
```

---

## 🔍 Troubleshooting

### Error: "Cannot find module"
```bash
# node_modules को reinstall करें
cd "D:\inetpub\wwwroot\eodb_backend"
rm -Recurse node_modules
npm install
```

### Error: 404 on /eodb_backend routes
```
1. app.js में API_BASE_PATH सही है?
2. web.config में handler sही है?
3. IIS में application created है?
4. Logs देखें: C:\iisnode\eodb_backend\*.txt
```

### Error: Database Connection Failed
```bash
# .env में DATABASE_URL correct है?
cat .env | findstr DATABASE_URL

# Database accessible है?
Test-NetConnection -ComputerName <db-host> -Port 3306
```

### Application Pool Recycle
```powershell
$appPool = Get-IISAppPool -Name "DefaultAppPool"
$appPool.Recycle()

# या specific pool:
$appPool = Get-IISApplicationPool -Name "EODB_Backend"
$appPool.Recycle()
```

---

## 📊 Architecture (Final)

```
┌─────────────────────────────────────────────┐
│     Browser                                 │
│  https://hsac.org.in/eodb                   │
└──────────────┬──────────────────────────────┘
               │
               ↓
    ┌──────────────────────────┐
    │  IIS (Default Web Site)  │
    │                          │
    │  ├── /eodb (Frontend)    │
    │  │   React App           │
    │  │                       │
    │  └── /eodb_backend       │
    │      ├── Application     │
    │      ├── src/server.js   │
    │      └── web.config      │
    │          ↓               │
    │      Node.js Express     │
    │          ↓               │
    │      MySQL Database      │
    └──────────────────────────┘
```

---

## ✅ Final Checklist

- [ ] Backend folder `/eodb_backend` create किया
- [ ] npm install चला दिया
- [ ] .env में `API_BASE_PATH=/eodb_backend` add किया
- [ ] app.js में सभी routes को `API_BASE_PATH` से prefix किया
- [ ] IIS में Application create किया (eodb_backend)
- [ ] web.config sही जगह रख दिया
- [ ] Permissions set किए
- [ ] Database migration चलाई
- [ ] IIS restart किया
- [ ] Health check काम कर रहा है
- [ ] Frontend errors solve हो गई

---

## 🎉 Success!

अब दोनों (Frontend + Backend) `hsac.org.in` पर काम कर रहे हैं:

```bash
# Frontend
https://hsac.org.in/eodb

# Backend
https://hsac.org.in/eodb_backend/health
https://hsac.org.in/eodb_backend/otp/send-otp
```

**Created:** May 15, 2026
