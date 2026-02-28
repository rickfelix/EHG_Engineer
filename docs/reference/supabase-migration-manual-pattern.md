---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# Lesson Learned: Supabase Migration Manual Application Pattern



## Table of Contents

- [Metadata](#metadata)
- [Pattern Name](#pattern-name)
- [Context (When This Applies)](#context-when-this-applies)
- [Problem (What Fails)](#problem-what-fails)
  - [Method 1: Direct psql Connection](#method-1-direct-psql-connection)
  - [Method 2: Supabase CLI (db push)](#method-2-supabase-cli-db-push)
  - [Method 3: Supabase REST API (RPC)](#method-3-supabase-rest-api-rpc)
  - [Method 4: PostgREST Admin API](#method-4-postgrest-admin-api)
  - [Why This Happens](#why-this-happens)
- [Solution (What Works)](#solution-what-works)
  - [Recommended Approach: Supabase Dashboard SQL Editor](#recommended-approach-supabase-dashboard-sql-editor)
  - [Example Verification Script](#example-verification-script)
- [Prevention (How to Avoid Wasted Time)](#prevention-how-to-avoid-wasted-time)
  - [DO NOT attempt these automation methods:](#do-not-attempt-these-automation-methods)
  - [DO follow this workflow:](#do-follow-this-workflow)
  - [Add to database-agent.md:](#add-to-database-agentmd)
- [Environment-Specific Patterns](#environment-specific-patterns)
  - [EHG Repository: Manual Migration Required](#ehg-repository-manual-migration-required)
- [Related SDs](#related-sds)
- [Evidence / References](#evidence-references)
  - [From SD-STAGE-12-001 MIGRATION_APPLICATION_STATUS.md:](#from-sd-stage-12-001-migration_application_statusmd)
- [Attempted Methods (All Failed)](#attempted-methods-all-failed)
  - [1. Direct psql Connection](#1-direct-psql-connection)
  - [2. Supabase CLI (db push)](#2-supabase-cli-db-push)
  - [3-5. Various REST API approaches](#3-5-various-rest-api-approaches)
  - [From docs/reference/database-agent-patterns.md:](#from-docsreferencedatabase-agent-patternsmd)
- [Metrics](#metrics)
- [Checklist for Future Migrations](#checklist-for-future-migrations)
- [Quote from Database Agent Patterns](#quote-from-database-agent-patterns)

## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, migration, schema

**Date**: 2025-12-05
**Context**: SD-STAGE-12-001 (Stage 12: Adaptive Naming - Brand Variants)
**Category**: Database / Migrations
**Pattern ID**: PAT-SUPABASE-MANUAL-001

---

## Pattern Name

**Manual Supabase Migration via Dashboard SQL Editor**

---

## Context (When This Applies)

This pattern applies when:
- Working in the EHG/EHG_Engineer repository
- Running in WSL2 or corporate network environment
- Attempting to execute database migrations
- Using Supabase as the database provider

**Environment Fingerprint**:
- OS: WSL2 on Windows
- Network: Corporate firewall or restricted network
- Database: Supabase PostgreSQL

---

## Problem (What Fails)

All automated database migration methods fail due to port 5432 being blocked:

### Method 1: Direct psql Connection
```bash
PGPASSWORD='...' psql -h dedlbzhpgkmetvhbkyzq.supabase.co \
  -U postgres -d postgres -f migration.sql
```
**Result**: Connection timeout (i/o timeout after 30s)
**Reason**: Network/firewall blocking port 5432

### Method 2: Supabase CLI (db push)
```bash
npx supabase db push --db-url "postgresql://..."
```
**Result**: Connection timeout (dial tcp timeout)
**Reason**: Same network constraint as psql

### Method 3: Supabase REST API (RPC)
```javascript
supabase.rpc('exec_sql', { sql: migrationSQL })
```
**Result**: Function not found (404)
**Reason**: `exec_sql` RPC function doesn't exist in database by design

### Method 4: PostgREST Admin API
```bash
curl -X POST .../rest/v1/rpc/exec -d '{"query": "..."}'
```
**Result**: Function not found
**Reason**: `exec` RPC function doesn't exist

### Why This Happens

Supabase's REST API (PostgREST) intentionally doesn't expose raw SQL execution for security reasons. The only ways to execute DDL statements are:

1. **psql/CLI** - Requires direct database connection (port 5432)
2. **Supabase Dashboard** - Uses authenticated web interface with elevated privileges

Since port 5432 is blocked, **Supabase Dashboard is the only viable option**.

---

## Solution (What Works)

### Recommended Approach: Supabase Dashboard SQL Editor

**Time Required**: 2-3 minutes

**Steps**:

1. **Create Migration File**
   - Write SQL migration in `supabase/migrations/YYYYMMDD_description.sql`
   - Use `IF NOT EXISTS` for idempotency
   - Include comments and rollback SQL

2. **Open Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/[PROJECT_ID]/sql/new
   - For EHG_Engineer: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql/new

3. **Paste and Execute**
   - Copy SQL from migration file
   - Paste into SQL Editor
   - Click "Run"

4. **Verify Success**
   ```sql
   -- Example verification query
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'table_name' AND column_name = 'new_column';
   ```

5. **Create Verification Script**
   - Use Supabase REST API (works over HTTPS port 443)
   - Can query `information_schema` via REST
   - Script confirms migration applied

### Example Verification Script

```javascript
// scripts/verify-migration.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function verifyMigration() {
  // Query via REST API (works over HTTPS)
  const { data, error } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type')
    .eq('table_name', 'ventures')
    .eq('column_name', 'brand_variants');

  if (error) {
    console.error('Verification failed:', error.message);
    return false;
  }

  if (data.length > 0) {
    console.log('Migration verified successfully');
    return true;
  }

  console.log('Column not found - migration not applied');
  return false;
}

verifyMigration();
```

---

## Prevention (How to Avoid Wasted Time)

### DO NOT attempt these automation methods:

```bash
# All of these will timeout or fail:
psql -h *.supabase.co ...           # Port 5432 blocked
npx supabase db push ...            # Port 5432 blocked
npx supabase migration apply ...    # Port 5432 blocked
supabase.rpc('exec_sql', ...)       # RPC doesn't exist
```

### DO follow this workflow:

1. **Create migration SQL file** (with clear documentation)
2. **Create verification script** (using REST API)
3. **Document manual steps** for user
4. **Mark SD as CONDITIONAL_PASS** with user action required
5. **Skip all automation troubleshooting**

### Add to database-agent.md:

```markdown
## Environment-Specific Patterns

### EHG Repository: Manual Migration Required

**Context**: Port 5432 is blocked in this environment

**Pattern** (SD-STAGE-12-001, SD-GTM-INTEL-DISCOVERY-001):
1. DO NOT attempt psql, Supabase CLI, or REST API for DDL
2. DO create migration SQL file
3. DO document manual execution steps
4. DO create verification script (REST API works)
5. DO mark as CONDITIONAL_PASS

**Time Saved**: 30 minutes per migration
```

---

## Related SDs

| SD ID | Date | Context | Resolution |
|-------|------|---------|------------|
| SD-GTM-INTEL-DISCOVERY-001 | 2025-10-26 | nav_routes INSERT blocked | Manual Dashboard execution |
| SD-STAGE-12-001 | 2025-12-05 | brand_variants column | Manual Dashboard execution |

---

## Evidence / References

### From SD-STAGE-12-001 MIGRATION_APPLICATION_STATUS.md:

```markdown
## Attempted Methods (All Failed)

### 1. Direct psql Connection
Result: Connection timeout (i/o timeout after 30s)
Reason: Network/firewall blocking port 5432

### 2. Supabase CLI (db push)
Result: Connection timeout (dial tcp timeout)
Reason: Same network constraint as psql

### 3-5. Various REST API approaches
Result: Function not found
Reason: exec_sql RPC function doesn't exist in database
```

### From docs/reference/database-agent-patterns.md:

```markdown
**Example** (SD-GTM-INTEL-DISCOVERY-001):
- ANON_KEY blocked INSERT to nav_routes table
- Database agent documented blocker with SQL migration script
- User executed via Supabase dashboard with elevated privileges
- Result: CONDITIONAL_PASS with clear completion path
```

---

## Metrics

| Metric | Value |
|--------|-------|
| Time Lost (SD-STAGE-12-001) | 30 minutes |
| Time Saved with Pattern | 30 minutes per migration |
| Pattern Occurrences | 2 (and counting) |
| Success Rate | 100% (when following pattern) |

---

## Checklist for Future Migrations

- [ ] Skip psql/CLI attempts (will timeout)
- [ ] Create migration SQL file with documentation
- [ ] Add `IF NOT EXISTS` for idempotency
- [ ] Create verification script using REST API
- [ ] Document manual steps in handoff
- [ ] Mark SD as CONDITIONAL_PASS if user action required
- [ ] Test verification script before handoff

---

## Quote from Database Agent Patterns

> "Supabase's REST API (PostgREST) doesn't expose raw SQL execution for security reasons. The only ways to execute DDL statements are: psql/CLI (port 5432) or Supabase Dashboard (web interface)."

---

**Pattern ID**: PAT-SUPABASE-MANUAL-001
**Status**: ACTIVE
**Last Updated**: 2025-12-05
**Created By**: RETRO Agent (SD-STAGE-12-001 retrospective)
**Category**: database

---

**Takeaway**: Don't fight the environment. Port 5432 is blocked. Manual Supabase Dashboard execution is the established pattern. Skip troubleshooting, go directly to manual steps.
