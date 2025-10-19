# Retrospective Quality Score Constraint Debugging

**Issue**: Inserting retrospectives failed with constraint violation error
**Date**: 2025-10-17
**Status**: ✅ RESOLVED

## Problem Statement

When running `scripts/generate-retrospective.js`, insertions to the `retrospectives` table failed with:

```
new row for relation "retrospectives" violates check constraint "retrospectives_quality_score_check"
```

## Root Causes Identified

### 1. Schema Type Mismatch (Primary Cause)

**Problem**: The retrospectives table schema changed. The following columns are **JSONB**, not **TEXT[]**:
- `what_went_well`
- `key_learnings`
- `action_items`
- `what_needs_improvement`

**Evidence**:
```
Error: column "what_went_well" is of type jsonb but expression is of type text[]
```

**Impact**: JavaScript arrays passed to Supabase client were being converted to PostgreSQL `TEXT[]` arrays, but the database expected `JSONB` format.

### 2. Trigger Execution Timing Issue (Secondary Cause)

**Problem**: Two BEFORE INSERT triggers run in sequence:

1. `auto_populate_retrospective_fields()` - Validates business rules
2. `auto_validate_retrospective_quality()` - Calculates quality_score

When inserting with `status='PUBLISHED'` and `quality_score=NULL`, the first trigger blocks the insert before the second trigger can calculate the score.

**Trigger Validation Code** (`auto_populate_retrospective_fields()` lines 122-126):
```sql
IF NEW.status = 'PUBLISHED' AND
   (NEW.quality_score IS NULL OR NEW.quality_score < 70) THEN
  RAISE EXCEPTION 'PUBLISHED retrospectives must have quality_score >= 70 (current: %)',
    COALESCE(NEW.quality_score, 0);
END IF;
```

## Active Database Constraint

The constraint itself was **correct**:

```sql
CHECK (
  (quality_score IS NULL) OR
  ((quality_score >= 70) AND (quality_score <= 100))
)
```

This allows NULL OR validates range 70-100. The issue was **not** the constraint, but the data format and trigger timing.

## Solution Implemented

### Fix #1: Convert Arrays to JSONB

Added `toJsonb()` helper function:

```javascript
function toJsonb(arr) {
  return JSON.stringify(arr);
}

// Usage
const retrospective = {
  what_went_well: toJsonb(what_went_well_array),
  key_learnings: toJsonb(key_learnings_array),
  action_items: toJsonb(action_items_array),
  what_needs_improvement: toJsonb(what_needs_improvement_array),
  // ...
};
```

### Fix #2: Two-Phase Insert Strategy

**Before**:
```javascript
const retrospective = {
  // ...
  status: 'PUBLISHED'  // ❌ Fails validation before score calculated
};

await supabase.from('retrospectives').insert(retrospective);
```

**After**:
```javascript
// Phase 1: Insert as DRAFT (allows quality_score calculation)
const retrospective = {
  // ...
  status: 'DRAFT'  // ✅ Bypasses PUBLISHED validation
};

const { data: inserted } = await supabase
  .from('retrospectives')
  .insert(retrospective)
  .select();

// Quality score is now calculated by trigger
const calculatedScore = inserted[0].quality_score;

// Phase 2: Update to PUBLISHED if score >= 70
if (calculatedScore >= 70) {
  await supabase
    .from('retrospectives')
    .update({ status: 'PUBLISHED' })
    .eq('id', inserted[0].id);
}
```

## Testing Verification

Created diagnostic scripts:

1. `/mnt/c/_EHG/EHG_Engineer/scripts/diagnose-quality-constraint.js`
   - Inspects active constraints
   - Lists all triggers
   - Shows function definitions
   - Tests actual inserts

2. `/mnt/c/_EHG/EHG_Engineer/scripts/test-retrospective-insert.js`
   - Verifies JSONB format works
   - Tests quality score calculation
   - Validates constraint behavior

## Quality Score Calculation Rules

The `auto_validate_retrospective_quality()` trigger calculates scores as follows:

| Field | Full Credit | Partial Credit | Points |
|-------|-------------|----------------|--------|
| `what_went_well` | ≥5 items | 3-4 items | 20 pts / 10 pts |
| `key_learnings` | ≥5 items (>20 chars each) | 3-4 items | 30 pts / 20 pts |
| `action_items` | ≥3 items | 2 items | 20 pts / 10 pts |
| `what_needs_improvement` | ≥3 items | 1-2 items | 20 pts / 10 pts |
| **Bonus** | Specific metrics (numbers) | - | +10 pts |

**Penalties**:
- Generic phrases ("went well", "no issues", etc.): -5 pts per occurrence
- Vague learnings (<20 chars): -5 pts
- Dismissive statements ("no significant issues"): -10 pts

**Total Range**: 0-100 pts
**Threshold for PUBLISHED**: ≥70 pts

## Files Modified

1. `/mnt/c/_EHG/EHG_Engineer/scripts/generate-retrospective.js`
   - Added `toJsonb()` conversion
   - Implemented two-phase insert (DRAFT → PUBLISHED)
   - Enhanced error handling and logging

## Migration Files Reviewed

1. `database/migrations/20251015_add_retrospective_quality_score_constraint.sql`
   - Sets NOT NULL constraint (outdated - later relaxed)
   - Creates validation trigger

2. `database/migrations/20251016_fix_quality_score_constraint.sql`
   - Fixes constraint to allow NULL
   - Correct definition: `quality_score IS NULL OR (score >= 70 AND score <= 100)`

3. `database/migrations/20251016_retrospective_quality_enforcement_layers_1_2.sql`
   - Adds 5 database constraints (Layer 1)
   - Creates enhanced trigger `auto_populate_retrospective_fields()` (Layer 2)
   - Includes quality validation function `validate_retrospective_quality()`

## Lessons Learned

1. **Database errors require database agent**: This issue could have been diagnosed faster by invoking the database agent immediately instead of trial-and-error.

2. **Schema evolution tracking**: When columns change from `TEXT[]` to `JSONB`, update all insert scripts immediately. Consider adding schema validation tests.

3. **Trigger execution order matters**: When multiple BEFORE triggers exist, understand their execution order and dependencies.

4. **Two-phase operations**: For complex validation scenarios, use DRAFT → PUBLISHED pattern to allow calculated fields to populate before strict validation.

5. **Diagnostic tooling**: Created reusable diagnostic scripts for future constraint debugging.

## Prevention Measures

1. **Schema Change Protocol**: When modifying column types, add migration notes to affected scripts
2. **Integration Tests**: Add test that validates retrospective generation end-to-end
3. **Documentation**: Document JSONB conversion requirement in script comments
4. **Type Safety**: Consider using TypeScript for better type checking on database operations

## Related Issues

- **SD-KNOWLEDGE-001 Issue #4**: Quality score = 0 prevention (addressed by earlier migrations)
- **SD-RETRO-ENHANCE-001**: 4-layer quality enforcement system implementation

## Status

✅ **RESOLVED**
- Script now successfully inserts retrospectives
- Quality scores calculate correctly (90-100 range for current templates)
- Two-phase insert prevents validation failures
- Diagnostic tools available for future debugging

---

**Last Updated**: 2025-10-17
**Debugged By**: Claude Code (Principal Database Architect sub-agent protocol)
