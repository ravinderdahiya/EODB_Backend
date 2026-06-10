# 🔧 IIS Troubleshooting - समस्याओं का समाधान

## 🚨 Error 500.19 - Invalid Configuration File

### समस्या
```
HTTP Error 500.19 - Internal Server Error
The requested page cannot be accessed because the related configuration data for the page is invalid.
```

### कारण
- web.config में XML syntax error है
- iisnode module install नहीं है
- URL Rewrite module install नहीं है
- File permissions गलत हैं

### समाधान

#### ✅ Step 1: web.config को verify करें
```powershell
# XML को validate करें
[xml]$web_config = Get-Content "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\web.config"
"XML is valid!"
```

#### ✅ Step 2: IIS Modules को check करें
```
IIS Manager → Server Name → Modules
☑ URL Rewrite
☑ iisnode
☑ StaticModule
☑ DefaultDocumentModule
```

#### ✅ Step 3: Modules को install करें (अगर नहीं है)
```powershell
# iisnode
npm install -g iisnode

# URL Rewrite Module
# Download: https://www.iis.net/downloads/microsoft/url-rewrite
```

#### ✅ Step 4: IIS को restart करें
```powershell
iisreset.exe /restart
```

#### ✅ Step 5: Logs check करें
```powershell
# Detailed error log देखें
Get-Content "C:\iisnode\*.txt" -Tail 50

# या IIS में:
IIS Manager → Server Name → Failed Request Tracing
```

---

## 🚨 Error 502 - Bad Gateway

### समस्या
```
HTTP Error 502 - Bad Gateway
The server was not able to operate as a gateway to handle the request.
```

### कारण
- Node.js process crashed हो गया
- Database connected नहीं है
- .env variables missing हैं
- Port conflict है

### समाधान

#### ✅ Check 1: Process क्या error दे रहा है?
```powershell
# iisnode logs को देखें
Get-Content "C:\iisnode\*.txt" | Select-Object -Last 50

# Line में: error देखें
# Common errors:
# - "Cannot find module"
# - "ENOMEM" (memory full)
# - "ECONNREFUSED" (database)
```

#### ✅ Check 2: Database Connection
```powershell
# Terminal में database test करें
mysql -u user -p -h localhost -D eodb_db

# .env में DATABASE_URL check करें
cat .env | findstr DATABASE_URL
```

#### ✅ Check 3: Missing Dependencies
```powershell
# node_modules को reinstall करें
rm -Recurse node_modules
npm install
```

#### ✅ Check 4: .env Variables
```powershell
# सभी required variables check करें
$env_file = Get-Content "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\.env"
$env_file | Select-String -Pattern "JWT_SECRET|SESSION_SECRET|DATABASE_URL"

# अगर कोई missing है तो add करें
```

#### ✅ Check 5: Application Pool Restart करें
```powershell
$pool = Get-IISAppPool -Name "EODB_Backend"
$pool.Recycle()
# Wait 5 seconds
Start-Sleep -Seconds 5

# फिर test करें
curl http://localhost:8080/health
```

---

## 🚨 Error 404 - Not Found

### समस्या
```
HTTP 404 - Not Found
The requested URL was not found on this server.
```

### कारण
- web.config में rewrite rule गलत है
- Handler mapping missing है
- file path गलत है

### समाधान

#### ✅ Step 1: Handler Mapping check करें
```
IIS Manager → EODB_Backend → Handler Mappings

Should have:
┌──────────────────────────────────────────────┐
│ Path: src/server.js                          │
│ Module: iisnode                              │
│ Name: iisnode                                │
│ Executable: (not needed for iisnode)         │
└──────────────────────────────────────────────┘
```

#### ✅ Step 2: Handler add करें (अगर नहीं है)
```
1. Right-click site → Edit Permissions
2. Handler Mappings → Add Managed Handler
3. Request Path: src/server.js
4. Module: iisnode
5. OK
```

#### ✅ Step 3: web.config को verify करें
```xml
<!-- Correct होना चाहिए: -->
<handlers>
  <add name="iisnode" path="src/server.js" verb="*" modules="iisnode" />
</handlers>

<!-- Rewrite rule होना चाहिए: -->
<rewrite>
  <rules>
    <rule name="DynamicContent">
      <match url="^(?!iisnode).*$" />
      <action type="Rewrite" url="src/server.js" />
    </rule>
  </rules>
</rewrite>
```

---

## 🚨 Error: "No Permission to Access"

### समस्या
```
Unexpected end of file.
Access Denied
```

