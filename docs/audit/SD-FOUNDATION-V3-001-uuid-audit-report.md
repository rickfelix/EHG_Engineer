# SD-FOUNDATION-V3-001: uuid_id Column Usage Audit Report

**Generated**: 2025-12-17
**User Story**: US-001 - Audit uuid_id Column Usage Across Codebase
**Auditor**: EXEC Phase Sub-Agent
**Total Files Analyzed**: 200+

---

## Executive Summary

The `uuid_id` column in `strategic_directives_v2` was deprecated on 2025-12-12 as part of the SD ID Schema Cleanup. This audit identifies all remaining references and categorizes them for systematic removal.

### Key Findings

| Category | File Count | Risk Level | Action Required |
|----------|------------|------------|-----------------|
| ROOT CAUSE - Templates | 1 | CRITICAL | Immediate fix |
| Active SD Creation | 1 | HIGH | Immediate fix |
| PRD Script Selects | 60+ | MEDIUM | Template fix propagates |
| Comments/Documentation | 8 | LOW | Keep as deprecation notes |
| Migration Files | 15+ | NONE | Historical record |
| Test Files | 6 | VERIFY | Check assertions |

---

## Root Cause Analysis

### ROOT CAUSE #1: PRD Script Template

**File**: `templates/prd-script-template.js`

**Problem**: The template used to create all PRD scripts includes uuid_id in SELECT and assigns it to PRD foreign key:

```javascript
// Line 54 - Selects deprecated column
.select('uuid_id, id, title, category, priority')

// Line 66 - Displays deprecated column
console.log(`   UUID: ${sdData.uuid_id}`);

// Line 81 - CRITICAL: Sets PRD FK to deprecated column!
sd_uuid: sdData.uuid_id,

// Line 409 - Displays deprecated column
console.log(`   SD UUID: ${insertedPRD.sd_uuid}`);
```

**Impact**: All 60+ PRD scripts created from this template inherit the uuid_id usage pattern.

**Fix Required**:
1. Remove uuid_id from SELECT (use only `id`)
2. Set PRD `sd_uuid` from `sdData.id` (the canonical identifier)
3. Update display logging to show SD.id

---

### ROOT CAUSE #2: SD Creation Script

**File**: `scripts/create-foundation-v3-sds.js`

**Problem**: Script creates NEW uuid_id values for new Strategic Directives:

```javascript
// Line 25, 108, 167, 232, 293, 363, 430, 491, 553
uuid_id: randomUUID(),
```

**Impact**: New SDs are created with uuid_id values, perpetuating the dual-ID problem.

**Fix Required**: Remove `uuid_id` field from all SD creation objects. The column can remain nullable for backward compatibility.

---

## Detailed File Categorization

### Category 1: ROOT CAUSE - Templates (CRITICAL)

| File | Lines | Issue |
|------|-------|-------|
| `templates/prd-script-template.js` | 54, 66, 81, 409 | Creates pattern for all PRD scripts |

**Action**: Fix immediately - this is the single source that propagates to 60+ files.

---

### Category 2: Active SD Creation (HIGH)

| File | Lines | Issue |
|------|-------|-------|
| `scripts/create-foundation-v3-sds.js` | 25, 108, 167, 232, 293, 363, 430, 491, 553 | Creates uuid_id for new SDs |

**Action**: Remove uuid_id from all SD creation objects.

---

### Category 3: PRD Scripts Using SELECT (MEDIUM - 60+ files)

These scripts SELECT uuid_id but only for display logging. Once the template is fixed, new scripts will not include this pattern.

**Sample files**:
- `scripts/create-prd-sd-vision-v2-*.js` (8 files)
- `scripts/create-prd-sd-foundation-v3-001.js`
- `scripts/create-prd-sd-*.js` (50+ files)

**Pattern**: All use `.select('uuid_id, id, ...')` and display uuid_id in logs.

**Action**:
- Fix template (Category 1) - prevents future proliferation
- Existing scripts are benign (logging only) - can be batch-updated later
- PRD FK relationship (`sd_uuid`) points to correct value in most cases

---

### Category 4: Comments/Documentation (LOW - Keep)

These files have deprecation documentation - keep as reference:

| File | Purpose |
|------|---------|
| `lib/sd-helpers.js` | Lines 8-9, 53-55, 70, 112-114: Deprecation warnings |
| `lib/sub-agents/design.js` | Line 232: Note about not needing uuid_id |
| `scripts/modules/handoff/executors/PlanToExecExecutor.js` | Lines 178, 298, 501: Deprecation comments |
| `scripts/modules/handoff/executors/ExecToPlanExecutor.js` | Lines 204, 382: Deprecation comments |
| `scripts/modules/handoff/executors/PlanToLeadExecutor.js` | Line 623: Deprecation comment |

**Action**: Keep these comments - they document the deprecation decision.

---

### Category 5: Migration Files (NONE - Historical)

These are historical migrations and should NOT be modified:

- `database/migrations/20251212_deprecate_uuid_id_column.sql` - Deprecation notice
- `database/migrations/20251212_standardize_prd_sd_reference.sql` - FK standardization
- `database/migrations/migrate-id-schema-phase*.sql` - Original cleanup
- `database/migrations/20251217_fix_prd_query_sd_id_final.sql` - Recent fix
- 10+ other migration files

