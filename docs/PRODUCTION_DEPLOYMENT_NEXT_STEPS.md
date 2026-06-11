# 🎯 EODB Production Deployment - Final Implementation Guide

## ✅ Current Status

### Frontend (EODB_Project)
- ✅ `.env` configured: `VITE_SERVER_BASE_URL=https://hsac.org.in/eodb_backend`
- ✅ Already deployed at: `https://hsac.org.in/eodb`
- ✅ Ready to connect to backend

### Backend (EODB_Backend)
- ⏳ **Needs to be deployed** at: `https://hsac.org.in/eodb_backend`
- 📍 Currently only on: `localhost:8080` (IIS local)

---

## 🚀 What To Do Now

### Problem
Frontend tries to call backend at `https://hsac.org.in/eodb_backend` but:
- ❌ Backend API endpoints return 404
- ❌ `GET https://hsac.org.in/api-url/frontend-config` - 404
- ❌ `POST https://hsac.org.in/otp/send-otp` - 404

### Solution
Deploy backend to same domain: `https://hsac.org.in/eodb_backend`

---

## 📋 Deployment Steps (Copy-Paste Ready)

### Step 1: Copy Backend Files (5 min)
```powershell
# Admin PowerShell:
New-Item -ItemType Directory -Path "D:\inetpub\wwwroot\eodb_backend" -Force

Copy-Item "D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\*" `
  -Destination "D:\inetpub\wwwroot\eodb_backend" `
  -Recurse -Force -Exclude node_modules

cd D:\inetpub\wwwroot\eodb_backend
```

### Step 2: Install Dependencies (3 min)
```bash
npm install
```

### Step 3: Configure .env (2 min)
```
Edit: D:\inetpub\wwwroot\eodb_backend\.env

Must have:
NODE_ENV=production
DATABASE_URL=mysql://user:password@localhost:3306/eodb_db
JWT_SECRET=<32+ character secret>
SESSION_SECRET=<32+ character secret>
```

### Step 4: Setup Database (2 min)
```bash
cd D:\inetpub\wwwroot\eodb_backend
npx prisma db push
```

### Step 5: Create IIS Application (3 min)
```
IIS Manager:
1. Default Web Site (select)
2. Right-click → Add Application
3. Alias: eodb_backend
4. Physical Path: D:\inetpub\wwwroot\eodb_backend
5. OK
```

### Step 6: Set Permissions (2 min)
```powershell
icacls "D:\inetpub\wwwroot\eodb_backend" /grant "IIS_IUSRS:(OI)(CI)F" /T
icacls "D:\inetpub\wwwroot\eodb_backend\node_modules" /grant "IIS_IUSRS:(OI)(CI)F" /T

New-Item -ItemType Directory -Path "C:\iisnode\eodb_backend" -Force
icacls "C:\iisnode\eodb_backend" /grant "IIS_IUSRS:(OI)(CI)F" /T
```

### Step 7: Restart IIS (1 min)
```powershell
iisreset.exe /restart
```

### Step 8: Test (2 min)
```powershell
# Health check
curl https://hsac.org.in/eodb_backend/health

# Should return:
# {"status":"OK","timestamp":"2026-05-15T..."}
```

---

## 📚 Help Files Created

All in `D:\Harsac_Project\12_May_2026_EODB\EODB_Backend\`:

| File | Purpose | Read When |
|------|---------|-----------|
| **PRODUCTION_DEPLOYMENT_CHECKLIST.md** | Step-by-step deployment | ⭐ **START HERE** (30 min) |
| **PRODUCTION_DEPLOYMENT_SUBDIRECTORY.md** | Detailed subdirectory deployment | For details |
| **IIS_ADVANCED_CONFIGURATION.md** | Advanced topics & troubleshooting | If issues arise |
| **IIS_README.md** | Overview | Quick reference |
| **IIS_DEPLOYMENT_GUIDE.md** | Complete guide | For understanding |
| **IIS_QUICK_START.md** | Abbreviated guide | Refresh memory |
| **IIS_TROUBLESHOOTING.md** | Problem solving | If something breaks |

---

## ✅ Verification After Deployment

### Test 1: Backend Health
```bash
curl https://hsac.org.in/eodb_backend/health
```
Expected: `{"status":"OK"}`

### Test 2: Frontend Integration
```
1. Open: https://hsac.org.in/eodb
2. Go to Login
3. Enter phone number
4. Click "Send OTP"
5. Check browser console for errors
   - Should see NO 404 errors
   - Should see "OTP sent successfully"
```

### Test 3: Check Browser Console
```
Browser → F12 → Console → Network tab

Should show:
✅ GET https://hsac.org.in/eodb_backend/api-url/frontend-config 200
✅ POST https://hsac.org.in/eodb_backend/otp/send-otp 200

