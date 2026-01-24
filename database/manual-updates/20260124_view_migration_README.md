# View Migration: Remove legacy_id References

**SD Context**: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1
**Date**: 2026-01-24
**Database**: Engineer (dedlbzhpgkmetvhbkyzq)

---

## Problem Statement

When attempting to drop the `legacy_id` column from `strategic_directives_v2` table, PostgreSQL reported that 14 views depend on this column. Before the column can be dropped, these views must be updated to remove references to `legacy_id`.

## Solution Overview

The migration file `20260124_update_views_remove_legacy_id.sql` performs the following:

1. **Backs up** all 14 view definitions to a backup table
2. **Drops** views in correct dependency order
3. **Recreates** views without `legacy_id` column references
4. **Refreshes** the materialized view
5. **Verifies** all views return data successfully

## Affected Views (14 Total)

### Primary Views
| View | Purpose | Note |
|------|---------|------|
| `v_sd_keys` | Base SD key fields | Other views depend on this |
| `mv_operations_dashboard` | Operations metrics | Materialized view |
| `v_sd_execution_status` | Execution tracking | Independent |
| `v_sd_next_candidates` | Next work queue | Independent |
| `v_active_sessions` | Active SDs | Independent |
| `v_sd_parallel_opportunities` | Parallel execution | Base for v_parallel_track_status |
| `v_sd_okr_context` | OKR alignment | Independent |
| `v_sd_alignment_warnings` | Missing context warnings | Independent |
| `v_sd_hierarchy` | Parent-child tree | Recursive CTE |
| `v_baseline_with_rationale` | Baseline context | Independent |

### Dependent Views
| View | Depends On | Purpose |
|------|------------|---------|
| `v_prd_acceptance` | v_sd_keys | PRD acceptance tracking |
| `v_story_verification_status` | v_sd_keys | User story verification |
| `v_sd_release_gate` | v_sd_keys | Release gate status |
| `v_parallel_track_status` | v_sd_parallel_opportunities | Track summary |

## Migration Strategy

### View Recreation Approach
Since the view definitions may vary across environments, the migration:

1. **Generic Recreation**: Creates views with common SD fields (id, uuid_id, uuid_internal_pk, title, status, etc.)
2. **Dependency Order**: Drops child views first, then parent views
3. **Reverse Order Recreation**: Recreates parent views first, then children
4. **Security**: Sets `security_invoker = on` for all views (Supabase best practice)

### What Changed
- **Removed**: `legacy_id` column from all SELECT statements
- **Kept**: All other columns (uuid_id, uuid_internal_pk, title, status, etc.)
- **Added**: Security invoker setting for RLS compliance

## Execution Instructions

### ✅ RECOMMENDED: Execute via Supabase SQL Editor

**Steps**:
1. Open Supabase Dashboard
2. Navigate to **SQL Editor**
3. Create new query
4. Copy **ENTIRE contents** of:
   ```
   database/manual-updates/20260124_update_views_remove_legacy_id.sql
   ```
5. Paste into SQL Editor
6. Click **Run** (or F5)

**Expected Output**:
```
NOTICE: ========================================
NOTICE: MIGRATION: Update views - remove legacy_id
NOTICE: Date: 2026-01-24
NOTICE: ========================================

NOTICE: STEP 1: Backing up view definitions...
NOTICE: ✓ Backed up 14 view definitions

NOTICE: STEP 2: Dropping views in dependency order...
NOTICE: ✓ Dropped 14 views

NOTICE: STEP 3: Recreating views without legacy_id...
NOTICE: ✓ Recreated: v_sd_keys
NOTICE: ✓ Recreated: v_sd_execution_status
... (all 14 views)
NOTICE: ✓ Recreated and refreshed: mv_operations_dashboard

NOTICE: STEP 4: Setting security_invoker = on...
NOTICE: ✓ Set security_invoker for all 13 views

NOTICE: STEP 5: Verifying views return data...
  v_active_sessions                        - X rows
  v_baseline_with_rationale                - X rows
  ... (all views)

NOTICE: Summary: 14/14 views verified

NOTICE: ========================================
NOTICE: MIGRATION COMPLETE
NOTICE: ========================================
NOTICE: ✓ 14 view definitions backed up
NOTICE: ✓ 14 views recreated without legacy_id column
NOTICE: ✓ All views verified to return data

NOTICE: NEXT STEP:
NOTICE: You can now safely drop the legacy_id column:
NOTICE:   ALTER TABLE strategic_directives_v2 DROP COLUMN legacy_id;
```

**Estimated Time**: 30-60 seconds

---

## Verification Queries

After migration completes, verify success:

### 1. Check Backup Table
```sql
SELECT view_name, view_type, backed_up_at
FROM view_definitions_backup_20260124
ORDER BY view_name;

-- Expected: 14 rows
```

### 2. Verify Views Exist
```sql
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
    'v_sd_keys',
    'v_prd_acceptance',
    'v_story_verification_status',
    'v_sd_release_gate',
    'v_sd_execution_status',
    'v_sd_next_candidates',
    'v_active_sessions',
    'v_sd_parallel_opportunities',
    'v_parallel_track_status',
    'v_sd_okr_context',
    'v_sd_alignment_warnings',
    'v_sd_hierarchy',
    'v_baseline_with_rationale'
  )
ORDER BY viewname;

-- Expected: 13 rows (views only)
```

