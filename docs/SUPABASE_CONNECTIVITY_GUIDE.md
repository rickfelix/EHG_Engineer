# Supabase Connectivity Guide - Complete Reference

## 🚨 CRITICAL: Read This First

### The IPv6 Problem (Why Direct Connection Fails)
- **Date of Change**: January 26, 2024
- **What Changed**: Supabase migrated all direct database connections to IPv6-only
- **Impact**: Direct connections (`db.*.supabase.co`) no longer work from IPv4-only environments like WSL2
- **Solution**: Use the Supavisor pooler connection (IPv4 compatible)

## ✅ Working Connection Methods

### Method 1: psql via Supavisor Pooler (RECOMMENDED)
```bash
psql 'postgresql://postgres.dedlbzhpgkmetvhbkyzq:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
```

#### Key Components Explained:
| Component | Value | Why It Matters |
|-----------|-------|----------------|
| **Username** | `postgres.dedlbzhpgkmetvhbkyzq` | Must include project ref (NOT just `postgres`) |
| **Password** | `[URL-ENCODED-PASSWORD]` | Special chars must be URL-encoded (`!` → `%21`) |
| **Host** | `aws-1-us-east-1.pooler.supabase.com` | IPv4 compatible pooler endpoint |
| **Port** | `5432` | Session mode (persistent connections) |
| **SSL** | `?sslmode=require` | Required for security |

### Method 2: JavaScript Client (Always Works)
```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // Your anon key
);

// Works because it uses HTTPS/REST APIs, not direct PostgreSQL
```

## ❌ What DOESN'T Work (and Why)

### 1. Direct Connection (IPv6 Issue)
```bash
# THIS WILL FAIL in WSL2
psql -h db.dedlbzhpgkmetvhbkyzq.supabase.co -p 5432 -U postgres

# Error: Network is unreachable
# Reason: db.*.supabase.co resolves to IPv6-only address
```

### 2. Wrong Username Format
```bash
# THIS WILL FAIL (wrong username)
psql 'postgresql://postgres:[PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres'

# Error: password authentication failed
# Reason: Missing project ref in username
```

### 3. Unencoded Password
```bash
# THIS WILL FAIL (special chars not encoded)
psql 'postgresql://postgres.dedlbzhpgkmetvhbkyzq:Pass!word!@...'

# Error: Shell interprets ! as history expansion
# Reason: ! must be URL-encoded as %21
```

## 📁 Project Files & Scripts

### Environment Variables (`.env`)
```bash
# Database password (store in .env, never commit)
SUPABASE_DB_PASSWORD=[YOUR_PASSWORD]

# Pooler connection string (ready to use)
SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[URL_ENCODED_PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require

# API Keys (for JavaScript client)
NEXT_PUBLIC_SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR_ANON_KEY]
```

### Helper Scripts

#### `scripts/db-connect.sh`
Quick psql connection helper:
```bash
#!/bin/bash
# Load from environment variable
source .env
psql "$SUPABASE_POOLER_URL" "$@"
```

Usage:
```bash
# Interactive session
./scripts/db-connect.sh

# Run query
./scripts/db-connect.sh -c "SELECT COUNT(*) FROM sd_backlog_map;"
```

#### `scripts/check-real-backlog-gaps.js`
Check data integrity using JavaScript client (always works)

## 🗂️ Database Schema Reference

### Tables That Exist
| Table | Purpose | Record Count |
|-------|---------|--------------|
| `strategic_directives_v2` | Strategic directives | 66 |
| `product_requirements_v2` | Product requirements | ? |
| `sd_backlog_map` | Backlog items linked to SDs | 260 |

### Tables That DON'T Exist (yet)
| Table | Purpose |
|-------|---------|
| `eng_backlog` | Engineering backlog (referenced in migrations) |

## 🔧 Troubleshooting Guide

### Problem: "Network is unreachable"
**Cause**: Trying to connect to IPv6-only endpoint from IPv4-only environment
**Solution**: Use pooler connection instead of direct connection

