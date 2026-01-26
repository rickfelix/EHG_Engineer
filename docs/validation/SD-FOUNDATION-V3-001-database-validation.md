# Database Validation Report: SD-FOUNDATION-V3-001


## Metadata
- **Category**: Database
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, migration, schema, protocol

**Strategic Directive**: Data Integrity & Schema Remediation
**Validation Date**: 2025-12-17
**Sub-Agent**: DATABASE
**Status**: CONDITIONAL_PASS
**Severity**: CRITICAL

---

## Executive Summary

Database validation for SD-FOUNDATION-V3-001 identified **6 records with UUID-format IDs** requiring immediate remediation. All foreign key relationships are valid (204/204 references intact). The `uuid_id` column is ready for removal after ID format issues are resolved.

**Key Metrics**:
- Total SDs: 27
- Correct ID format (SD-XXX-001): 21 (78%)
- UUID format (requires fix): 6 (22%)
- FK integrity: 100% (all 204 references valid)

---

## Validation Findings

### 1. Table Structure Analysis ✅ PASS

**strategic_directives_v2** table structure verified:
- **72 columns** present
- **Primary Key**: `id` (VARCHAR, human-readable format)
- **Legacy ID**: `legacy_id` (VARCHAR, historical identifier)
- **Deprecated Column**: `uuid_id` (UUID, marked DEPRECATED 2025-12-12)

**Schema Documentation**: `/mnt/c/_EHG/EHG_Engineer/docs/reference/schema/engineer/tables/strategic_directives_v2.md`

### 2. ID Column Format Analysis ⚠️ CRITICAL

**Total Records**: 27

| Format Type | Count | Percentage | Status |
|-------------|-------|------------|--------|
| CORRECT (SD-XXX-001) | 21 | 78% | ✅ Valid |
| UUID Format | 6 | 22% | ❌ Invalid |

**Problematic Records** (UUID in `id` column):

1. `52038e49-7612-4e98-bb9f-c8b5b97a9266` → Should be: `SD-VISION-V2-010`
2. `35db1a87-664b-4957-af5a-5d5a56c77261` → Should be: `SD-TECHDEBT-ESLINT-001`
3. `0cbf032c-ddff-4ea3-9892-2871eeaff1a7` → Should be: `SD-VISION-V2-011`
4. `e354273d-e841-4926-8788-c2f9a15e91c7` → Should be: `SD-VISION-V2-013`
5. `6710ce94-52a6-4f7a-a1ab-4fe80e193c9d` → Should be: `SD-VISION-V2-009`
6. `85c7b51d-d713-4a34-adc5-15b2c624ae23` → Should be: `SD-VISION-V2-P2-000`

**Root Cause**: These records have their `id` field populated with UUID values instead of human-readable VARCHAR format. Each has the correct value in `legacy_id` column.

**Impact**:
- FK relationships may break if these records are referenced
- Violates schema expectation of human-readable SD IDs
- Inconsistent with 78% of other records

### 3. Foreign Key Referential Integrity ✅ PASS

All FK relationships validated successfully:

#### product_requirements_v2.sd_id → strategic_directives_v2.id

| Metric | Value | Status |
|--------|-------|--------|
| Total PRDs | 19 | - |
| Valid FK References | 19 | ✅ 100% |
| Orphaned Records | 0 | ✅ None |

**Validation**: All PRD records correctly reference strategic_directives_v2.id

#### retrospectives.sd_id → strategic_directives_v2.id

| Metric | Value | Status |
|--------|-------|--------|
| Total Retrospectives | 37 | - |
| With SD Reference | 17 | - |
| Valid FK References | 17 | ✅ 100% |
| NULL sd_id (Intentional) | 20 | ✅ Expected |

**Note**: 20 retrospectives have `NULL` sd_id by design (not orphaned)

#### user_stories.sd_id → strategic_directives_v2.id

| Metric | Value | Status |
|--------|-------|--------|
| Total User Stories | 109 | - |
| Valid FK References | 109 | ✅ 100% |
| Orphaned Records | 0 | ✅ None |

#### leo_handoff_executions.sd_id → strategic_directives_v2.id

| Metric | Value | Status |
|--------|-------|--------|
| Total Handoffs | 76 | - |
| Valid FK References | 76 | ✅ 100% |
| Orphaned Records | 0 | ✅ None |

**Summary**: **204/204 FK references valid** across all related tables.

### 4. uuid_id Column Deprecation Status ✅ READY

| Metric | Value | Status |
|--------|-------|--------|
| Total Records | 27 | - |
| Non-NULL uuid_id | 27 | ✅ All populated |
| NULL uuid_id | 0 | - |

**Deprecation Notice**: Column marked DEPRECATED on 2025-12-12 via migration `20251212_deprecate_uuid_id_column.sql`

**Column Comment**:
```
DEPRECATED (2025-12-12): Do not use for FK relationships.
Use the id column instead - it is the canonical identifier.
```