### कारण
- IIS को folder के लिए permission नहीं है
- node_modules को write access नहीं है
- parent folder में restriction है

### समाधान

#### ✅ Folder Permissions set करें
```powershell
# Admin PowerShell में:
$path = "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend"
$user = "IIS_IUSRS"

# Check current permissions
icacls $path

# Grant full access
icacls $path /grant "${user}:(OI)(CI)F" /T

# Verify
icacls $path
```

#### ✅ Application Pool Identity Change करें
```
IIS Manager → Application Pools → EODB_Backend
↓
Advanced Settings → Identity → ApplicationPoolIdentity
↓
या बदलकर: NetworkService (ज्यादा secure)
```

#### ✅ node_modules को specifically permission दें
```powershell
icacls "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\node_modules" `
  /grant "IIS_IUSRS:(OI)(CI)F" /T
```

#### ✅ IIS को restart करें
```powershell
iisreset.exe /restart
```

---

## 🚨 Port 8080 Already in Use

### समस्या
```
Error: listen EADDRINUSE: address already in use :::8080
```

### कारण
- कोई दूसरा process port 8080 use कर रहा है
- पुराना Node process still running है

### समाधान

#### ✅ Check किस प्रक्रिया को port use कर रहा है
```powershell
# Find process
netstat -ano | findstr :8080

# Output example:
# TCP    0.0.0.0:8080    LISTENING    12345

# Get process name
Get-Process -Id 12345
```

#### ✅ Process को kill करें
```powershell
# Method 1: Direct kill
taskkill /PID 12345 /F

# Method 2: By name
taskkill /IM node.exe /F

# Method 3: PowerShell
Stop-Process -Id 12345 -Force
```

#### ✅ Port को change करें (Alternative)
```
.env में:
PORT=8081

और web.config में:
<add key="PORT" value="8081" />

फिर IIS में binding change करें:
Site → Edit Binding → Port: 8081
```

---

## 🚨 Database Connection Error

### समस्या
```
Error: connect ECONNREFUSED 127.0.0.1:3306
PrismaClientInitializationError: Can't reach database server
```

### कारण
- MySQL server running नहीं है
- DATABASE_URL गलत है
- Firewall block कर रहा है
- Database user/password गलत है

### समाधान

#### ✅ MySQL को check करें
```powershell
# MySQL service चल रहा है?
Get-Service -Name MySQL80
Status : Running

# अगर नहीं:
Start-Service -Name MySQL80
```

#### ✅ Connection test करें
```powershell
# MySQL CLI से:
mysql -u root -p -h localhost

# या PowerShell से:
Test-NetConnection -ComputerName localhost -Port 3306
```

#### ✅ .env को verify करें
```env
# Correct format:
DATABASE_URL="mysql://username:password@localhost:3306/eodb_db"

# Check:
- Username correct है?
- Password correct है?
- Database name correct है?
- Port 3306 है?
- localhost accessible है?
```

#### ✅ Prisma migration चलाएं
```powershell
npx prisma db push
# Output में ERROR नहीं आना चाहिए
```

#### ✅ Firewall को check करें
```powershell
# Port 3306 को allow करें
New-NetFirewallRule -DisplayName "MySQL 3306" `
  -Direction Inbound -LocalPort 3306 -Protocol TCP -Action Allow
```

---

## 🚨 OTP Not Working

### समस्या
```
OTP send नहीं हो रहा है
या
OTP verify fail हो रहा है
```

### कारण
- SMS API key missing है
- Database में user नहीं बन पाया
- Rate limiting trigger हो गई
- OTP table में data नहीं है

### समाधान

#### ✅ Check SMS API Configuration
```env
SMS_API_KEY=your_api_key
SMS_SENDER_ID=your_sender_id
SMS_TEMP_DLT_ID=your_temp_id

# सभी values fill करें!
```

#### ✅ Database को check करें
```sql
-- Users table में entry है?
SELECT * FROM users WHERE mobile = '+919992676760';

-- OTP table में entry है?
SELECT * FROM otp WHERE phone = '+919992676760';
```

#### ✅ Logs को देखें
```powershell
# iisnode logs में क्या message है?
Get-Content "C:\iisnode\*.txt" | Select-String "OTP|SMS|Error" -Context 2

# Console output भी देखें
iisnode में debug mode enable करें
```

#### ✅ Rate Limiting को check करें
```env
# 5 minutes में सिर्फ 3 requests allow हैं
OTP_RATE_LIMIT_MAX=3

# अगर exceed हो गया तो:
# - 5 मिनट wait करें
# - या .env में limit बढ़ाएं
```

