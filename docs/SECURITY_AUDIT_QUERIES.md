# 📊 SQL Queries for Security Monitoring & Audit

## 🔍 View Recent Login Sessions

### All Login Sessions (Last 24 hours)
```sql
SELECT 
  ls.id as session_id,
  u.id,
  u.mobile,
  u.fullname,
  ls.ipAddress,
  ls.latitude,
  ls.longitude,
  ls.city,
  ls.country,
  ls.status,
  ls.loginAt,
  ls.expiresAt,
  (ls.expiresAt - CURRENT_TIMESTAMP) as time_remaining
FROM login_sessions ls
JOIN users u ON ls.userId = u.id
WHERE ls.loginAt >= NOW() - INTERVAL '24 hours'
ORDER BY ls.loginAt DESC;
```

### Active Sessions
```sql
SELECT 
  ls.id,
  u.mobile,
  u.email,
  ls.ipAddress,
  ls.city,
  ls.country,
  ls.loginAt,
  (ls.expiresAt - CURRENT_TIMESTAMP) as expires_in
FROM login_sessions ls
JOIN users u ON ls.userId = u.id
WHERE ls.status = 'active' 
  AND ls.expiresAt > CURRENT_TIMESTAMP
ORDER BY ls.loginAt DESC;
```

### Sessions by City
```sql
SELECT 
  ls.city,
  ls.country,
  COUNT(*) as login_count,
  COUNT(DISTINCT u.id) as unique_users
FROM login_sessions ls
JOIN users u ON ls.userId = u.id
WHERE ls.loginAt >= NOW() - INTERVAL '7 days'
GROUP BY ls.city, ls.country
ORDER BY login_count DESC;
```

---

## ⚠️ Security Monitoring

### Users with Failed Login Attempts
```sql
SELECT 
  id,
  mobile,
  fullname,
  email,
  loginAttempts,
  isLocked,
  lockedUntil,
  lastLoginAt,
  lastLoginIp,
  CASE 
    WHEN isLocked THEN 'LOCKED'
    WHEN loginAttempts > 0 THEN 'WARNING'
    ELSE 'SAFE'
  END as status
FROM users
WHERE loginAttempts > 0
ORDER BY loginAttempts DESC;
```

### Currently Locked Accounts
```sql
SELECT 
  id,
  mobile,
  fullname,
  loginAttempts,
  lockedUntil,
  EXTRACT(EPOCH FROM (lockedUntil - CURRENT_TIMESTAMP)) / 60 as minutes_locked,
  CASE 
    WHEN lockedUntil > CURRENT_TIMESTAMP THEN 'ACTIVE LOCK'
    ELSE 'EXPIRED LOCK (should be unlocked)'
  END as lock_status
FROM users
WHERE isLocked = true
ORDER BY lockedUntil DESC;
```

### Suspicious Activities (Multiple Failed Attempts)
```sql
SELECT 
  u.id,
  u.mobile,
  u.fullname,
  u.email,
  u.loginAttempts,
  u.isLocked,
  u.lastLoginIp,
  u.lastLoginAt,
  COUNT(DISTINCT ls.ipAddress) as unique_ips_last_7days,
  STRING_AGG(DISTINCT ls.city, ', ') as cities_accessed_from
FROM users u
LEFT JOIN login_sessions ls ON u.id = ls.userId 
  AND ls.loginAt >= NOW() - INTERVAL '7 days'
WHERE u.loginAttempts >= 3 OR u.isLocked = true
GROUP BY u.id, u.mobile, u.fullname, u.email, u.loginAttempts, 
         u.isLocked, u.lastLoginIp, u.lastLoginAt
ORDER BY u.loginAttempts DESC;
```

---

## 📍 Geographic Analysis

### Login Distribution by Country
```sql
SELECT 
  ls.country,
  COUNT(*) as total_logins,
  COUNT(DISTINCT ls.userId) as unique_users,
  STRING_AGG(DISTINCT ls.city, ', ') as cities,
  MIN(ls.loginAt) as first_login,
  MAX(ls.loginAt) as last_login
FROM login_sessions ls
GROUP BY ls.country
ORDER BY total_logins DESC;
```

