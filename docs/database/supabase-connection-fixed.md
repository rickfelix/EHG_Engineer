---
category: database
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [database, auto-generated]
---
# Supabase Connection Issue - RESOLVED


## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, sd, directive

## Problem Summary
- **Direct connection failed**: IPv6-only endpoint unreachable from WSL2
- **Pooler connection failed**: Incorrect username format
- **Supabase CLI failed**: Cached old connection details

## Solution Implemented

### 1. Working psql Connection
```bash
psql 'postgresql://postgres.dedlbzhpgkmetvhbkyzq:[URL_ENCODED_PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require'
```

Key changes:
- Use pooler endpoint: `aws-1-us-east-1.pooler.supabase.com` (IPv4 compatible)
- Composite username: `postgres.dedlbzhpgkmetvhbkyzq` (not just `postgres`)
- URL-encoded password: Special characters must be encoded (! → %21)
- SSL required: `?sslmode=require`

### 2. Helper Scripts Created
- `scripts/db-connect.sh` - Quick psql connection
- `scripts/db-test.sh` - Connection test suite
- `scripts/check-real-backlog-gaps.js` - Backlog integrity checker

### 3. Backlog Integrity Results
Real gaps found in production data:
- 8 Strategic Directives without backlog items
- 97 backlog items with invalid priorities
- 17 items missing descriptions
- 0 orphaned backlog items

### 4. Tables Discovered
- `strategic_directives_v2` - Strategic directives (66 records)
- `product_requirements_v2` - Product requirements
- `sd_backlog_map` - Backlog items linked to SDs (260 records)

## Quick Reference

### Connect to Database
```bash
./scripts/db-connect.sh
```

### Run SQL Query
```bash
./scripts/db-connect.sh -c "SELECT COUNT(*) FROM sd_backlog_map;"
```

### Check Backlog Gaps
```bash
node scripts/check-real-backlog-gaps.js
```

### Test Connection
```bash
./scripts/db-test.sh
```

## Environment Variables
Added to `.env`:
```
SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[URL_ENCODED_PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

Note: Store actual password in `.env` file only, never commit to git.

## Root Cause Analysis
1. **IPv6 Migration**: Supabase moved to IPv6-only for direct connections (January 2024)
2. **WSL2 Limitation**: Default WSL2 configuration lacks IPv6 routing
3. **Pooler Solution**: Supavisor pooler provides IPv4 endpoints
4. **Username Format**: Pooler requires `postgres.<project_ref>` format

## Status: ✅ FULLY OPERATIONAL
- psql connections work
- JavaScript client works
- Backlog integrity checks operational
- Real data gaps identified