Should NOT show:
❌ 404 errors
❌ CORS errors
```

---

## 🎯 Expected Behavior After Deployment

### Before (Current - Error)
```
Browser → https://hsac.org.in/eodb/
  ↓
JavaScript calls: https://hsac.org.in/api-url/frontend-config
  ↓
404 Not Found ❌
```

### After (Correct)
```
Browser → https://hsac.org.in/eodb/
  ↓
JavaScript calls: https://hsac.org.in/eodb_backend/api-url/frontend-config
  ↓
200 OK ✅
  ↓
Configuration loaded successfully
  ↓
User can login and send OTP
```

---

## 🔧 If Something Goes Wrong

### Error: 404 on API endpoints
```
1. Check if IIS application created: Default Web Site → eodb_backend
2. Check web.config present: D:\inetpub\wwwroot\eodb_backend\web.config
3. Check logs: Get-Content "C:\iisnode\eodb_backend\*.txt" -Tail 20
```

### Error: 502 Bad Gateway
```
1. Check if npm install done: D:\inetpub\wwwroot\eodb_backend\node_modules exists?
2. Check .env variables all set
3. Check database connection
4. Check logs for errors
```

### Error: Permission Denied
```
Run permissions again:
icacls "D:\inetpub\wwwroot\eodb_backend" /grant "IIS_IUSRS:(OI)(CI)F" /T
icacls "D:\inetpub\wwwroot\eodb_backend\node_modules" /grant "IIS_IUSRS:(OI)(CI)F" /T
```

---

## 📊 Architecture After Deployment

```
┌──────────────────────────────────────────────────────────┐
│                  Browser                                 │
│              https://hsac.org.in                         │
└────────────────────┬─────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ↓                         ↓
┌──────────────┐        ┌─────────────────┐
│  Frontend    │        │  Backend        │
│  /eodb       │        │  /eodb_backend  │
│  (Vite)      │────→   │  (Node.js)      │
│              │        │  (IIS + iisnode)│
└──────────────┘        └────────┬────────┘
                                 ↓
                        ┌────────────────┐
                        │  MySQL DB      │
                        │  (Production)  │
                        └────────────────┘
```

---

## ✨ Success Indicators

You'll know it's working when:

- ✅ `https://hsac.org.in/eodb/` loads frontend
- ✅ Click "Send OTP" → OTP sends successfully
- ✅ Enter OTP → Login works
- ✅ No 404 errors in browser console
- ✅ No CORS errors
- ✅ User data saved in database
- ✅ Location tracking working
- ✅ Rate limiting working

---

## 🎯 Next Steps

### Immediate (Today)
1. Read: [PRODUCTION_DEPLOYMENT_CHECKLIST.md](PRODUCTION_DEPLOYMENT_CHECKLIST.md)
2. Follow all steps
3. Test everything

### Short Term (This Week)
- [ ] Monitor logs for 24 hours
- [ ] Test with real users
- [ ] Verify database backups

### Long Term (Next Month)
- [ ] Setup automated monitoring
- [ ] Setup daily backups
- [ ] Setup SSL certificate renewal
- [ ] Performance optimization

---

## 📞 Documentation Map

```
📍 START HERE
    ↓
PRODUCTION_DEPLOYMENT_CHECKLIST.md (30 min)
    ↓
    ├─→ Working? YES  → Done! ✅
    │
    └─→ Issues? YES   → IIS_TROUBLESHOOTING.md
                       → IIS_ADVANCED_CONFIGURATION.md
                       → Check logs: C:\iisnode\eodb_backend\
```

---

## 🚨 Critical Files Checklist

Before deployment, ensure you have:

```
✅ D:\inetpub\wwwroot\eodb_backend\web.config
✅ D:\inetpub\wwwroot\eodb_backend\.env
✅ D:\inetpub\wwwroot\eodb_backend\src\app.js
✅ D:\inetpub\wwwroot\eodb_backend\src\server.js
✅ D:\inetpub\wwwroot\eodb_backend\package.json
✅ D:\inetpub\wwwroot\eodb_backend\prisma\schema.prisma
✅ C:\Program Files\nodejs\node.exe (Node.js installed)
```

---

## 🎉 Ready?

### Follow This Sequence:
1. **First time?** → Read `PRODUCTION_DEPLOYMENT_CHECKLIST.md`
2. **Got error?** → Check `IIS_TROUBLESHOOTING.md`
3. **Need details?** → Read `PRODUCTION_DEPLOYMENT_SUBDIRECTORY.md`
4. **Advanced config?** → See `IIS_ADVANCED_CONFIGURATION.md`

---

**Backend Deployment Estimated Time:** 30 minutes  
**Expected Status:** ✅ Production Ready  
**Last Updated:** May 15, 2026

Good luck! 🚀