#### ✅ Manual test करें
```powershell
# Direct database में OTP insert करें
mysql -u root -p eodb_db

INSERT INTO otp (phone, otp, createdAt, expiresAt)
VALUES ('+919992676760', '654321', NOW(), DATE_ADD(NOW(), INTERVAL 10 MINUTE));

# फिर verify करें
curl -X POST http://localhost:8080/otp/verify-otp `
  -H "Content-Type: application/json" `
  -d '{"mobile":"9992676760", "otp":"654321"}'
```

---

## 🚨 iisnode Not Loading

### समस्या
```
Handler not found
Module iisnode not recognized
```

### कारण
- iisnode install नहीं है
- Global install का path गलत है
- IIS को iisnode का path नहीं पता

### समाधान

#### ✅ iisnode को install करें
```powershell
# Method 1: Global npm
npm install -g iisnode

# Method 2: MSI Installer
# Download: https://github.com/Azure/iisnode/releases
# Install latest version
```

#### ✅ Installation verify करें
```powershell
# Check करें iisnode कहाँ install हुआ
npm list -g iisnode

# Output should show path
```

#### ✅ IIS में manually add करें
```
1. IIS Manager खोलें
2. Server → ISAPI and CGI Restrictions
3. दिखें iisnode?

अगर नहीं:
4. + Add → Browse करके iisnode.dll find करें
   (Usually: C:\Program Files\iisnode\iisnode.dll)
```

#### ✅ web.config में path explicitly दें
```xml
<handlers>
  <add name="iisnode" 
       path="src/server.js" 
       verb="*" 
       modules="iisnode" />
</handlers>

<!-- या explicit path के साथ: -->
<add name="iisnode"
     path="src/server.js"
     verb="*"
     scriptProcessor="C:\Program Files\iisnode\iisnode.dll" />
```

---

## 📊 Logs को कैसे देखें

### Option 1: iisnode Log Files
```powershell
# सभी iisnode logs देखें
Get-ChildItem "C:\iisnode\" -Filter "*.txt" | Sort-Object LastWriteTime -Descending

# Latest log देखें
Get-Content "C:\iisnode\*.txt" -Tail 50

# Errors के लिए search करें
Get-Content "C:\iisnode\*.txt" | Select-String -Pattern "error|Error|ERROR"
```

### Option 2: IIS Logs
```powershell
# IIS logs directory
Get-ChildItem "C:\inetpub\logs\LogFiles\"

# Latest लॉग देखें
Get-Content "C:\inetpub\logs\LogFiles\W3SVC1\u_*.log" -Tail 50
```

### Option 3: Failed Request Tracing
```
IIS Manager → EODB_Backend → Failed Request Tracing Rules
→ Add Rule → Status Code 500 → OK

Logs देखें:
C:\inetpub\logs\FailedReqLogFiles\
```

### Option 4: Event Viewer
```powershell
# Windows Event Viewer खोलें
eventvwr.msc

# देखें:
Windows Logs → Application → Node.js/iisnode errors
```

---

## 🔍 Debug Mode Enable करें

### Development में (Testing के लिए)
```env
NODE_ENV=development
DEBUG=*
devErrorsEnabled=true
```

### web.config में
```xml
<iisnode
  nodeProcessCommandLine="C:\Program Files\nodejs\node.exe"
  debuggingEnabled="true"
  devErrorsEnabled="true"
  loggingEnabled="true"
  logDirectory="%SystemDrive%\iisnode"
/>
```

### फिर restart करें
```powershell
iisreset.exe /restart
```

---

## ✅ Final Verification

जब सब ठीक हो जाए तो यह check करें:

```powershell
# 1. Health endpoint
curl http://localhost:8080/health
# ✅ Should return JSON with status "ok"

# 2. Error logs empty हैं?
(Get-Content "C:\iisnode\*.txt" | Measure-Object).Count -eq 0

# 3. Database accessible है?
mysql -u root -p eodb_db -e "SELECT COUNT(*) FROM users;"

# 4. All services running हैं?
Get-Service MySQL80, W3SVC | Where-Object {$_.Status -ne "Running"} | Stop-Service
Get-Service MySQL80, W3SVC | Start-Service
```

---

## 🆘 अभी भी काम नहीं कर रहा?

1. [IIS_DEPLOYMENT_GUIDE.md](IIS_DEPLOYMENT_GUIDE.md) फिर से पढ़ें
2. सभी prerequisites install हैं?
3. Permissions सही हैं?
4. Logs में क्या error message है?
5. Team को खबर दें

**Last Updated:** May 15, 2026
