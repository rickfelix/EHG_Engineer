# Database Migration Execution Summary

**Date**: 2026-01-24
**SD Context**: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-C, SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D

---

## What These Migrations Do

1. **Migration 1**: Add `uuid_internal_pk` column to `strategic_directives_v2`
   - Copies data from existing `uuid_id` column
   - Creates bidirectional sync trigger
   - Makes column NOT NULL

2. **Migration 2**: Remove `legacy_id` column from `strategic_directives_v2`
   - Creates backup table first
   - Removes the deprecated column

---

## Execution Options (Choose One)

### ✅ RECOMMENDED: Option 1 - Automated Script

**When to use**: You have database password in `.env` file

**Steps**:
1. Add to `.env` file:
   ```bash
   SUPABASE_DB_PASSWORD=your-database-password
   ```
   (Get from: Supabase Dashboard > Project Settings > Database)

2. Run the script:
   ```bash
   node scripts/apply-column-migrations.js
   ```

**Advantages**:
- ✓ Automatic verification
- ✓ Detailed logging
- ✓ Error handling
- ✓ Shows table structure before/after

---

### ⚡ Option 2 - Single SQL File (Fastest)

**When to use**: Quick execution via Supabase SQL Editor

**Steps**:
1. Open Supabase SQL Editor
2. Copy ENTIRE contents of:
   ```
   database/manual-updates/20260124_consolidated_column_migrations.sql
   ```
3. Paste into SQL Editor
4. Click **Run** (or press F5)

**Advantages**:
- ✓ Single execution
- ✓ Built-in verification
- ✓ Progress logging
- ✓ Summary output

**Expected Output**:
```
========================================
MIGRATION 1: Add uuid_internal_pk column
========================================
✓ Added uuid_internal_pk column
✓ SUCCESS: All N rows synced (uuid_id = uuid_internal_pk)

========================================
MIGRATION 2: Remove legacy_id column
========================================
✓ Backed up N legacy_id values
✓ SUCCESS: legacy_id column removed

========================================
FINAL VERIFICATION
========================================
Columns in strategic_directives_v2:
  - id: text (nullable: NO)
  - uuid_id: uuid (nullable: NO)
  - uuid_internal_pk: uuid (nullable: NO)
  ... (other columns)

========================================
MIGRATION SUMMARY
========================================
✓ uuid_internal_pk column added
✓ legacy_id column removed

🎉 ALL MIGRATIONS COMPLETED SUCCESSFULLY!
========================================
```

---

### 📝 Option 3 - Individual Migration Files

**When to use**: Step-by-step execution with manual verification

**Steps**:
1. Execute Migration 1:
   ```
   database/migrations/20260124_rename_uuid_id_to_uuid_internal_pk.sql
   ```

2. Verify Migration 1:
   ```sql
   SELECT COUNT(*) as total, COUNT(CASE WHEN uuid_id = uuid_internal_pk THEN 1 END) as synced
   FROM strategic_directives_v2;
   ```

3. Execute Migration 2:
   ```
   database/migrations/20260124_remove_legacy_id.sql
   ```

4. Verify Migration 2:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'strategic_directives_v2' AND column_name = 'legacy_id';
   -- Should return 0 rows
   ```

**Advantages**:
- ✓ Maximum control
- ✓ Can pause between steps
- ✓ Manual verification at each stage

See detailed guide: `database/manual-updates/20260124_apply_column_migrations_MANUAL.md`

---

## Post-Execution Verification

After running ANY option, verify success:

```sql
-- 1. Check columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
  AND column_name IN ('uuid_id', 'uuid_internal_pk', 'legacy_id')
ORDER BY column_name;

-- Expected:
--   uuid_id          | uuid | NO
--   uuid_internal_pk | uuid | NO
--   (no legacy_id row)

-- 2. Verify sync
SELECT
  COUNT(*) as total_rows,
  COUNT(CASE WHEN uuid_id = uuid_internal_pk THEN 1 END) as synced_rows
FROM strategic_directives_v2;

-- Expected: total_rows = synced_rows

-- 3. Check trigger exists
SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'strategic_directives_v2'
  AND trigger_name = 'trg_sync_uuid_internal_pk';

-- Expected: 1 row with INSERT and UPDATE events

-- 4. Check backup table
SELECT COUNT(*) FROM strategic_directives_v2_legacy_id_backup;
```

---

## Rollback Instructions (If Needed)

### Rollback Migration 2 (Restore legacy_id)
```sql
BEGIN;
ALTER TABLE strategic_directives_v2 ADD COLUMN legacy_id INT;
UPDATE strategic_directives_v2 sd
SET legacy_id = b.legacy_id
FROM strategic_directives_v2_legacy_id_backup b
WHERE sd.uuid_id = b.uuid_id;
COMMIT;
```

### Rollback Migration 1 (Remove uuid_internal_pk)
```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_sync_uuid_internal_pk ON strategic_directives_v2;
DROP FUNCTION IF EXISTS sync_uuid_internal_pk();
ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS uuid_internal_pk;
COMMIT;
```

---

## Files Reference

| File | Purpose |
|------|---------|
| `database/migrations/20260124_rename_uuid_id_to_uuid_internal_pk.sql` | Migration 1 (individual) |
| `database/migrations/20260124_remove_legacy_id.sql` | Migration 2 (individual) |
| `database/manual-updates/20260124_consolidated_column_migrations.sql` | Both migrations (combined) |
| `scripts/apply-column-migrations.js` | Automated execution script |
| `database/manual-updates/20260124_apply_column_migrations_MANUAL.md` | Detailed manual guide |
| `database/manual-updates/20260124_EXECUTION_SUMMARY.md` | This file |

---

## Troubleshooting

### Error: "Database password not found"
**Solution**: Add `SUPABASE_DB_PASSWORD=your-password` to `.env` file
**Alternative**: Use Option 2 (SQL file in Supabase SQL Editor)

### Error: "column already exists"
**Solution**: Migration partially applied. Run verification queries to check state.

### Error: "permission denied"
**Solution**: Use Supabase SQL Editor with postgres user (elevated privileges).

### Sync trigger not firing
**Solution**: Check trigger exists:
```sql
SELECT * FROM information_schema.triggers
WHERE event_object_table = 'strategic_directives_v2';
```

---

## Next Steps After Migration

1. ✅ Verify all checks pass
2. ✅ Test SD creation/updates in application
3. ✅ Monitor application logs for errors
4. ✅ Update TypeScript interfaces if needed
5. ✅ Document completion in SD-LEO-GEN-RENAME-COLUMNS-SELF-001-C and D

---

## Support

If issues arise:
1. Check verification queries above
2. Review detailed guide: `20260124_apply_column_migrations_MANUAL.md`
3. Check migration file comments for context
4. Use rollback scripts if needed

---

**Status**: Ready for execution
**Estimated Time**: 1-2 minutes
**Risk Level**: LOW (non-destructive, includes backup and rollback)