### Unusual Geographic Access
```sql
SELECT 
  u.id,
  u.mobile,
  u.fullname,
  STRING_AGG(DISTINCT ls.city || ', ' || ls.country, ' | ') as locations,
  COUNT(DISTINCT ls.city) as unique_cities,
  COUNT(DISTINCT ls.country) as unique_countries,
  COUNT(*) as total_logins
FROM users u
JOIN login_sessions ls ON u.id = ls.userId
  AND ls.loginAt >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.mobile, u.fullname
HAVING COUNT(DISTINCT ls.country) > 1  -- Logged in from multiple countries
ORDER BY unique_countries DESC;
```

---

## 🕐 Time-Based Analysis

### Logins by Hour of Day
```sql
SELECT 
  EXTRACT(HOUR FROM ls.loginAt) as hour,
  COUNT(*) as login_count,
  COUNT(DISTINCT ls.userId) as unique_users,
  STRING_AGG(DISTINCT ls.city, ', ') as cities
FROM login_sessions ls
WHERE ls.loginAt >= NOW() - INTERVAL '7 days'
GROUP BY EXTRACT(HOUR FROM ls.loginAt)
ORDER BY hour;
```

### Peak Login Times
```sql
SELECT 
  DATE_TRUNC('hour', ls.loginAt) as hour_slot,
  COUNT(*) as login_count,
  COUNT(DISTINCT ls.userId) as unique_users
FROM login_sessions ls
WHERE ls.loginAt >= NOW() - INTERVAL '1 day'
GROUP BY DATE_TRUNC('hour', ls.loginAt)
ORDER BY login_count DESC
LIMIT 10;
```

---

## 🔐 User Activity Timeline

### User's Complete Login History
```sql
SELECT 
  ls.id,
  ls.loginAt,
  ls.ipAddress,
  ls.latitude,
  ls.longitude,
  ls.city,
  ls.country,
  ls.status,
  (ls.expiresAt - CURRENT_TIMESTAMP) as remaining_time
FROM login_sessions ls
WHERE ls.userId = :userId  -- Replace :userId with actual user ID
ORDER BY ls.loginAt DESC;
```

### User's Failed Attempts History
```sql
SELECT 
  u.id,
  u.mobile,
  u.loginAttempts,
  u.lastLoginAt,
  u.lastLoginIp,
  u.lastLoginLat,
  u.lastLoginLng,
  u.isLocked,
  u.lockedUntil,
  CASE 
    WHEN u.isLocked AND u.lockedUntil > CURRENT_TIMESTAMP 
      THEN 'LOCKED: ' || (EXTRACT(EPOCH FROM (u.lockedUntil - CURRENT_TIMESTAMP))/60)::INT || ' min'
    WHEN u.loginAttempts > 0 
      THEN 'ATTEMPTS: ' || u.loginAttempts || '/5'
    ELSE 'OK'
  END as security_status
FROM users u
WHERE u.id = :userId;  -- Replace :userId with actual user ID
```

---

## 🔄 Session Management

### Revoke User Sessions
```sql
UPDATE login_sessions
SET status = 'revoked', revokedAt = CURRENT_TIMESTAMP
WHERE userId = :userId AND status = 'active';
```

### Clear All Expired Sessions
```sql
DELETE FROM login_sessions
WHERE expiresAt < CURRENT_TIMESTAMP
  OR status IN ('revoked', 'expired');
```

### Keep Only Last N Sessions Per User
```sql
DELETE FROM login_sessions
WHERE id IN (
  SELECT id FROM login_sessions ls1
  WHERE (
    SELECT COUNT(*) FROM login_sessions ls2 
    WHERE ls2.userId = ls1.userId 
      AND ls2.loginAt >= ls1.loginAt
  ) > 5  -- Keep last 5 sessions
);
```

---

## 📈 Security Metrics

### Daily Statistics
```sql
SELECT 
  DATE(ls.loginAt) as date,
  COUNT(*) as total_logins,
  COUNT(DISTINCT ls.userId) as unique_users,
  COUNT(DISTINCT ls.ipAddress) as unique_ips,
  COUNT(DISTINCT ls.country) as countries_accessed,
  SUM(CASE WHEN ls.status = 'active' THEN 1 ELSE 0 END) as active_sessions,
  SUM(CASE WHEN ls.status = 'revoked' THEN 1 ELSE 0 END) as revoked_sessions
FROM login_sessions ls
GROUP BY DATE(ls.loginAt)
ORDER BY date DESC
LIMIT 30;
```

