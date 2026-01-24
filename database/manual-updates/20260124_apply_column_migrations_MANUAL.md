# Manual Database Migration Guide

## SD Context
- **SD-LEO-GEN-RENAME-COLUMNS-SELF-001-C**: Add uuid_internal_pk column
- **SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D**: Remove legacy_id column

## Prerequisites
Access to Supabase SQL Editor with elevated privileges (service role or postgres user).

---

## Option 1: Execute via Node.js Script (Preferred)

### Step 1: Set Database Password in .env
Add the following to your `.env` file:
```bash
SUPABASE_DB_PASSWORD=your-database-password-here
```

Get your database password from:
**Supabase Dashboard > Project Settings > Database > Database password**

If you don't remember it, you can reset it (wait 1-2 minutes after reset).

### Step 2: Run Migration Script
```bash
node scripts/apply-column-migrations.js
```

The script will:
1. Add `uuid_internal_pk` column
2. Copy data from `uuid_id`
3. Create bidirectional sync trigger
4. Verify all rows are synced
5. Backup `legacy_id` data
6. Remove `legacy_id` column
7. Verify final schema

---

## Option 2: Manual Execution via Supabase SQL Editor

If you cannot set the database password or prefer manual control:

### Step 1: Open Supabase SQL Editor
1. Go to Supabase Dashboard
2. Select your project (dedlbzhpgkmetvhbkyzq)
3. Navigate to **SQL Editor**
4. Create a new query

### Step 2: Execute Migration 1 - Add uuid_internal_pk

Copy and paste the ENTIRE contents of:
```
database/migrations/20260124_rename_uuid_id_to_uuid_internal_pk.sql
```

Click **Run** (or press F5).

**Expected Output:**
```
NOTICE: Added uuid_internal_pk column
NOTICE: SUCCESS: All <N> rows synced
```

### Step 3: Verify Migration 1

Run this query:
```sql
-- Check column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
  AND column_name IN ('uuid_id', 'uuid_internal_pk')
ORDER BY column_name;

-- Verify sync
SELECT
  COUNT(*) as total_rows,
  COUNT(CASE WHEN uuid_id = uuid_internal_pk THEN 1 END) as synced_rows
FROM strategic_directives_v2;
```

**Expected:**
- Both columns should exist
- `total_rows` should equal `synced_rows`

### Step 4: Execute Migration 2 - Remove legacy_id

Copy and paste the ENTIRE contents of:
```
database/migrations/20260124_remove_legacy_id.sql
```

Click **Run** (or press F5).

**Expected Output:**
```
NOTICE: SUCCESS: legacy_id column removed
```

### Step 5: Verify Migration 2

Run this query:
```sql
-- Check legacy_id is gone
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
  AND column_name = 'legacy_id';

-- Check backup table exists
SELECT COUNT(*) as backup_rows
FROM strategic_directives_v2_legacy_id_backup;

-- Final schema
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'strategic_directives_v2'
ORDER BY ordinal_position;
```

**Expected:**
- No `legacy_id` column in strategic_directives_v2
- Backup table exists with rows (if any legacy_id values existed)
- `uuid_internal_pk` column exists

---

## Verification Checklist

After successful execution:

- [ ] `uuid_internal_pk` column exists in `strategic_directives_v2`
- [ ] All rows have matching `uuid_id` and `uuid_internal_pk` values
- [ ] Sync trigger `trg_sync_uuid_internal_pk` exists
- [ ] `legacy_id` column is removed from `strategic_directives_v2`
- [ ] Backup table `strategic_directives_v2_legacy_id_backup` exists

---

## Rollback (If Needed)

### Rollback Migration 2 (Restore legacy_id)
```sql
BEGIN;

-- Restore column
ALTER TABLE strategic_directives_v2 ADD COLUMN legacy_id INT;

-- Restore data from backup
UPDATE strategic_directives_v2 sd
SET legacy_id = b.legacy_id
FROM strategic_directives_v2_legacy_id_backup b
WHERE sd.uuid_id = b.uuid_id;

COMMIT;
```

### Rollback Migration 1 (Remove uuid_internal_pk)
```sql
BEGIN;

-- Drop trigger
DROP TRIGGER IF EXISTS trg_sync_uuid_internal_pk ON strategic_directives_v2;
DROP FUNCTION IF EXISTS sync_uuid_internal_pk();

-- Drop column
ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS uuid_internal_pk;

COMMIT;
```

---

## Troubleshooting

### Error: "column uuid_internal_pk already exists"
**Solution**: Migration 1 was already partially applied. Run verification queries to check sync status.

### Error: "column legacy_id does not exist"
**Solution**: Migration 2 was already applied. Check backup table exists.

### Error: "permission denied"
**Solution**: You need elevated privileges. Use Supabase SQL Editor with postgres user.

### Sync trigger not working
**Solution**: Check trigger exists:
```sql
SELECT trigger_name, event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'strategic_directives_v2';
```

---

## Next Steps

After successful migration:
1. Update TypeScript interfaces if needed
2. Update any queries referencing `legacy_id`
3. Monitor application logs for errors
4. Test SD creation/updates to verify triggers work

---

**Migration Files:**
- `database/migrations/20260124_rename_uuid_id_to_uuid_internal_pk.sql`
- `database/migrations/20260124_remove_legacy_id.sql`

**Automation Script:**
- `scripts/apply-column-migrations.js`
