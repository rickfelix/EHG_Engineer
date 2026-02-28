---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# SD Key Fix Guide


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, migration, schema, guide

## Problem: Recurring `sd_key` Constraint Violations

### Symptom
When creating Strategic Directives via scripts, you encounter:
```
Error: null value in column "sd_key" of relation "strategic_directives_v2" violates not-null constraint
```

### Root Cause
The `strategic_directives_v2` table has two fields that must always match:
- `id` (PRIMARY KEY)
- `sd_key` (NOT NULL, must equal `id`)

Scripts often forget to set `sd_key`, causing constraint violations.

## Solutions

### Option 1: Database-Level Fix (RECOMMENDED)

Apply the trigger-based auto-population:

```sql
-- Run this in Supabase SQL Editor or via psql
\i database/schema/fix_sd_key_default.sql
```

Or manually execute:
```sql
CREATE OR REPLACE FUNCTION auto_populate_sd_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.sd_key IS NULL THEN
        NEW.sd_key := NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_populate_sd_key ON strategic_directives_v2;

CREATE TRIGGER trigger_auto_populate_sd_key
    BEFORE INSERT ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION auto_populate_sd_key();
```

**After applying this fix**: Scripts no longer need to manually set `sd_key`.

### Option 2: Script-Level Fix (TEMPORARY)

Until the database trigger is applied, all SD creation scripts MUST include:

```javascript
const sdData = {
  id: 'SD-XXX-YYY',
  sd_key: 'SD-XXX-YYY',  // ← MUST match id
  title: '...',
  // ... rest of fields
};
```

## Verification

Check if the fix is applied:

```javascript
// Create a test SD without sd_key
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .insert({
    id: 'SD-TEST-999',
    // sd_key intentionally omitted
    title: 'Test',
    description: 'Test',
    status: 'draft',
    priority: 'low',
    category: 'test',
    rationale: 'Test',
    scope: 'Test',
    target_application: 'EHG',
    current_phase: 'LEAD'
  })
  .select()
  .single();

if (!error && data.sd_key === 'SD-TEST-999') {
  console.log('✅ Trigger is working! sd_key auto-populated.');
} else {
  console.log('❌ Trigger not applied. Use Option 2 (script-level fix).');
}

// Clean up
await supabase.from('strategic_directives_v2').delete().eq('id', 'SD-TEST-999');
```

## Why Does This Issue Keep Recurring?

### Historical Context
1. `strategic_directives_v2` was created with both `id` and `sd_key` fields
2. Early scripts manually set both fields (redundant)
3. New scripts copied old patterns but missed `sd_key`
4. Database schema didn't enforce auto-population (until now)

### Prevention Strategy
- **Apply database trigger** (Option 1) to eliminate manual setting
- **Update script templates** to include `sd_key` as fallback
- **Add to code review checklist**: Verify SD scripts set `sd_key`

## Related Files
- **Migration**: `database/schema/fix_sd_key_default.sql`
- **Apply Script**: `scripts/apply-sd-key-fix.js`
- **Example SD Script**: `scripts/create-sd-test-001.js`

## Impact
- **Before Fix**: Every SD script needs manual `sd_key = id` assignment
- **After Fix**: Database automatically sets `sd_key = id` when NULL
- **Result**: Zero future constraint violations on this field