### Account Security Summary
```sql
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN isLocked THEN 1 END) as locked_users,
  COUNT(CASE WHEN loginAttempts > 0 THEN 1 END) as users_with_failures,
  COUNT(CASE WHEN isLocked AND lockedUntil > CURRENT_TIMESTAMP THEN 1 END) as currently_locked,
  COUNT(CASE WHEN isLocked AND lockedUntil <= CURRENT_TIMESTAMP THEN 1 END) as expired_locks
FROM users;
```

---

## 🚨 Alert Queries

### Brute Force Detection (5+ attempts in 1 hour)
```sql
SELECT 
  u.id,
  u.mobile,
  COUNT(*) as attempts_in_hour,
  MIN(ls.loginAt) as first_attempt,
  MAX(ls.loginAt) as last_attempt,
  STRING_AGG(DISTINCT ls.ipAddress, ', ') as ips_used
FROM login_sessions ls
JOIN users u ON ls.userId = u.id
WHERE ls.loginAt >= NOW() - INTERVAL '1 hour'
  AND ls.status = 'active'
GROUP BY u.id, u.mobile
HAVING COUNT(*) >= 5
ORDER BY attempts_in_hour DESC;
```

### New IP Address (First Time Login from IP)
```sql
SELECT 
  ls.id,
  u.mobile,
  u.fullname,
  ls.ipAddress,
  ls.city,
  ls.country,
  ls.loginAt,
  COUNT(DISTINCT ls2.ipAddress) as previous_ips
FROM login_sessions ls
JOIN users u ON ls.userId = u.id
LEFT JOIN login_sessions ls2 ON u.id = ls2.userId 
  AND ls2.loginAt < ls.loginAt
GROUP BY ls.id, u.mobile, u.fullname, ls.ipAddress, ls.city, ls.country, ls.loginAt
HAVING COUNT(CASE WHEN ls2.ipAddress = ls.ipAddress THEN 1 END) = 0
ORDER BY ls.loginAt DESC
LIMIT 20;
```

---

## 🧹 Maintenance Queries

### Archive Old Sessions (Move to archive table)
```sql
-- First create archive table if doesn't exist
CREATE TABLE login_sessions_archive AS
SELECT * FROM login_sessions
WHERE loginAt < NOW() - INTERVAL '90 days';

-- Then delete from main table
DELETE FROM login_sessions
WHERE loginAt < NOW() - INTERVAL '90 days';
```

### Unlock All Expired Locks
```sql
UPDATE users
SET isLocked = false, lockedUntil = NULL
WHERE isLocked = true 
  AND lockedUntil <= CURRENT_TIMESTAMP;
```

### Reset Failed Attempts (Older than 24 hours)
```sql
UPDATE users
SET loginAttempts = 0
WHERE loginAttempts > 0 
  AND lastLoginAt < NOW() - INTERVAL '24 hours';
```

---

## 💾 Backup & Export

### Export Login Sessions to CSV
```bash
psql -U postgres -d eodb_db -c "\COPY login_sessions TO STDOUT WITH CSV HEADER" > login_sessions_export.csv
```

### Export Security Events
```sql
SELECT 
  ls.loginAt as timestamp,
  u.mobile,
  'LOGIN' as event_type,
  ls.ipAddress,
  ls.city,
  'Success' as status
FROM login_sessions ls
JOIN users u ON ls.userId = u.id
WHERE ls.loginAt >= NOW() - INTERVAL '30 days'
UNION ALL
SELECT 
  updatedAt as timestamp,
  mobile,
  'FAILED_LOGIN' as event_type,
  lastLoginIp,
  NULL,
  CASE WHEN isLocked THEN 'Locked' ELSE 'Failed' END
FROM users
WHERE loginAttempts > 0
  AND updatedAt >= NOW() - INTERVAL '30 days'
ORDER BY timestamp DESC;
```

---

## 📊 Performance Notes

- Add index on `login_sessions.userId` for faster queries
- Add index on `login_sessions.loginAt` for time-based queries
- Add index on `users.isLocked` for locked user queries
- Archive old sessions quarterly for database performance

