# PRD Table Cleanup - Ready for Execution


## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: database, api, testing, e2e

**Date**: 2025-10-16
**Status**: ✅ Ready (Dry-run successful)
**Estimated Time**: ~5 minutes

---

## Quick Summary

You currently have **two PRD tables** that need consolidation:

| Table | Records | Status | Action |
|-------|---------|--------|--------|
| `prds` | 9 | Deprecated | ❌ DROP |
| `product_requirements_v2` | 149 | Active | ✅ KEEP |

**Migration needed**: 6 orphaned records from `prds` → `product_requirements_v2`

**Code updates needed**: 23 files with `from('prds')` references

---

## What Was Created

### 1. Comprehensive Analysis Report
**File**: `/mnt/c/_EHG/EHG_Engineer/docs/migrations/PRD_TABLE_CONSOLIDATION_REPORT.md`

Complete analysis including:
- Schema comparison (12 vs 50 columns)
- Data analysis (orphaned records)
- Foreign key dependencies
- Code usage statistics (30 files reference `prds`, 271 reference `product_requirements_v2`)
- Risk assessment
- Decision matrix
- Rollback plan

### 2. Automated Migration Script
**File**: `/mnt/c/_EHG/EHG_Engineer/scripts/migrate-prds-to-v2.js`

Features:
- ✅ Dry-run mode tested successfully
- ✅ Data migration with field mapping
- ✅ Automatic code updates (23 files)
- ✅ Backup creation before deletion
- ✅ Comprehensive verification
- ✅ Rollback instructions

### 3. SQL Migration (Alternative)
**File**: `/mnt/c/_EHG/EHG_Engineer/migrations/cleanup-deprecated-prds-table.sql`

Direct SQL migration with:
- Data migration logic
- Backup creation
- Table drop
- Verification queries

---

## Dry-Run Results (Successful!)

```
📊 STEP 1: Analyzing current state...
   prds table: 9 records
   product_requirements_v2 table: 149 records
   Orphaned records (need migration): 6

📦 STEP 2: Migrating orphaned data...
   [DRY RUN] 6 records would be migrated

🗑️  STEP 3: Executing SQL migration...
   [DRY RUN] Would create backup: prds_backup_20251016
   [DRY RUN] Would drop table: prds

📝 STEP 4: Updating code references...
   [DRY RUN] 23 files would be updated

✅ STEP 5: Verification
   product_requirements_v2 final count: 149

✅ Migration script completed successfully
```

---

## Orphaned Records to Migrate

| ID | Title | Status |
|----|-------|--------|
| `00ecb9a6-b3fb-4dc1-bc31-bca7b8db6d2f` | Venture Documents - Pragmatic File Management | active |
| `49095549-e6a9-48a0-8ed9-c2a1208de63a` | Venture Timeline Tab - Gantt & Milestone Visualization | active |
| `PRD-BACKEND-001` | Critical UI Stub Completion - EVA Realtime Voice | approved |
| `f6e61384-c51e-470d-978b-00283c7d5cba` | Settings Section Implementation | approved |
| `60352950-274f-473f-a7ff-5e22bbc885e4` | Navigation and UX Enhancement Implementation Plan | approved |
| `PRD-SD-1B` | Stage-1 Emergent Ideation Engine Documentation Framework | approved |

---

## Files to be Updated (23 total)

### API Endpoints (4 files)
- `./pages/api/leo/gate-scores.ts`
- `./pages/api/leo/metrics.ts`
- `./pages/api/leo/sub-agent-reports.ts`
- `./lib/agents/plan-verification-tool.js`

### Scripts (15 files)
- `./scripts/apply-gap-remediation.js`
- `./scripts/apply-remediation-polish.js`
- `./scripts/check-sd-051-status.js`
- `./scripts/create-prd-retro-enhance-001.js`
- `./scripts/create-prd-sd-047a-v2.js`
- `./scripts/create-prd-sd-047a.js`
- `./scripts/create-prd-sd-047b.js`
- `./scripts/create-prd-sd-backend-001.js`
- `./scripts/create-prd-sd-uat-020.js`
- `./scripts/design-ui-ux-audit.js`
- `./scripts/generate-comprehensive-retrospective.js`
- `./scripts/generate-retrospective.js`
- `./scripts/lead-approval-checklist.js`
- `./scripts/update-prd-fields.js`

