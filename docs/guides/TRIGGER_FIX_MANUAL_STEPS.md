# Manual Trigger Fix Instructions


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-13
- **Tags**: database, migration, guide, sd

**Issue**: `auto_populate_retrospective_fields()` trigger is blocking embedding generation

**Root Causes**:
1. Trigger validates `severity_level` without NULL check
2. Trigger enforces `affected_components` validation on ALL updates (including embedding updates)
3. Trigger enforces `quality_score >= 70` validation on ALL updates

**Solution**: Make validations conditional - only enforce when relevant fields are being changed

---

## Option 1: Apply via Supabase SQL Editor (RECOMMENDED)

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard
   - Select your project
   - Navigate to "SQL Editor"

2. **Copy Migration SQL**
   - Open: `database/migrations/20251016_fix_retrospective_trigger_for_embeddings.sql`
   - Copy entire contents

3. **Execute in SQL Editor**
   - Paste the SQL
   - Click "Run"
   - Verify you see: `✅ Fixed trigger verified`

4. **Test the Fix**
   - Run your embedding generation script
   - Should complete without trigger errors

---

## Option 2: Apply via psql Command Line

```bash
# From EHG_Engineer root directory

# Get your database connection string from .env
# Look for: DATABASE_URL or SUPABASE_DB_URL

# Apply migration
psql "$DATABASE_URL" -f database/migrations/20251016_fix_retrospective_trigger_for_embeddings.sql
```

---

## Option 3: Quick Fix (Temporary - Disable Trigger)

If you need embedding generation to work IMMEDIATELY and will fix properly later:

```sql
-- Disable trigger temporarily
ALTER TABLE retrospectives DISABLE TRIGGER trigger_auto_populate_retrospective_fields;

-- Run your embedding generation

-- Re-enable trigger
ALTER TABLE retrospectives ENABLE TRIGGER trigger_auto_populate_retrospective_fields;
```

**⚠️ WARNING**: This bypasses all validation. Only use for quick fixes.

---

## Verification After Fix

Run this query to verify the fix worked:

```sql
-- Test: Update a retrospective with just embedding (should succeed)
UPDATE retrospectives
SET content_embedding = '[0.1, 0.2, 0.3]'::vector
WHERE status = 'PUBLISHED'
  AND content_embedding IS NULL
LIMIT 1;
```

If no error occurs, the fix is working!

---

## What Changed in the Fixed Trigger?

### Before (Problematic):
- Validated `affected_components` on **EVERY UPDATE**
- Validated `quality_score >= 70` on **EVERY UPDATE**
- Referenced `severity_level` without NULL check

### After (Fixed):
- Validates `affected_components` **ONLY** when `learning_category` is being set/changed to `APPLICATION_ISSUE`
- Validates `quality_score >= 70` **ONLY** when status is changing TO `PUBLISHED`
- Added NULL check for `severity_level` before validation

### Why This Fixes Embedding Generation:
- Embedding updates only modify `content_embedding` field
- Fixed trigger detects this is NOT a status change or category change
- Skips validation, allows update to proceed
- Embeddings generate successfully!

---

## Rollback (if needed)

If the fix causes issues, rollback with:

```sql
DROP TRIGGER IF EXISTS trigger_auto_populate_retrospective_fields ON retrospectives;

-- Then re-run original migration
-- File: database/migrations/20251016_retrospective_quality_enforcement_layers_1_2.sql
```

---

## Next Steps After Fix

1. ✅ Apply this migration
2. ✅ Re-run embedding generation: `node scripts/generate-embeddings-for-retrospectives.js`
3. ✅ Verify embeddings were created: Check `content_embedding IS NOT NULL`
4. ✅ Test other retrospective operations still work (INSERT, UPDATE status, etc.)
5. ✅ Document this fix in retrospective for SD-RETRO-ENHANCE-001

---

**Created**: 2025-10-16
**Issue**: SD-2025-1016-EMBEDDING-FIX
**Files**:
- Migration: `database/migrations/20251016_fix_retrospective_trigger_for_embeddings.sql`
- This guide: `TRIGGER_FIX_MANUAL_STEPS.md`
