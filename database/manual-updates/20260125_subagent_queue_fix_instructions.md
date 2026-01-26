# Sub-Agent Queue Type Fix Migration

**Issue**: `sub_agent_queue.sd_id` has type mismatch with `strategic_directives_v2.id`

**Status**: Ready to execute
**Created**: 2026-01-25
**Related SD**: SD-LEO-ENH-AUTO-PROCEED-001-12

## Problem Statement

The `trg_subagent_automation` trigger on `strategic_directives_v2` fails with:
```
invalid input syntax for type uuid: "SD-LEO-ENH-AUTO-PROCEED-001-12"
```

**Root Cause**:
- File `database/migrations/create-subagent-automation.sql` defines `sub_agent_queue.sd_id` as UUID
- But `strategic_directives_v2.id` is VARCHAR(50) containing values like "SD-LEO-ENH-AUTO-PROCEED-001-12"
- Function `queue_required_subagents(p_sd_id UUID, ...)` expects UUID but receives VARCHAR

## Files Created

1. **Migration SQL**: `database/migrations/20260125_fix_subagent_queue_sd_id_type.sql` (7KB)
2. **Execution Script**: `scripts/execute-subagent-queue-fix-migration.js`
3. **Instructions**: This file

## Option 1: Execute via Node.js Script (Recommended)

### Prerequisites
Set database password in `.env`:
```bash
# Add to .env file:
SUPABASE_DB_PASSWORD=your-database-password-here

# Or:
EHG_DB_PASSWORD=your-database-password-here
```

Get password from: Supabase Dashboard > Project Settings > Database > Database Password

### Execute
```bash
node scripts/execute-subagent-queue-fix-migration.js
```

The script will:
1. ✅ Check if `sub_agent_queue` table exists
2. ✅ Verify current column type
3. ✅ Execute migration if needed
4. ✅ Run verification queries
5. ✅ Display summary

## Option 2: Execute via Supabase Dashboard (Manual)

If you cannot set the database password in `.env`, execute manually:

### Steps

1. **Open Supabase Dashboard**:
   - Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
   - Navigate to: SQL Editor

2. **Copy SQL from**:
   - File: `database/migrations/20260125_fix_subagent_queue_sd_id_type.sql`

3. **Execute the SQL**:
   - Paste into SQL Editor
   - Click "Run"

4. **Verify the fix**:
   ```sql
   -- Check column types match
   SELECT
     'sub_agent_queue.sd_id' as column_name,
     data_type,
     character_maximum_length
   FROM information_schema.columns
   WHERE table_name = 'sub_agent_queue' AND column_name = 'sd_id'

   UNION ALL

   SELECT
     'strategic_directives_v2.id' as column_name,
     data_type,
     character_maximum_length
   FROM information_schema.columns
   WHERE table_name = 'strategic_directives_v2' AND column_name = 'id';
   ```

   **Expected Output**:
   ```
   column_name                | data_type          | character_maximum_length
   ---------------------------+--------------------+-------------------------
   sub_agent_queue.sd_id      | character varying  | 50
   strategic_directives_v2.id | character varying  | 50
   ```

5. **Test the fix**:
   ```sql
   -- This should now work without UUID errors
   UPDATE strategic_directives_v2
   SET status = 'completed'
   WHERE id = 'SD-LEO-ENH-AUTO-PROCEED-001-12'
     AND status != 'completed';
   ```

## What the Migration Does

1. **Drops dependent objects** (views, functions)
2. **Alters column type**: `sub_agent_queue.sd_id` from UUID to VARCHAR(50)
3. **Recreates foreign key**: `sub_agent_queue.sd_id` → `strategic_directives_v2.id`
4. **Recreates functions** with VARCHAR(50) parameter:
   - `queue_required_subagents(p_sd_id VARCHAR(50), ...)`
   - `check_subagent_completion(p_sd_id VARCHAR(50))`
   - `validate_lead_approval(p_sd_id VARCHAR(50))`
   - `complete_subagent_work(p_queue_id UUID, p_result JSONB)`
5. **Recreates view**: `v_pending_subagent_work`

## Safety Considerations

- **Idempotent**: Can be run multiple times safely
- **Checks existence**: Uses `DROP IF EXISTS` for all objects
- **Preserves data**: `ALTER COLUMN ... TYPE` preserves existing rows
- **Transaction-safe**: All DDL statements are atomic
- **No data loss**: UUID values convert cleanly to VARCHAR(50)

## Verification Checklist

After migration, verify:

- [ ] `sub_agent_queue.sd_id` is `character varying(50)`
- [ ] Foreign key constraint exists: `sub_agent_queue_sd_id_fkey`
- [ ] Function `queue_required_subagents` has `p_sd_id VARCHAR(50)` parameter
- [ ] Function `check_subagent_completion` has `p_sd_id VARCHAR(50)` parameter
- [ ] Function `validate_lead_approval` has `p_sd_id VARCHAR(50)` parameter
- [ ] View `v_pending_subagent_work` exists
- [ ] Trigger `trg_subagent_automation` works without UUID errors

## Post-Migration Test

```sql
-- Test trigger execution (should not error)
UPDATE strategic_directives_v2
SET status = 'in_progress'
WHERE id = 'SD-LEO-ENH-AUTO-PROCEED-001-12';

-- Check sub_agent_queue for queued items
SELECT * FROM sub_agent_queue
WHERE sd_id = 'SD-LEO-ENH-AUTO-PROCEED-001-12';

-- Check view
SELECT * FROM v_pending_subagent_work
WHERE sd_id = 'SD-LEO-ENH-AUTO-PROCEED-001-12';
```

## Rollback (if needed)

⚠️ **Not recommended** - This migration fixes a critical bug. Rolling back would restore the broken state.

If absolutely necessary:
```sql
-- Rollback would require converting back to UUID
-- This is not recommended and may cause data loss if non-UUID values exist
-- DO NOT EXECUTE unless you understand the consequences
```

## Related Issues

- **Root Issue**: SD-LEO-ENH-AUTO-PROCEED-001-12
- **Original Migration**: `database/migrations/create-subagent-automation.sql`
- **Related Migration**: `database/migrations/028_fix_sub_agent_id_type_mismatch.sql` (different tables)

## Next Steps

After migration completes:

1. ✅ Test SD status updates work without UUID errors
2. ✅ Regenerate schema docs: `npm run schema:docs:all`
3. ✅ Mark this issue as resolved in SD-LEO-ENH-AUTO-PROCEED-001-12
4. ✅ Update `create-subagent-automation.sql` to prevent future issues

## Questions?

If migration fails or you encounter issues:
1. Check Supabase logs for detailed error messages
2. Verify database password is correct
3. Ensure you have sufficient permissions
4. Contact database administrator if needed