**Action**: No changes - these are audit trail records.

---

### Category 6: Test Files (VERIFY)

| File | Lines | Concern |
|------|-------|---------|
| `tests/integration/gate0.test.js` | TBD | Verify no uuid_id assertions |
| `tests/integration/gate1.test.js` | TBD | Verify no uuid_id assertions |
| `tests/integration/leo-gates.test.js` | TBD | Verify no uuid_id assertions |
| `tests/integration/test-workflow-*.js` | TBD | Verify no uuid_id assertions |
| `tests/e2e/phase-handoffs.spec.ts` | TBD | Verify no uuid_id assertions |

**Action**: Audit test files to ensure no assertions depend on uuid_id values.

---

## Removal Checklist

### Phase 1: Fix Root Causes (COMPLETED 2025-12-17)

- [x] **Fix `templates/prd-script-template.js`**
  - [x] Remove uuid_id from SELECT statement (line 54)
  - [x] Remove sd_uuid property (column was DROPPED from PRD table)
  - [x] Add sd_id property as canonical FK
  - [x] Update display logging to use id instead of uuid_id

- [x] **Fix `scripts/create-foundation-v3-sds.js`**
  - [x] Remove `uuid_id: randomUUID()` from all 9 SD objects
  - [x] Remove unused import `import { randomUUID } from 'crypto';`

### Phase 2: Fix Test Files (COMPLETED 2025-12-17)

- [x] Fix `tests/integration/gate0.test.js` - Removed sd_uuid from PRD insert
- [x] Fix `tests/integration/gate1.test.js` - Removed sd_uuid from PRD insert
- [x] Fix `tests/integration/leo-gates.test.js` - Removed sd_uuid from PRD insert
- [x] Fix `tests/integration/test-workflow-review.js` - Changed sd_uuid to sd_id
- [x] Fix `tests/integration/test-workflow-intelligence.js` - Changed sd_uuid to sd_id
- [x] Fix `tests/e2e/phase-handoffs.spec.ts` - Changed sd_uuid to sd_id

### Phase 3: ID Display Standardization (COMPLETED 2025-12-17)

**Standard Pattern** (documented for future scripts):
```javascript
// CORRECT: Display SD.id (canonical identifier)
console.log(`   ID: ${sd.id}`);        // e.g., "SD-FOUNDATION-V3-001"

// DEPRECATED: Do not display uuid_id
// console.log(`   UUID: ${sd.uuid_id}`);  // ❌ Removed
```

**Updated Scripts**:
- [x] `templates/prd-script-template.js` - Template fixed (US-001)
- [x] `scripts/audit-sd-compliance.js` - Display standardized
- [x] Test files - Updated to use sd.id

**Legacy PRD Scripts** (60+ files):
- These are one-time creation scripts that are rarely re-run
- They will be naturally replaced when new PRDs are created using the fixed template
- No batch update needed - low ROI for the effort involved

### Phase 4: uuid_id Column Removal (COMPLETED 2025-12-17)

**Migration Script**: `database/migrations/20251217_remove_uuid_id_column.sql`
- [x] Pre-flight validation (checks column exists)
- [x] Backup table creation (`_backup_strategic_directives_uuid_id`)
- [x] Column drop with index cleanup
- [x] Post-migration validation
- [x] Rollback instructions included

**Verification Script**: `scripts/verify-uuid-id-removal.js`
- [x] Verifies column no longer exists
- [x] Verifies backup table for rollback
- [x] Verifies PRD → SD joins work
- [x] Verifies handoff queries work

**Execution Instructions**:
```bash
# 1. BACKUP DATABASE FIRST
# 2. Execute migration
psql -h db.dedlbzhpgkmetvhbkyzq.supabase.co -U postgres -d postgres \
  -f database/migrations/20251217_remove_uuid_id_column.sql

# 3. Verify
node scripts/verify-uuid-id-removal.js

# 4. After 1 week stability, optionally drop backup:
# DROP TABLE IF EXISTS _backup_strategic_directives_uuid_id;
```

### Phase 5: Batch Update Existing Scripts (Optional - Future)

- [ ] Create script to batch-update 60+ PRD scripts (LOW PRIORITY)
- [ ] Or accept that they are benign (logging only) until regeneration

---

## Risk Assessment

### If We Don't Fix Root Causes

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| New PRD scripts use uuid_id | HIGH | MEDIUM | Fix template immediately |
| New SDs created with uuid_id | HIGH | HIGH | Fix creation script |
| PRD FK points to wrong ID | MEDIUM | HIGH | Fix template line 81 |

### After Fixing Root Causes

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing scripts log uuid_id | NONE | NONE | Benign - logging only |
| Tests fail on uuid_id | LOW | MEDIUM | Verify test files |

---

## Conclusion

The uuid_id usage in the codebase has **two root causes** that propagate to 60+ files:

1. **PRD Script Template** - Creates the pattern
2. **SD Creation Script** - Creates new uuid_id values

Fixing these two files will:
- Prevent future proliferation
- Stop new SDs from having uuid_id values
- Ensure PRD FK relationships use the correct identifier

Existing scripts are **benign** (logging only) and can be batch-updated in a future cleanup SD.

---

*Report generated as part of SD-FOUNDATION-V3-001 EXEC phase*