### Tools (4 files)
- `./src/services/database-loader/index.ts`
- `./tools/gates/lib/rules.ts`
- `./tools/migrations/prd-filesystem-to-database.ts`
- `./tools/subagents/scan.ts`
- `./tools/validators/exec-checklist.ts`

---

## Execution Options

### Option 1: Automated (Recommended)
```bash
# Run the migration script
node scripts/migrate-prds-to-v2.js
```

**What it does**:
1. ✅ Migrates 6 orphaned records
2. ✅ Creates backup table (`prds_backup_20251016`)
3. ✅ Drops `prds` table
4. ✅ Updates 23 code files
5. ✅ Verifies migration success

**Time**: ~2 minutes

### Option 2: Manual SQL (Alternative)
```bash
# Navigate to project root
cd /mnt/c/_EHG/EHG_Engineer

# Load database connection
source .env

# Execute migration
node -e "
import('./scripts/lib/supabase-connection.js').then(async ({ createDatabaseClient }) => {
  const client = await createDatabaseClient('engineer');
  const { readFileSync } = await import('fs');
  const sql = readFileSync('./migrations/cleanup-deprecated-prds-table.sql', 'utf8');
  await client.query(sql);
  await client.end();
  console.log('Migration complete');
});
"

# Then manually update code files
```

**Time**: ~10 minutes (includes manual code updates)

---

## Verification Checklist

After running migration, verify:

### Immediate (5 minutes)
- [ ] Migration script completed without errors
- [ ] Backup table exists: `prds_backup_20251016`
- [ ] `prds` table no longer exists
- [ ] `product_requirements_v2` has 155 records (149 + 6 migrated)
- [ ] 23 code files updated successfully

### Testing (15 minutes)
- [ ] Run: `npm run test:unit` (passes)
- [ ] Run: `npm run test:e2e` (passes)
- [ ] Test gate scores API: `curl http://localhost:3000/api/leo/gate-scores`
- [ ] Test metrics API: `curl http://localhost:3000/api/leo/metrics`
- [ ] Generate retrospective: `node scripts/generate-comprehensive-retrospective.js SD-XXX`

### Manual spot-checks (10 minutes)
- [ ] Dashboard loads without errors
- [ ] PRD list displays correctly
- [ ] Create new PRD works
- [ ] Update existing PRD works
- [ ] Sub-agent reports generate correctly

---

## Rollback Plan (If Needed)

**If something goes wrong**:

```bash
# 1. Restore prds table from backup
node -e "
import('./scripts/lib/supabase-connection.js').then(async ({ createDatabaseClient }) => {
  const client = await createDatabaseClient('engineer');
  await client.query('CREATE TABLE prds AS SELECT * FROM prds_backup_20251016');
  await client.end();
  console.log('Table restored');
});
"

# 2. Revert code changes
git checkout -- $(git diff --name-only | grep -E '\.(js|ts|tsx)$')

# 3. Verify rollback
node scripts/migrate-prds-to-v2.js --dry-run
```

---

## Post-Migration Cleanup (30 days later)

After verifying stability for 30 days:

```sql
-- Drop the backup table
DROP TABLE prds_backup_20251016;
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss | Very Low | High | Automatic backup created |
| Code breaks | Low | Medium | Automated updates + tests |
| Rollback needed | Very Low | Low | Full rollback plan |

**Overall Risk**: **Very Low** ✅

---

## Recommendation

**✅ PROCEED** with migration because:

1. Dry-run completed successfully
2. Only 6 records need migration (small dataset)
3. Automated script handles all steps
4. Full backup + rollback plan in place
5. Eliminates confusion from duplicate tables
6. Fixes root cause (not workaround)

---

## Next Steps

**Execute migration**:
```bash
cd /mnt/c/_EHG/EHG_Engineer
node scripts/migrate-prds-to-v2.js
```

**Then verify**:
```bash
npm run test:unit
npm run test:e2e
```

**Then commit**:
```bash
git add -A
git commit -m "refactor(database): Consolidate PRD tables to product_requirements_v2

- Migrate 6 orphaned records from prds to product_requirements_v2
- Update 23 code files to use consolidated table
- Drop deprecated prds table (backup created)
- Fix root cause of table naming confusion

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

**Questions?** Review the detailed analysis in:
`/mnt/c/_EHG/EHG_Engineer/docs/migrations/PRD_TABLE_CONSOLIDATION_REPORT.md`
