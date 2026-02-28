---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# Database Troubleshooting Guide

## Metadata
- **Category**: Guide
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Claude Opus 4.5 (Database Agent)
- **Last Updated**: 2026-01-25
- **Tags**: database, troubleshooting, postgres, uuid, type-mismatch

## Overview

Comprehensive guide for diagnosing and resolving common database issues in the EHG Engineer system. Covers PostgreSQL errors, type mismatches, trigger issues, and migration problems.

## Table of Contents

- [Common Errors](#common-errors)
  - [UUID Type Mismatch](#uuid-type-mismatch)
  - [Trigger Execution Errors](#trigger-execution-errors)
  - [Missing Tables](#missing-tables)
  - [Foreign Key Violations](#foreign-key-violations)
- [Diagnostic Tools](#diagnostic-tools)
- [Resolution Patterns](#resolution-patterns)
- [Prevention Strategies](#prevention-strategies)

---

## Common Errors

### UUID Type Mismatch

#### Error Message
```
ERROR: invalid input syntax for type uuid: "SD-LEO-ENH-AUTO-PROCEED-001-12"
Code: 22P02
```

#### Root Cause
PostgreSQL attempting to cast a VARCHAR string to UUID type when the column contains user-facing SD keys instead of UUIDs.

**Common Scenarios:**
1. Database function selects `id` (VARCHAR) into a UUID variable
2. Application code uses `sd.id` when querying UUID-typed foreign key columns
3. Trigger function tries to insert VARCHAR value into UUID column

#### Example Bug (Fixed in SD-LEO-ENH-AUTO-PROCEED-001-12)

**Before (Broken):**
```sql
CREATE FUNCTION check_orphaned_work(p_sd_id VARCHAR, ...)
RETURNS JSONB AS $$
DECLARE
  sd_uuid UUID;  -- ❌ Variable declared as UUID
BEGIN
  -- ❌ Selecting VARCHAR into UUID variable
  SELECT id INTO sd_uuid FROM strategic_directives_v2 WHERE sd_key = p_sd_id;

  -- ❌ Using UUID variable to query VARCHAR column
  SELECT COUNT(*) INTO orphaned_stories
  FROM user_stories
  WHERE sd_id = sd_uuid;  -- user_stories.sd_id is VARCHAR(50)
END;
$$;
```

**After (Fixed):**
```sql
CREATE FUNCTION check_orphaned_work(p_sd_id VARCHAR, ...)
RETURNS JSONB AS $$
DECLARE
  sd_id_found VARCHAR;  -- ✅ Variable declared as VARCHAR
BEGIN
  -- ✅ Selecting VARCHAR into VARCHAR variable
  SELECT id INTO sd_id_found FROM strategic_directives_v2 WHERE sd_key = p_sd_id;

  -- ✅ Using VARCHAR variable to query VARCHAR column
  SELECT COUNT(*) INTO orphaned_stories
  FROM user_stories
  WHERE sd_id = sd_id_found;  -- Type match
END;
$$;
```

#### Resolution Steps

1. **Identify the function/trigger causing the error:**
   ```sql
   -- Error will show function name in the stack trace
   WHERE: PL/pgSQL function check_orphaned_work(character varying,...) line 11
   ```

2. **Check variable declarations:**
   ```sql
   -- Get function definition
   SELECT pg_get_functiondef(p.oid)
   FROM pg_proc p
   WHERE p.proname = 'check_orphaned_work';
   ```

3. **Verify column types in child tables:**
   ```sql
   SELECT table_name, column_name, data_type
   FROM information_schema.columns
   WHERE column_name = 'sd_id'
   AND table_name IN ('user_stories', 'sd_scope_deliverables', 'sd_wall_states')
   ORDER BY table_name;
   ```

4. **Fix variable types to match:**
   - If querying tables with VARCHAR `sd_id`: Use VARCHAR variable
   - If querying tables with UUID `sd_id`: Use UUID variable and `uuid_id` column

5. **Create and execute migration:**
   ```bash
   # Create migration file
   database/migrations/YYYYMMDD_fix_function_name_uuid.sql

   # Execute via pooler connection
   node scripts/execute-database-sql.js database/migrations/YYYYMMDD_fix_function_name_uuid.sql
   ```

#### Tables with UUID sd_id Columns

These tables have `sd_id` as UUID type (foreign key to `strategic_directives_v2.uuid_id`):

- `sd_wall_states`
- `sd_kickbacks`
- `sd_gate_results`
- `sd_corrections`
- `sd_capabilities` (uses `sd_uuid` column)
- `sub_agent_spawn_events`
- `task_hydration_log`

**Application Code Pattern:**
```javascript
// ❌ WRONG: Using sd.id for UUID table
await supabase
  .from('sd_wall_states')
  .eq('sd_id', sd.id);  // Will fail - id is VARCHAR

// ✅ CORRECT: Use uuid_id for UUID table
await supabase
  .from('sd_wall_states')
  .eq('sd_id', sd.uuid_id);  // Works - uuid_id is UUID
```

### Trigger Execution Errors

#### Error Message
```
ERROR: relation "table_name" does not exist
Code: 42P01
WHERE: PL/pgSQL function function_name() line N
```

#### Root Cause
Database function references a table that doesn't exist in the current schema.

#### Resolution Steps

1. **Find the problematic trigger:**
   ```sql
   SELECT t.tgname, p.proname, c.relname
   FROM pg_trigger t
   JOIN pg_class c ON t.tgrelid = c.oid
   JOIN pg_proc p ON t.tgfoid = p.oid
   WHERE c.relname = 'strategic_directives_v2'
   ORDER BY t.tgname;
   ```

2. **Check if table exists:**
   ```sql
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name LIKE '%search_term%';
   ```

3. **Update function to remove/replace table reference:**
   - If table was removed: Remove query from function
   - If table was renamed: Update function with new name
   - If table never existed: Remove dead code

4. **Test the fix:**
   ```sql
   -- Try the operation that failed
   UPDATE strategic_directives_v2 SET sd_type = 'infrastructure' WHERE sd_key = 'SD-XXX';
   ```

### Missing Tables

#### Diagnostic Query
```sql
-- List all tables in public schema
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Search for similar table names
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE '%pattern%';
```

#### Common Missing Tables
- `e2e_test_scenarios` - Does not exist; use views like `v_story_e2e_compliance` instead
- Historical tables that were dropped in migrations

### Foreign Key Violations

#### Error Message
```
ERROR: insert or update on table "X" violates foreign key constraint "Y"
DETAIL: Key (sd_id)=(value) is not present in table "strategic_directives_v2"
```

#### Resolution
1. **Verify parent record exists:**
   ```sql
   SELECT id, sd_key, status
   FROM strategic_directives_v2
   WHERE id = 'SD-XXX' OR sd_key = 'SD-XXX';
   ```

2. **Check for UUID vs VARCHAR mismatch** (see UUID Type Mismatch section)

3. **Ensure correct column reference:**
   - Most tables use `id` (VARCHAR) as FK target
   - Some tables use `uuid_id` (UUID) as FK target

---

## Diagnostic Tools

### 1. Function Definition Inspector

```sql
-- Get full function definition
SELECT pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'function_name';
```

### 2. Trigger Inspector

```sql
-- List all triggers on a table
SELECT t.tgname as trigger_name,
       p.proname as function_name,
       CASE t.tgtype & 66
         WHEN 2 THEN 'BEFORE'
         WHEN 64 THEN 'INSTEAD OF'
         ELSE 'AFTER'
       END as timing,
       CASE t.tgtype & 28
         WHEN 4 THEN 'INSERT'
         WHEN 8 THEN 'DELETE'
         WHEN 16 THEN 'UPDATE'
         WHEN 28 THEN 'INSERT OR UPDATE OR DELETE'
       END as event
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'table_name'
ORDER BY t.tgname;
```

### 3. Column Type Checker

```sql
-- Check column types for FK consistency
SELECT
  tc.table_name as source_table,
  kcu.column_name as source_column,
  c.data_type as source_type,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column,
  tc2.data_type as target_type
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.columns c
  ON c.table_name = tc.table_name AND c.column_name = kcu.column_name
JOIN information_schema.columns tc2
  ON tc2.table_name = ccu.table_name AND tc2.column_name = ccu.column_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'strategic_directives_v2'
ORDER BY tc.table_name;
```

### 4. Recent Error Log Query

```bash
# Check PostgreSQL logs for recent errors
node -e "
require('dotenv').config();
const pg = require('pg');
const poolerUrl = process.env.SUPABASE_POOLER_URL;
const url = new URL(poolerUrl);

const client = new pg.Client({
  host: url.hostname,
  port: url.port || 5432,
  database: url.pathname.slice(1),
  user: url.username,
  password: decodeURIComponent(url.password),
  ssl: { rejectUnauthorized: false }
});

client.connect().then(() => {
  // Your diagnostic query here
});
"
```

---

## Resolution Patterns

### Pattern 1: UUID/VARCHAR Alignment

**Problem:** Function uses wrong type for SD identifier

**Solution Template:**
```sql
-- Before: Mismatched types
DECLARE
  sd_uuid UUID;  -- ❌
BEGIN
  SELECT id INTO sd_uuid FROM strategic_directives_v2 WHERE sd_key = p_sd_id;
END;

-- After: Aligned types
DECLARE
  sd_id_found VARCHAR;  -- ✅ Matches id column type
BEGIN
  SELECT id INTO sd_id_found FROM strategic_directives_v2 WHERE sd_key = p_sd_id;
END;
```

### Pattern 2: Application Code FK Alignment

**Problem:** Code queries UUID table with VARCHAR id

**Solution Template:**
```javascript
// Before: Type mismatch
await supabase
  .from('sd_wall_states')  // UUID sd_id column
  .eq('sd_id', sd.id);  // ❌ id is VARCHAR

// After: Correct type
await supabase
  .from('sd_wall_states')  // UUID sd_id column
  .eq('sd_id', sd.uuid_id || sd.id);  // ✅ Use uuid_id or fallback
```

### Pattern 3: Defensive NULL Checks

**Problem:** Function assumes record exists

**Solution Template:**
```sql
-- Before: Assumes record found
SELECT id INTO sd_id_found FROM strategic_directives_v2 WHERE sd_key = p_sd_id;
-- Continues without checking if NULL

-- After: Handles missing record
SELECT id INTO sd_id_found FROM strategic_directives_v2 WHERE sd_key = p_sd_id;

IF sd_id_found IS NULL THEN
  RETURN jsonb_build_object('error', 'SD not found', 'sd_id', p_sd_id);
END IF;
```

---

## Prevention Strategies

### 1. Function Development Checklist

Before deploying a database function:
- [ ] Check all variable types match column types
- [ ] Verify referenced tables exist
- [ ] Test with NULL inputs
- [ ] Handle missing FK records gracefully
- [ ] Use correct SD identifier column (`id` vs `uuid_id`)

### 2. Migration Testing

```bash
# Test migration locally before production
node scripts/execute-database-sql.js database/migrations/test.sql

# Verify function works after migration
node scripts/temp/verify-function-fix.cjs
```

### 3. Code Review Focus Areas

When reviewing database code, check:
1. Variable declarations match queried column types
2. INSERT/UPDATE statements use correct ID type for target table
3. Foreign key queries reference correct parent column
4. Function handles edge cases (NULL, missing records)

### 4. Automated Type Checking

Future enhancement: Create linter to detect type mismatches in SQL functions.

---

## Related Documentation

- [Database Agent Patterns](../reference/database-agent-patterns.md) - Supabase query patterns
- [Database Migration Validation](./database-migration-validation.md) - Migration testing
- [Database Best Practices](../reference/database-best-practices.md) - General DB guidelines

---

## Version History

- **1.0.0** (2026-01-25): Initial guide based on UUID type mismatch fix in SD-LEO-ENH-AUTO-PROCEED-001-12
  - Documented UUID vs VARCHAR type mismatch errors
  - Added diagnostic tools for function/trigger inspection
  - Included resolution patterns from real fixes

---

*Maintained by: Database Agent (DOCMON)*
*Related SD: SD-LEO-ENH-AUTO-PROCEED-001-12*
