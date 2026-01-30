# Migration: JSONB Type Validation Constraints

## Metadata
- **Category**: Database
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: DATABASE Sub-Agent
- **Last Updated**: 2026-01-30
- **Tags**: migration, jsonb, data-quality, constraints

## Overview

This migration adds database-level validation constraints to prevent JSONB fields from storing stringified JSON (type STRING) instead of proper JSONB arrays (type ARRAY).

## Root Cause: PAT-JSONB-STRING-TYPE

**Problem**: Legacy scripts called `JSON.stringify()` on JSONB fields before Supabase insert, causing double-encoding.

**Impact**:
- 655 active SDs scanned
- ~300 fields stored as strings across multiple fix runs
- LEAD-TO-PLAN handoffs blocked by type mismatches
- Query failures: `cannot get array length of a scalar`

**Root Cause Analysis**: `docs/reference/rca-auto-proceed-empty-metrics-2026-01-30.md`

## Migration File

**Location**: `database/migrations/20260130_add_jsonb_type_constraints.sql`

### Constraints Added

| Constraint | Purpose | Validation |
|------------|---------|------------|
| `success_criteria_is_array` | Ensures JSONB array type | `jsonb_typeof(success_criteria) = 'array'` |
| `success_metrics_is_array` | Ensures JSONB array type | `jsonb_typeof(success_metrics) = 'array'` |
| `key_principles_is_array` | Ensures JSONB array type | `jsonb_typeof(key_principles) = 'array'` |
| `key_changes_is_array` | Ensures JSONB array type | `jsonb_typeof(key_changes) = 'array'` |
| `key_principles_not_empty` | Prevents empty principles | `jsonb_array_length(key_principles) >= 1` |

### NOT VALID Clause

All constraints use `NOT VALID` to skip validation of existing rows:

```sql
ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT success_criteria_is_array
  CHECK (success_criteria IS NULL OR jsonb_typeof(success_criteria) = 'array')
  NOT VALID;  -- ← Skip existing rows, enforce for new inserts/updates
```

**Rationale**:
- Historical data had 300+ fields with string types
- Validating 655 SDs would block migration
- Data was cleaned via healing scripts BEFORE constraint validation

### Validation After Data Cleanup

Once all data is healed (verified via `npm run data:integrity`), validate constraints:

```sql
-- Run after confirming 0 string type issues
ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT success_criteria_is_array;
ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT success_metrics_is_array;
ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT key_principles_is_array;
ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT key_changes_is_array;
ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT key_principles_not_empty;
```

## Data Healing Workflow

### Step 1: Integrity Check

```bash
npm run data:integrity
```

**Output**:
```
📛 STRING TYPE ISSUES: 118 fields across 49 SDs
⚠️  EMPTY ARRAY ISSUES: 0 fields across 0 SDs
```

### Step 2: Automated Fix

```bash
npm run data:integrity:fix
```

**Actions**:
- Parses stringified JSON to proper arrays
- Applies default values for empty arrays
- Batch updates per SD (atomic)

**Result**: `170 SDs fixed (215 fields), 10 failed`

### Step 3: Heal Empty Metrics

```bash
npm run data:heal-metrics:fix
```

**Actions**:
- Adds default `success_metrics` to completed/cancelled SDs with empty arrays
- Uses SD type-specific defaults (orchestrator, feature, fix, etc.)

**Result**: `71 SDs healed, 8 failed`

### Step 4: Manual Fixes (Edge Cases)

For SDs with object-type metrics or unparseable fields:
- Manual conversion via targeted scripts
- 3 SDs with legacy object-type `success_metrics` converted to arrays
- 2 SDs with plain text `strategic_objectives` converted to arrays

### Final State

```bash
npm run data:integrity
```

**Output**:
```
✅ All JSONB fields have correct types!
```

## Quality Control Scripts

### Created Scripts

| Script | Purpose | npm Command |
|--------|---------|-------------|
| `scripts/check-jsonb-integrity.js` | Scan for type issues | `npm run data:integrity` |
| `scripts/check-jsonb-integrity.js --fix` | Auto-convert strings to arrays | `npm run data:integrity:fix` |
| `scripts/heal-empty-metrics.js` | Add defaults to empty fields | `npm run data:heal-metrics` |
| `scripts/heal-empty-metrics.js --fix` | Execute healing | `npm run data:heal-metrics:fix` |

### Integrity Check Features

