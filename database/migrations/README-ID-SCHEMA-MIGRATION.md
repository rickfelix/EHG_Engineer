# ID Schema Standardization Migration

## Problem Statement

The database has **inconsistent ID schema** across Strategic Directives and PRDs:

- **strategic_directives_v2.id**: 77% use `sd_key` format, 23% use UUID
- **product_requirements_v2.directive_id**: 68% use `sd_key`, 2% use UUID, 31% NULL
- **No foreign key constraint** linking PRDs to SDs
- **Handoff system breaks** when SD uses UUID but PRD has sd_key

This causes:
- ❌ Handoff failures
- ❌ JOIN queries fail
- ❌ No referential integrity
- ❌ Orphaned PRDs possible

## Solution Overview

3-phase migration to standardize on UUID for all relationships:

1. **Phase 1**: Add new UUID columns (additive, backward compatible)
2. **Phase 2**: Add foreign key constraint (enforces integrity)
3. **Phase 3**: Update application code to use new columns

## Migration Steps

### Prerequisites

```bash
# 1. Backup database
pg_dump -h <host> -U postgres -d <database> > backup_$(date +%Y%m%d).sql

# 2. Verify current state
node scripts/migrate-id-schema-verify.mjs
# Should show failures - expected before migration
```

### Phase 1: Add UUID Columns

**What it does:**
- Adds `strategic_directives_v2.uuid_id` column (all UUIDs)
- Adds `product_requirements_v2.sd_uuid` column (foreign key to uuid_id)
- Populates both columns from existing data
- Creates indexes for performance

**Execute:**

```bash
# Option A: Using Supabase SQL Editor
# 1. Open Supabase Dashboard → SQL Editor
# 2. Paste contents of migrate-id-schema-phase1.sql
# 3. Run query

# Option B: Using psql
psql $DATABASE_URL < database/migrations/migrate-id-schema-phase1.sql

# Option C: Using migration script (if available)
node scripts/execute-database-sql.js database/migrations/migrate-id-schema-phase1.sql
```

**Verify:**

```bash
node scripts/migrate-id-schema-verify.mjs
# Should now show ALL TESTS PASSED
```

**Expected output:**
```
✅ All 159 SDs have uuid_id
✅ All 73 PRDs with directive_id have sd_uuid
✅ No orphaned PRDs
✅ All UUIDs valid format
```

### Phase 2: Add Foreign Key Constraint

**What it does:**
- Adds FK constraint `fk_prd_sd` linking PRD.sd_uuid → SD.uuid_id
- Enables CASCADE delete/update
- Allows Supabase to auto-generate JOIN relationships

**Execute:**

```bash
# IMPORTANT: Only run after Phase 1 verification passes!

# Option A: Supabase SQL Editor
# Paste contents of migrate-id-schema-phase2.sql

# Option B: psql
psql $DATABASE_URL < database/migrations/migrate-id-schema-phase2.sql
```

**Verify:**

```bash
# Test FK constraint exists
psql $DATABASE_URL -c "SELECT constraint_name FROM information_schema.table_constraints WHERE constraint_name = 'fk_prd_sd';"

# Should return: fk_prd_sd

# Test JOIN works
node -e "
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data } = await supabase.from('product_requirements_v2').select('id, strategic_directives_v2(sd_key)').limit(1);
console.log('JOIN result:', data);
"
```

### Phase 3: Update Application Code

**Files to update:**

1. **Handoff System** (HIGH PRIORITY)
   ```bash
   # Update unified-handoff-system.js
   # Change: .eq('directive_id', sdId)
   # To:     .eq('sd_uuid', sdId)
   ```

2. **PRD Creation Scripts** (20 files)
   ```bash
   # Add import
   import { createPRDLink } from './lib/sd-helpers.js';

   # Update PRD object
   const prd = {
     id: `PRD-${crypto.randomUUID()}`,
     ...await createPRDLink('SD-QUALITY-002'),
     // ... rest of PRD
   };
   ```

3. **Dashboard Components**
   ```javascript
   // Can now use native FK JOINs
   const { data } = await supabase
     .from('product_requirements_v2')
     .select('*, strategic_directives_v2!fk_prd_sd(sd_key, title)');
   ```

## Rollback Instructions

### If Phase 1 fails:
- Transaction auto-rolls back
- No manual action needed

### If Phase 2 fails:
- Transaction auto-rolls back
- No manual action needed

### If need to rollback after commit:

```sql
-- Phase 2 rollback (remove FK)
ALTER TABLE product_requirements_v2 DROP CONSTRAINT fk_prd_sd;

-- Phase 1 rollback (remove columns)
ALTER TABLE strategic_directives_v2 DROP COLUMN uuid_id;
ALTER TABLE product_requirements_v2 DROP COLUMN sd_uuid;
```

## Testing Checklist

After migration:

- [ ] Run verification script: `node scripts/migrate-id-schema-verify.mjs`
- [ ] Test handoff: `node scripts/unified-handoff-system.js execute LEAD-to-PLAN <SD_UUID>`
- [ ] Test PRD creation with new schema
- [ ] Test dashboard loads correctly
- [ ] Test CASCADE delete (create test SD + PRD, delete SD, verify PRD deleted)

## Timeline

- **Phase 1**: 30 minutes (migration + verification)
- **Phase 2**: 15 minutes (FK constraint + verification)
- **Phase 3**: Week 2-3 (update 20 scripts + handoff system + dashboard)

## Impact

- **Database**: 159 SDs, 108 PRDs affected
- **Code**: ~25 files need updates
- **Risk**: LOW (additive changes, backward compatible during transition)
- **Downtime**: ZERO (can run on live database)

## Support

Questions? Check:
1. Verification script output: `scripts/migrate-id-schema-verify.mjs`
2. Helper functions: `lib/sd-helpers.js`
3. Migration SQL comments: `database/migrations/migrate-id-schema-phase*.sql`

## Quick Reference

```bash
# Full migration sequence
cd /mnt/c/_EHG/EHG_Engineer

# 1. Backup
pg_dump ... > backup.sql

# 2. Phase 1
psql $DATABASE_URL < database/migrations/migrate-id-schema-phase1.sql

# 3. Verify
node scripts/migrate-id-schema-verify.mjs

# 4. Phase 2
psql $DATABASE_URL < database/migrations/migrate-id-schema-phase2.sql

# 5. Update code (manual)
# - unified-handoff-system.js
# - create-prd-*.js scripts
# - dashboard components

# 6. Test
node scripts/unified-handoff-system.js execute LEAD-to-PLAN <UUID>
```