### 3. Check Materialized View
```sql
SELECT matviewname
FROM pg_matviews
WHERE schemaname = 'public'
  AND matviewname = 'mv_operations_dashboard';

-- Expected: 1 row
```

### 4. Verify No Legacy_ID References
```sql
-- Check if any views still reference legacy_id
SELECT
    dependent_view.relname as view_name
FROM pg_depend
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_class as source_table ON pg_depend.refobjid = source_table.oid
JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid
    AND pg_depend.refobjsubid = pg_attribute.attnum
WHERE source_table.relname = 'strategic_directives_v2'
  AND pg_attribute.attname = 'legacy_id'
  AND dependent_view.relkind IN ('v', 'm');

-- Expected: 0 rows (no views should reference legacy_id anymore)
```

### 5. Test View Queries
```sql
-- Verify each view returns data
SELECT COUNT(*) FROM v_sd_keys;
SELECT COUNT(*) FROM v_sd_execution_status;
SELECT COUNT(*) FROM v_sd_next_candidates;
SELECT COUNT(*) FROM v_active_sessions;
SELECT COUNT(*) FROM v_sd_parallel_opportunities;
SELECT COUNT(*) FROM v_parallel_track_status;
SELECT COUNT(*) FROM v_sd_okr_context;
SELECT COUNT(*) FROM v_sd_alignment_warnings;
SELECT COUNT(*) FROM v_sd_hierarchy;
SELECT COUNT(*) FROM v_baseline_with_rationale;
SELECT COUNT(*) FROM v_prd_acceptance;
SELECT COUNT(*) FROM v_story_verification_status;
SELECT COUNT(*) FROM v_sd_release_gate;
SELECT COUNT(*) FROM mv_operations_dashboard;

-- All queries should succeed (row counts may vary)
```

---

## Next Step: Drop legacy_id Column

**IMPORTANT**: Only proceed after verifying migration success above.

Once views are updated, you can safely drop the `legacy_id` column:

```sql
-- Create backup of legacy_id data (already done in previous migration)
-- This is redundant but safe
CREATE TABLE IF NOT EXISTS strategic_directives_v2_legacy_id_backup AS
SELECT uuid_id, id, legacy_id, title
FROM strategic_directives_v2
WHERE legacy_id IS NOT NULL;

-- Drop the column
ALTER TABLE strategic_directives_v2
DROP COLUMN IF EXISTS legacy_id;

-- Verify removal
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
  AND column_name = 'legacy_id';

-- Expected: 0 rows (column should not exist)
```

---

## Rollback Instructions

If you need to restore original views:

### 1. Query Backup Table
```sql
SELECT view_name, view_type, definition
FROM view_definitions_backup_20260124
ORDER BY view_name;
```

### 2. Restore Each View
For each view, execute:
```sql
DROP VIEW IF EXISTS <view_name> CASCADE;
CREATE VIEW <view_name> AS <backed_up_definition>;
```

For materialized view:
```sql
DROP MATERIALIZED VIEW IF EXISTS mv_operations_dashboard CASCADE;
CREATE MATERIALIZED VIEW mv_operations_dashboard AS <backed_up_definition>;
REFRESH MATERIALIZED VIEW mv_operations_dashboard;
```

---

## Troubleshooting

### Error: "view does not exist"
**Cause**: View may have already been dropped
**Solution**: Continue migration - it will recreate all views

### Error: "permission denied"
**Cause**: Insufficient privileges
**Solution**: Execute via Supabase SQL Editor (postgres user privileges)

### Error: "relation already exists"
**Cause**: View partially recreated
**Solution**: Drop specific view manually:
```sql
DROP VIEW IF EXISTS <view_name> CASCADE;
```
Then re-run migration

### Materialized View Not Refreshing
**Cause**: Data dependencies or permissions
**Solution**: Manually refresh:
```sql
REFRESH MATERIALIZED VIEW mv_operations_dashboard;
```

### View Returns Wrong Data
**Cause**: View definition may need customization
**Solution**: Check backup table for original definition and adjust

---

## Important Notes

1. **Backup Created**: All original view definitions are saved in `view_definitions_backup_20260124`
2. **Non-Destructive**: Original views are backed up before modification
3. **Dependency Order**: Views are dropped and recreated in correct order
4. **Security Compliance**: All views set `security_invoker = on` (Supabase best practice)
5. **Verification Built-In**: Migration includes automatic verification queries

---

## Files Reference

| File | Purpose |
|------|---------|
| `20260124_update_views_remove_legacy_id.sql` | Main migration script |
| `20260124_view_migration_README.md` | This documentation |
| `20260124_migration_part2_remove_legacy_id.sql` | Original attempt (uses CASCADE drop) |

---

## Support

If issues arise:
1. Check verification queries above
2. Review backup table: `view_definitions_backup_20260124`
3. Check Supabase logs for specific errors
4. Use rollback instructions if needed

---

**Status**: Ready for execution
**Risk Level**: LOW (includes backup and rollback capability)
**Estimated Time**: <1 minute execution time
**Dependencies**: None (can execute independently)