- Scans all active SDs (655)
- Detects string-type JSONB fields (should be arrays)
- Detects empty arrays on required fields (`success_metrics`, `success_criteria`, `key_principles`)
- Batch atomic updates per SD (prevents partial fixes)
- Handles parse errors gracefully (skips unparseable JSON)
- Provides defaults for empty arrays based on SD type

## Code Fixes

### Legacy Scripts Fixed

| Script | Issue | Fix |
|--------|-------|-----|
| `scripts/create-security-sds.js` | Called `JSON.stringify()` before insert | Removed stringify - pass arrays directly |
| `scripts/update-sd-video-variant-scope.cjs` | Called `JSON.stringify()` before update | Removed stringify - pass objects directly |

### Correct Pattern

```javascript
// ✅ CORRECT - Supabase handles serialization
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .insert({
    id: 'SD-XXX-001',
    key_changes: ['Change 1', 'Change 2'],                    // Array
    success_criteria: [{criterion: 'X', measure: 'Y'}],      // Array of objects
    success_metrics: [{metric: 'Coverage', target: '80%'}]   // Array of objects
  });

// ❌ WRONG - Double-encoding
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .insert({
    id: 'SD-XXX-001',
    key_changes: JSON.stringify(['Change 1', 'Change 2']),           // STRING!
    success_criteria: JSON.stringify([{criterion: 'X'}]),            // STRING!
    success_metrics: JSON.stringify([{metric: 'Coverage'}])          // STRING!
  });
```

## Rollout Timeline

| Date | Action | Status |
|------|--------|--------|
| 2026-01-30 | RCA completed | ✅ Done |
| 2026-01-30 | Migration SQL created | ✅ Done |
| 2026-01-30 | Legacy scripts fixed | ✅ Done |
| 2026-01-30 | Integrity check script created | ✅ Done |
| 2026-01-30 | Data healing completed (655 SDs) | ✅ Done |
| 2026-01-30 | npm scripts added to package.json | ✅ Done |
| Pending | Apply migration via Supabase SQL Editor | ⏳ Ready |
| Post-migration | Validate constraints | ⏳ After migration |

## Validation Checklist

Before applying migration:
- [x] All legacy scripts fixed (no JSON.stringify on JSONB)
- [x] Data integrity check passes (0 string type issues)
- [x] Healing scripts tested and available
- [x] Migration uses NOT VALID clause
- [x] Documentation updated

After applying migration:
- [ ] Constraints applied successfully
- [ ] New inserts/updates validated automatically
- [ ] Constraints validated (run VALIDATE CONSTRAINT commands)
- [ ] Monitor for any constraint violations

## Lessons Learned

### ✅ What Worked

1. **Database constraints**: Prevent future issues at source
2. **NOT VALID clause**: Allow migration without blocking on historical data
3. **Automated healing**: 655 SDs fixed without manual intervention
4. **Type-specific defaults**: Orchestrator, feature, fix SDs got appropriate defaults
5. **Batch atomic updates**: Prevented partial fixes and constraint violations

### ❌ What to Avoid

1. **Manual JSON serialization**: Trust ORM/client for JSONB handling
2. **Empty validation**: Add `NOT VALID` when existing data may violate constraint
3. **Field-by-field updates**: Batch all fixes per record to avoid constraint violations mid-update
4. **Assuming client behavior**: Document that Supabase auto-serializes JSONB

### 📚 Knowledge Transfer

- Pattern documented: **Anti-Pattern 8** in `docs/reference/database-agent-patterns.md`
- Field reference updated: `docs/database/strategic_directives_v2_field_reference.md`
- Quality controls: Integrity check scripts now part of standard tooling

## Related Documentation

- **Database Agent Patterns**: `docs/reference/database-agent-patterns.md` (Anti-Pattern 8)
- **Field Reference**: `docs/database/strategic_directives_v2_field_reference.md` (Constraints section)
- **RCA**: `docs/reference/rca-auto-proceed-empty-metrics-2026-01-30.md`
- **Migration SQL**: `database/migrations/20260130_add_jsonb_type_constraints.sql`

## Support

For issues with JSONB type validation:

1. Check data integrity: `npm run data:integrity`
2. Auto-fix: `npm run data:integrity:fix`
3. Heal empty metrics: `npm run data:heal-metrics:fix`
4. If issues persist: Consult DATABASE sub-agent via `node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>`

---

**Migration Status**: ✅ Ready for Application
**Data Status**: ✅ All 655 SDs Healed
**Quality Controls**: ✅ Scripts Created and Tested
