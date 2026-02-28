---
category: database
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [database, auto-generated]
---
# Product Requirements V2 Table Audit Report


## Table of Contents

- [Executive Summary](#executive-summary)
- [Duplicate SDs Found (13 total)](#duplicate-sds-found-13-total)
  - [Critical Duplicates](#critical-duplicates)
  - [High-Priority Duplicates (2+ PRDs each)](#high-priority-duplicates-2-prds-each)
- [Full Duplicate Details](#full-duplicate-details)
  - [Example 1: SD with UUID + Named PRD](#example-1-sd-with-uuid-named-prd)
  - [Example 2: Multiple orchestrator/rename children](#example-2-multiple-orchestratorrename-children)
- [Root Cause Analysis](#root-cause-analysis)
  - [Why Duplicates Occur](#why-duplicates-occur)
  - [Entry Points to Investigate](#entry-points-to-investigate)
- [Recommended Cleanup Strategy](#recommended-cleanup-strategy)
  - [Phase 1: Manual Review (Required)](#phase-1-manual-review-required)
  - [Phase 2: Delete Obsolete PRDs](#phase-2-delete-obsolete-prds)
  - [Phase 3: Add UNIQUE Constraint](#phase-3-add-unique-constraint)
  - [Phase 4: Update Code](#phase-4-update-code)
  - [Phase 5: Add Data Validation Tests](#phase-5-add-data-validation-tests)
- [Impact Assessment](#impact-assessment)
  - [Current Issues](#current-issues)
  - [Benefits of Cleanup](#benefits-of-cleanup)
- [Migration Plan](#migration-plan)
  - [Pre-Migration Checklist](#pre-migration-checklist)
  - [Migration Steps](#migration-steps)
  - [Rollback Plan](#rollback-plan)
- [Next Steps](#next-steps)
- [Appendix: Query Results](#appendix-query-results)
  - [Query 1: Duplicate SDs (Raw Output)](#query-1-duplicate-sds-raw-output)
  - [Query 3: NULL sd_id (Result)](#query-3-null-sd_id-result)

**Date**: 2026-02-06
**Database**: EHG_Engineer (Supabase Project: dedlbzhpgkmetvhbkyzq)
**Table**: product_requirements_v2
**Auditor**: Database Agent (Sonnet 4.5)

---

## Executive Summary

- **Total PRDs**: 653 records
- **Duplicate SDs**: 13 SDs with multiple PRD records (26+ duplicate records)
- **NULL sd_id records**: 0 (all PRDs have sd_id set)
- **Constraint Status**: NO UNIQUE constraint on `sd_id` column
- **Impact**: Multiple PRD records can exist for the same SD, causing data inconsistency

---

## Duplicate SDs Found (13 total)

### Critical Duplicates

1. **SD-PARENT-4.0** - 6 PRD records (!!!)
   - All with status: `in_progress`
   - Created between 2025-12-20 and 2025-12-27
   - Likely caused by multiple orchestrator initialization attempts

### High-Priority Duplicates (2+ PRDs each)

| SD ID | PRD Count | Status Pattern | Date Range |
|-------|-----------|----------------|------------|
| `643da4df-8805-4e66-aac6-4f35b9996942` | 2 | verification → completed | 2026-02-02 |
| `82f3189a-169c-4322-ad7e-aebe2e73aa4e` | 2 | planning → approved | 2026-01-26 |
| `abfe5dd0-089b-41dc-ab38-21dfbe688eca` | 2 | completed (both) | 2026-02-06 |
| `ec7e56f5-b2c4-4dd7-a453-7ec3b2b6f0c9` | 2 | verification → approved | 2026-01-31 |
| `SD-IND-D-STAGES-22-25` | 2 | in_progress → approved | 2025-12-27 |
| `SD-LEO-GEN-RENAME-COLUMNS-SELF-001` | 2 | planning → draft | 2026-01-24 |
| `SD-LEO-GEN-RENAME-COLUMNS-SELF-001-B` | 2 | completed → approved | 2026-01-24 |
| `SD-LEO-GEN-RENAME-COLUMNS-SELF-001-C` | 2 | approved → completed | 2026-01-24 |
| `SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D` | 2 | completed → approved | 2026-01-24 |
| `SD-LEO-GEN-RENAME-COLUMNS-SELF-001-E` | 2 | completed → approved | 2026-01-24 |
| `SD-STAGE-ARCH-001-P10` | 2 | completed (both) | 2025-12-30 |
| `SD-TEST-MGMT-VALIDATION-001` | 2 | in_progress → completed | 2026-01-08 |

---

## Full Duplicate Details

### Example 1: SD with UUID + Named PRD

**SD**: `643da4df-8805-4e66-aac6-4f35b9996942`

| directive_id | status | created_at |
|--------------|--------|------------|
| SD-LEO-SELF-IMPROVE-002C | verification | 2026-02-02T03:31:19.839 |
| 643da4df-8805-4e66-aac6-4f35b9996942 | completed | 2026-02-02T03:46:16.414747 |

**Pattern**: UUID used as both sd_id AND directive_id in second record (likely re-insert bug)

### Example 2: Multiple orchestrator/rename children

**SD Family**: `SD-LEO-GEN-RENAME-COLUMNS-SELF-001-*` (5 children, all have 2 PRDs)

This pattern suggests a systemic issue during orchestrator child creation around 2026-01-24.

---

## Root Cause Analysis

### Why Duplicates Occur

1. **No database constraint** preventing duplicate sd_id values
2. **add-prd-to-database.js** does not check for existing PRD before INSERT
3. **Orchestrator pattern** may create multiple PRDs during initialization/retry
4. **Handoff system** may re-create PRD on phase transitions
5. **UUID as directive_id** pattern allows accidental re-insertion

### Entry Points to Investigate

```bash
# Primary PRD creation script
scripts/add-prd-to-database.js

# Handoff system (LEAD→PLAN, PLAN→EXEC)
scripts/handoff.js
scripts/modules/handoff/*.js

# Orchestrator child creation
scripts/orchestrate-phase-subagents.js
```

---

## Recommended Cleanup Strategy

### Phase 1: Manual Review (Required)

For each duplicate SD, determine which PRD to **keep**:

**Decision criteria**:
1. Keep PRD with **latest created_at** (most recent)
2. Prefer PRD with **completed/approved** status over in_progress
3. If both same status, keep PRD with **matching directive_id = sd_id**
4. **Exception**: SD-PARENT-4.0 (review all 6 manually)

### Phase 2: Delete Obsolete PRDs

```sql
-- Example: Keep latest PRD for SD-PARENT-4.0
-- (Review directive_ids first!)

DELETE FROM product_requirements_v2
WHERE sd_id = 'SD-PARENT-4.0'
  AND created_at < (
    SELECT MAX(created_at)
    FROM product_requirements_v2
    WHERE sd_id = 'SD-PARENT-4.0'
  );
```

**CRITICAL**: Backup table before deletion:
```sql
CREATE TABLE product_requirements_v2_backup_20260206 AS
SELECT * FROM product_requirements_v2;
```

### Phase 3: Add UNIQUE Constraint

After cleanup:

```sql
ALTER TABLE product_requirements_v2
ADD CONSTRAINT product_requirements_v2_sd_id_unique UNIQUE (sd_id);
```

This will **prevent future duplicates** at the database level.

### Phase 4: Update Code

1. **add-prd-to-database.js**:
   - Add `checkExistingPRD(sd_id)` function
   - Use UPSERT pattern instead of INSERT
   - Handle constraint violations gracefully

2. **handoff.js**:
   - Verify PRD existence before creating new one
   - Update existing PRD status instead of inserting

3. **orchestrate-phase-subagents.js**:
   - Check for existing child PRDs before initialization
   - Avoid re-creating PRDs on retry

### Phase 5: Add Data Validation Tests

```javascript
// tests/database/prd-uniqueness.test.js
test('PRD table enforces unique sd_id constraint', async () => {
  // Attempt to insert duplicate sd_id
  // Expect constraint violation error
});

test('add-prd-to-database.js prevents duplicate creation', async () => {
  // Create PRD for SD-TEST-001
  // Attempt to create second PRD for same SD
  // Expect graceful handling (update or skip)
});
```

---

## Impact Assessment

### Current Issues

- **Retrieval ambiguity**: Queries using `sd_id` may return multiple PRDs
- **Orphaned data**: Obsolete PRDs may reference deleted/moved SDs
- **Data integrity**: No single source of truth for SD requirements
- **Audit trail confusion**: Multiple "completed" PRDs for same SD

### Benefits of Cleanup

- **1:1 relationship**: One PRD per SD (enforced at DB level)
- **Query reliability**: `WHERE sd_id = ?` returns single result
- **Data clarity**: Clear audit trail (status transitions in one record)
- **Reduced storage**: ~26+ duplicate records removed (~4% reduction)

---

## Migration Plan

### Pre-Migration Checklist

- [ ] Backup `product_requirements_v2` table
- [ ] Document PRD retention decisions for each duplicate SD
- [ ] Test cleanup SQL on staging database (if available)
- [ ] Notify team of planned downtime (if required)

### Migration Steps

```bash
# 1. Create backup
psql $DATABASE_URL -c "CREATE TABLE product_requirements_v2_backup_20260206 AS SELECT * FROM product_requirements_v2;"

# 2. Generate cleanup script (review manually!)
node scripts/generate-prd-cleanup-sql.js > database/migrations/cleanup-prd-duplicates.sql

# 3. Review cleanup script
cat database/migrations/cleanup-prd-duplicates.sql

# 4. Execute cleanup (DRY RUN FIRST)
psql $DATABASE_URL -f database/migrations/cleanup-prd-duplicates.sql --echo-all --single-transaction

# 5. Verify no duplicates remain
psql $DATABASE_URL -c "SELECT sd_id, COUNT(*) FROM product_requirements_v2 GROUP BY sd_id HAVING COUNT(*) > 1;"

# 6. Add constraint
psql $DATABASE_URL -c "ALTER TABLE product_requirements_v2 ADD CONSTRAINT product_requirements_v2_sd_id_unique UNIQUE (sd_id);"

# 7. Test constraint
psql $DATABASE_URL -c "INSERT INTO product_requirements_v2 (directive_id, sd_id) VALUES ('TEST-DUP', 'SD-TEST-001');"
# (Should fail with constraint violation)
```

### Rollback Plan

```bash
# If issues arise, restore from backup:
psql $DATABASE_URL -c "DROP TABLE product_requirements_v2;"
psql $DATABASE_URL -c "ALTER TABLE product_requirements_v2_backup_20260206 RENAME TO product_requirements_v2;"
```

---

## Next Steps

1. **Generate cleanup script**: Create `scripts/generate-prd-cleanup-sql.js` to produce deletion SQL
2. **Manual review**: Inspect each of the 13 duplicate SDs and decide which PRD to keep
3. **Execute cleanup**: Run migration with backups in place
4. **Add constraint**: Enforce uniqueness at database level
5. **Update code**: Modify PRD creation scripts to check for existing records
6. **Add tests**: Prevent regression

---

## Appendix: Query Results

### Query 1: Duplicate SDs (Raw Output)

```json
[
  { "sd_id": "643da4df-8805-4e66-aac6-4f35b9996942", "prd_count": 2 },
  { "sd_id": "82f3189a-169c-4322-ad7e-aebe2e73aa4e", "prd_count": 2 },
  { "sd_id": "abfe5dd0-089b-41dc-ab38-21dfbe688eca", "prd_count": 2 },
  { "sd_id": "ec7e56f5-b2c4-4dd7-a453-7ec3b2b6f0c9", "prd_count": 2 },
  { "sd_id": "SD-IND-D-STAGES-22-25", "prd_count": 2 },
  { "sd_id": "SD-LEO-GEN-RENAME-COLUMNS-SELF-001", "prd_count": 2 },
  { "sd_id": "SD-LEO-GEN-RENAME-COLUMNS-SELF-001-B", "prd_count": 2 },
  { "sd_id": "SD-LEO-GEN-RENAME-COLUMNS-SELF-001-C", "prd_count": 2 },
  { "sd_id": "SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D", "prd_count": 2 },
  { "sd_id": "SD-LEO-GEN-RENAME-COLUMNS-SELF-001-E", "prd_count": 2 },
  { "sd_id": "SD-PARENT-4.0", "prd_count": 6 },
  { "sd_id": "SD-STAGE-ARCH-001-P10", "prd_count": 2 },
  { "sd_id": "SD-TEST-MGMT-VALIDATION-001", "prd_count": 2 }
]
```

### Query 3: NULL sd_id (Result)

```
PRDs with NULL sd_id: 0
```

All PRDs have valid sd_id associations.

---

**End of Audit Report**