### Problem: "password authentication failed"
**Possible Causes**:
1. Wrong username format (missing project ref)
2. Wrong password
3. Password not URL-encoded

**Debug Steps**:
```bash
# Check if password has special chars
echo $SUPABASE_DB_PASSWORD

# URL-encode the password
node -e "console.log(encodeURIComponent('YourPassword!'))"
# Output: YourPassword%21

# Use single quotes to prevent shell interpretation
psql 'postgresql://...'  # Good
psql "postgresql://..."  # Bad - shell interprets special chars
```

### Problem: "Could not find table in schema cache"
**Cause**: JavaScript client cache is stale
**Solution**: The table might still exist, try psql to verify

## 🚀 Quick Start Commands

### Test Connection
```bash
# Quick test
./scripts/db-test.sh

# Manual test
psql "$SUPABASE_POOLER_URL" -c "SELECT version();"
```

### Common Queries
```bash
# Count tables
./scripts/db-connect.sh -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"

# List tables
./scripts/db-connect.sh -c "\dt"

# Check backlog gaps
node scripts/check-real-backlog-gaps.js
```

### Create/Drop Tables
```bash
# Create table
./scripts/db-connect.sh -c "CREATE TABLE test (id UUID PRIMARY KEY DEFAULT gen_random_uuid());"

# Drop table
./scripts/db-connect.sh -c "DROP TABLE test;"
```

## 📊 Connection String Comparison

| Method | Host | Port | Username | IPv4? | Works in WSL2? |
|--------|------|------|----------|-------|----------------|
| Direct | db.*.supabase.co | 5432 | postgres | ❌ | ❌ |
| Pooler Session | aws-1-*.pooler.supabase.com | 5432 | postgres.projectref | ✅ | ✅ |
| Pooler Transaction | aws-1-*.pooler.supabase.com | 6543 | postgres.projectref | ✅ | ✅ |
| JS Client | *.supabase.co | 443 | (uses API key) | ✅ | ✅ |

## 🔐 Security Notes

### Password Encoding Rules
| Character | URL Encoded | Note |
|-----------|-------------|------|
| `!` | `%21` | Must encode in URLs |
| `@` | `%40` | Must encode if in password |
| `#` | `%23` | Must encode in URLs |
| `$` | `%24` | Shell variable expansion risk |
| `&` | `%26` | Shell background job risk |

### Best Practices
1. Always use single quotes around connection strings
2. Store passwords in environment variables
3. Use `sslmode=require` minimum
4. Never commit raw passwords to git

## 📝 Historical Context

### Timeline
- **Pre-January 2024**: Direct connections worked with IPv4
- **January 26, 2024**: IPv6-only migration completed
- **Current**: Must use pooler for IPv4 environments

### Why This Happened
1. IPv4 address exhaustion
2. Cloud provider costs for IPv4
3. Supabase architectural modernization
4. Introduction of Supavisor pooler

## ✅ Validation Checklist

When setting up a new environment, verify:
- [ ] Can run: `psql "$SUPABASE_POOLER_URL" -c "SELECT 1;"`
- [ ] Username includes project ref: `postgres.dedlbzhpgkmetvhbkyzq`
- [ ] Password is URL-encoded: `Fl%21M32DaM00n%211`
- [ ] Using pooler host: `aws-1-us-east-1.pooler.supabase.com`
- [ ] SSL mode is set: `?sslmode=require`
- [ ] Connection string is single-quoted in bash

## 🆘 If All Else Fails

1. **Use the JavaScript client** - It always works
2. **Check the Supabase Dashboard** for current connection strings
3. **Verify password** hasn't been changed
4. **Try transaction mode** port 6543 instead of 5432
5. **Enable WSL2 mirrored networking** (Windows 11 only):
   ```ini
   # In %UserProfile%\.wslconfig
   [wsl2]
   networkingMode=mirrored
   ```

---

**Last Updated**: 2025-09-22
**Verified Working**: psql via pooler, JS client
**Project**: dedlbzhpgkmetvhbkyzq (us-east-1)