**Readiness**: Column can be safely dropped **after** fixing the 6 UUID-format id values.

### 5. Database Function Validation ✅ PASS

#### get_progress_breakdown(UUID)
- **Status**: ✅ Function accepts UUID input
- **Behavior**: Converts UUID to VARCHAR internally
- **Result**: "SD not found" (expected for test UUID)
- **uuid_id Reference**: ❌ No (does not query uuid_id column)

#### calculate_sd_progress(UUID)
- **Status**: ✅ Function verified
- **uuid_id Reference**: ❌ No (does not query uuid_id column)

**Conclusion**: Functions are compatible with UUID input and do not depend on uuid_id column.

### 6. Migration History Analysis ✅ VERIFIED

Key migrations executed:

1. **20251212_deprecate_uuid_id_column.sql**
   - Marks `uuid_id` as DEPRECATED
   - Adds comprehensive column comment
   - Validates 91% of records have different `id` vs `uuid_id` values

2. **20251212_standardize_prd_sd_reference.sql**
   - Migrates `product_requirements_v2.sd_uuid` (UUID) to `sd_id` (VARCHAR)
   - Creates FK constraint: `fk_prd_sd_id`
   - Translates UUID references to id references
   - Result: 100% FK integrity

3. **20251217_fix_prd_query_sd_id_final.sql**
   - Fixes database function queries
   - Updates functions to use `sd_id` instead of `sd_uuid`

**Migration Path Verified**: UUID deprecation → PRD FK migration → Function updates

---

## Blockers

### BLOCKER-001: UUID Format in id Column (CRITICAL)

**Severity**: CRITICAL
**Affected Records**: 6
**Impact**:
- FK relationships may break if these records are referenced
- Schema violation (id should be VARCHAR like "SD-XXX-001")
- Inconsistent with 78% of database records

**Remediation Required**:

```sql
-- Migration: Fix UUID-format IDs using legacy_id values
UPDATE strategic_directives_v2
SET id = legacy_id
WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND legacy_id IS NOT NULL
  AND legacy_id ~ '^SD-[A-Z0-9-]+$';

-- Expected Result: 6 rows updated
```

**Validation After Remediation**:
```sql
-- Should return 0 rows
SELECT id, legacy_id
FROM strategic_directives_v2
WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
```

**Dependency**: Must complete before uuid_id column can be dropped.

---

## Recommendations

### Immediate Actions (Before SD Completion)

1. **Execute Remediation Migration** (BLOCKER-001)
   - File: `/mnt/c/_EHG/EHG_Engineer/database/migrations/20251217_fix_uuid_format_ids.sql`
   - Expected: 6 rows updated
   - Validation: Verify all IDs match `^SD-[A-Z0-9-]+$` pattern

2. **Post-Remediation Validation**
   - Re-run FK integrity checks
   - Verify all 204 FK references still valid
   - Confirm 0 UUID-format IDs remain

### Future Actions (After SD Completion)

3. **Drop uuid_id Column**
   - Create migration: `20251217_drop_uuid_id_column.sql`
   - Remove `uuid_id` from strategic_directives_v2
   - Update TypeScript interfaces to remove uuid_id field

4. **Update Schema Documentation**
   - Regenerate schema docs: `npm run schema:docs:engineer`
   - Verify `uuid_id` removed from table documentation
   - Update foreign key relationship diagrams

5. **Code Cleanup**
   - Search codebase for `uuid_id` references: `grep -r "uuid_id" src/`
   - Remove any remaining `sd.uuid_id || sd.id` fallback patterns
   - Standardize on `sd.id` everywhere

---

## Evidence

**Validation Script**: `/mnt/c/_EHG/EHG_Engineer/scripts/validate-sd-foundation-v3-001-database.js`
**Schema Docs**: `/mnt/c/_EHG/EHG_Engineer/docs/reference/schema/engineer/`
**Migration Files**: `/mnt/c/_EHG/EHG_Engineer/database/migrations/`
**Database**: dedlbzhpgkmetvhbkyzq (Consolidated EHG_Engineer + EHG)

**Validation Stored**:
- Table: `plan_sub_agent_executions`
- Timestamp: 2025-12-17T14:52:06.191Z
- Details: Full validation output with metrics

---

## Conclusion

**Overall Status**: CONDITIONAL_PASS

The database schema is **78% compliant** with the target state. All foreign key relationships are intact (100% integrity), and the migration path is clear. However, **6 records require remediation** before the SD can be marked complete and the uuid_id column can be safely removed.

**Gate Status**:
- ✅ FK referential integrity validated
- ✅ Migration history verified
- ✅ Database functions compatible
- ❌ **BLOCKER**: 6 UUID-format IDs require remediation

**Next Step**: Execute remediation migration to fix 6 UUID-format id values.

---

**Generated by**: DATABASE Sub-Agent
**LEO Protocol Version**: 4.3.3
**SD ID**: SD-FOUNDATION-V3-001
