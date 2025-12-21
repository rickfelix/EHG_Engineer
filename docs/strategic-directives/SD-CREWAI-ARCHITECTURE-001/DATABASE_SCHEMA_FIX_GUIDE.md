# Database Schema Fix Guide - Add crew_key Column

**Strategic Directive**: SD-CREWAI-ARCHITECTURE-001
**Phase**: Backend Integration
**Issue**: Missing `crew_key` column in `crewai_crews` table
**Status**: Migration Created, Awaiting Manual Application
**Date**: 2025-11-07

---

## Problem Statement

The Crew Builder frontend expects a `crew_key` column in the `crewai_crews` table, but the current schema only has `crew_name`. This causes the following error:

```
PostgresError: column "crew_key" of relation "crewai_crews" does not exist
```

**Impact**:
- ❌ Cannot save crews to database via Crew Builder
- ✅ Crew code generation still works (in-memory only)
- ❌ Cannot retrieve crews from database

---

## Solution

Add the `crew_key` column to the `crewai_crews` table with proper constraints and indexing.

---

## Migration Files Created

### 1. Supabase Migration File

**Location**: `/mnt/c/_EHG/EHG/supabase/migrations/20251107000000_add_crew_key_column.sql`

**Status**: ✅ Created, awaiting application

**Contents**:
```sql
-- Migration: Add crew_key column to crewai_crews table
-- SD: SD-CREWAI-ARCHITECTURE-001
-- Phase: Backend Integration
-- Description: Add crew_key column for API compatibility with Crew Builder frontend
-- Date: 2025-11-07

-- Step 1: Add the column (nullable first to allow backfill)
ALTER TABLE crewai_crews
ADD COLUMN IF NOT EXISTS crew_key VARCHAR(255);

-- Step 2: Backfill existing rows by generating crew_key from crew_name
UPDATE crewai_crews
SET crew_key = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(crew_name, '[^a-zA-Z0-9]+', '-', 'g'),
    '^-+|-+$', '', 'g'
  )
)
WHERE crew_key IS NULL;

-- Step 3: Add NOT NULL constraint
ALTER TABLE crewai_crews
ALTER COLUMN crew_key SET NOT NULL;

-- Step 4: Add UNIQUE constraint
ALTER TABLE crewai_crews
ADD CONSTRAINT crewai_crews_crew_key_unique UNIQUE (crew_key);

-- Step 5: Create index for performance
CREATE INDEX IF NOT EXISTS idx_crewai_crews_crew_key
ON crewai_crews(crew_key);
```

### 2. JavaScript Migration Script

**Location**: `/mnt/c/_EHG/EHG/scripts/apply-crew-key-migration.mjs`

**Status**: ✅ Created, requires Supabase service role key

---

## Application Methods

### Method 1: Via Supabase Dashboard (RECOMMENDED)

1. **Navigate to Supabase Dashboard**
   - Go to: https://app.supabase.com/project/liapbndqlqxdcgpwntbv
   - Login with your credentials

2. **Open SQL Editor**
   - Click "SQL Editor" in left sidebar
   - Click "New query"

3. **Copy and paste migration SQL**
   ```sql
   -- Add crew_key column
   ALTER TABLE crewai_crews
   ADD COLUMN IF NOT EXISTS crew_key VARCHAR(255);

   -- Backfill existing rows
   UPDATE crewai_crews
   SET crew_key = LOWER(
     REGEXP_REPLACE(
       REGEXP_REPLACE(crew_name, '[^a-zA-Z0-9]+', '-', 'g'),
       '^-+|-+$', '', 'g'
     )
   )
   WHERE crew_key IS NULL;

   -- Add NOT NULL constraint
   ALTER TABLE crewai_crews
   ALTER COLUMN crew_key SET NOT NULL;

   -- Add UNIQUE constraint
   ALTER TABLE crewai_crews
   ADD CONSTRAINT crewai_crews_crew_key_unique UNIQUE (crew_key);

   -- Create index
   CREATE INDEX IF NOT EXISTS idx_crewai_crews_crew_key
   ON crewai_crews(crew_key);
   ```

4. **Execute the migration**
   - Click "Run" button
   - Verify success message

5. **Verify the migration**
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'crewai_crews' AND column_name = 'crew_key';
   ```

   Expected result:
   ```
   column_name | data_type        | is_nullable
   crew_key    | character varying| NO
   ```

---

### Method 2: Via Supabase CLI (If Available)

```bash
cd /mnt/c/_EHG/EHG
npx supabase db push
```

**Note**: This will apply all pending migrations including the crew_key migration.

**Issue**: May fail due to syntax errors in other pending migrations. If this happens, use Method 1 (Dashboard) instead.

---

### Method 3: Via JavaScript Script (Requires Service Role Key)

**Requirements**:
- Supabase service role key (not just anon key)
- Add to `.env` file: `SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`

**Steps**:
```bash
cd /mnt/c/_EHG/EHG
node scripts/apply-crew-key-migration.mjs
```

**Status**: Script created but cannot run without service role key.

---

## Verification Steps

### 1. Check Column Exists

```sql
SELECT column_name, data_type, is_nullable, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'crewai_crews'
ORDER BY ordinal_position;
```

Expected output should include:
```
crew_key | character varying | NO | 255
```

### 2. Check Unique Constraint

```sql
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'crewai_crews'::regclass
AND conname = 'crewai_crews_crew_key_unique';
```

Expected output:
```
conname                        | contype
crewai_crews_crew_key_unique  | u
```

### 3. Check Index

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'crewai_crews'
AND indexname = 'idx_crewai_crews_crew_key';
```

Expected output:
```
indexname                  | indexdef
idx_crewai_crews_crew_key | CREATE INDEX idx_crewai_crews_crew_key ON public.crewai_crews USING btree (crew_key)
```

### 4. Test Crew Creation

After migration, test via API:

```bash
curl -X POST http://localhost:8000/api/crews \
  -H "Content-Type: application/json" \
  -d '{
    "crew_key": "test-crew",
    "name": "Test Crew",
    "description": "Test crew for schema verification",
    "crew_type": "sequential"
  }'
```

Expected response:
```json
{
  "id": "uuid-here",
  "crew_key": "test-crew",
  "name": "Test Crew",
  "status": "active",
  ...
}
```

### 5. Test Duplicate crew_key (Should Fail)

```bash
curl -X POST http://localhost:8000/api/crews \
  -H "Content-Type: application/json" \
  -d '{
    "crew_key": "test-crew",
    "name": "Duplicate Crew",
    "description": "Should fail",
    "crew_type": "sequential"
  }'
```

Expected response:
```json
{
  "detail": "Crew with key 'test-crew' already exists"
}
```

---

## Rollback Instructions

If you need to rollback this migration:

```sql
-- Drop index
DROP INDEX IF EXISTS idx_crewai_crews_crew_key;

-- Drop unique constraint
ALTER TABLE crewai_crews
DROP CONSTRAINT IF EXISTS crewai_crews_crew_key_unique;

-- Drop column
ALTER TABLE crewai_crews
DROP COLUMN IF EXISTS crew_key;
```

---

## Estimated Time

- **Manual application via Dashboard**: 5 minutes
- **Verification**: 2 minutes
- **Testing**: 3 minutes
- **Total**: ~10 minutes

---

## Impact Assessment

### Before Migration
- ❌ Crew Builder save fails with "column does not exist" error
- ✅ Crew Builder code generation works (in-memory)
- ❌ Cannot retrieve crews from database
- **Production Ready**: 82% (Agent Wizard works)

### After Migration
- ✅ Crew Builder save works end-to-end
- ✅ Crew Builder code generation works
- ✅ Can retrieve crews from database
- **Production Ready**: 100%

---

## Next Steps After Migration

1. **Verify migration succeeded** (run verification queries above)
2. **Test Crew Builder end-to-end** (create crew, save, retrieve)
3. **Update testing report** with post-migration results
4. **Deploy to staging** for user acceptance testing
5. **Update Phase 5 status** to "100% Complete"

---

## Support

If you encounter issues:

1. **Check Supabase Dashboard**
   - Logs: https://app.supabase.com/project/liapbndqlqxdcgpwntbv/logs
   - Database: https://app.supabase.com/project/liapbndqlqxdcgpwntbv/database/tables

2. **Check backend logs**
   ```bash
   tail -f /mnt/c/_EHG/EHG/agent-platform/logs/backend.log
   ```

3. **Re-read error messages** - Most errors are self-explanatory

4. **Contact database team** if migration fails unexpectedly

---

## Related Documents

- **Backend Integration**: `/docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/BACKEND_INTEGRATION_COMPLETE.md`
- **Testing Report**: `/docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/TESTING_REPORT.md`
- **Phase 5 Summary**: `/docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/PHASE5_COMPLETE_SUMMARY.md`
- **Implementation Summary**: `/docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/PHASE5_IMPLEMENTATION_SUMMARY.md`

---

**Document Version**: 1.0
**Last Updated**: 2025-11-07
**Author**: Claude Code (LEO Protocol)
**Review Status**: Ready for Application
**Migration Status**: ⏳ Pending Manual Application
