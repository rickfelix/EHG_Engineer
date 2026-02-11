# Pattern: PAT-AUTOPROCEED-EMPTY-ARRAY

## Metadata
- **Category**: Pattern
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-01-30
- **Tags**: auto-proceed, validation, empty-array, javascript, truthy
- **Pattern ID**: PAT-AUTOPROCEED-EMPTY-ARRAY
- **SD**: SD-LEO-INFRA-HARDENING-001

## Overview

This pattern documents the root cause, fix, and prevention strategy for AUTO-PROCEED failures caused by JavaScript empty array truthy behavior in SD creation validation.

## Problem Statement

### Symptom
AUTO-PROCEED mode stopped unexpectedly with validation gate failure:
```
❌ GATE_SD_TRANSITION_READINESS failed
   Error: success_metrics AND success_criteria are both empty
```

### Root Cause Analysis (5-Whys)

**Why 1**: Why did AUTO-PROCEED stop?
- **Answer**: `GATE_SD_TRANSITION_READINESS` validation failed

**Why 2**: Why did the gate validation fail?
- **Answer**: SD had empty `success_metrics` array (`[]`)

**Why 3**: Why did the SD have an empty array instead of populated metrics?
- **Answer**: JavaScript truthy check bug: `success_metrics || buildDefaults()` doesn't catch empty arrays

**Why 4**: Why did the truthy check fail to catch empty arrays?
- **Answer**: In JavaScript, `[]` is truthy, so `[] || defaults` returns `[]` instead of `defaults`

**Why 5**: Why was the code using truthy checks instead of explicit length validation?
- **Answer**: Common JavaScript pattern, but incorrect for array validation

### JavaScript Truthy Behavior

```javascript
// INCORRECT - Empty array is truthy
const metrics = success_metrics || buildDefaults();
// If success_metrics = [], result is [] (NOT defaults)

// CORRECT - Explicit array length check
const metrics = (Array.isArray(success_metrics) && success_metrics.length > 0)
  ? success_metrics
  : buildDefaults();
```

## Detection

### Validation Gate Error
```
❌ GATE_SD_TRANSITION_READINESS failed
   success_metrics AND success_criteria are both empty - must define at least one measurable success metric
```

### Database Query
```sql
SELECT id, sd_key, title, success_metrics, success_criteria
FROM strategic_directives_v2
WHERE success_metrics = '[]'::jsonb
   OR success_criteria = '[]'::jsonb;
```

## Fix Implementation

### 1. SD Creation Script Fix

**File**: `scripts/leo-create-sd.js`

```javascript
// BEFORE (INCORRECT)
const finalSuccessMetrics = success_metrics || buildDefaultSuccessMetrics(type, title);

// AFTER (CORRECT)
const finalSuccessMetrics = (Array.isArray(success_metrics) && success_metrics.length > 0)
  ? success_metrics
  : buildDefaultSuccessMetrics(type, title);
```

### 2. Child SD Template Fix

**File**: `scripts/modules/child-sd-template.js`

```javascript
// BEFORE - Inherited parent metrics (inappropriate for child)
inherited.success_metrics = parentSd.success_metrics || defaults;

// AFTER - Always generate child-specific metrics
inherited.success_metrics = [
  { metric: `${phaseTitle} implementation complete`, target: '100%', measurement: 'Deliverables checklist' },
  { metric: 'Quality gate pass rate', target: '≥85%', measurement: 'Handoff validation score' },
  { metric: 'Test coverage for new code', target: '≥80%', measurement: 'Jest/Playwright coverage' },
  { metric: 'Regressions introduced', target: '0', measurement: 'CI test results' }
];
```

### 3. Database Constraint (Prevention)

**File**: `database/migrations/20260130_add_success_metrics_constraint.sql`

```sql
-- Prevent empty arrays at schema level
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT success_metrics_not_empty
CHECK (
  success_metrics IS NULL
  OR
  jsonb_array_length(success_metrics) >= 1
);

ALTER TABLE strategic_directives_v2
ADD CONSTRAINT success_criteria_not_empty
CHECK (
  success_criteria IS NULL
  OR
  jsonb_array_length(success_criteria) >= 1
);
```

### 4. Data Healing Script

**File**: `scripts/heal-empty-success-metrics.js`

- GPT-powered intelligent metric generation
- Gathers full SD context (title, description, scope, type, parent, PRD)
- Uses LLM to generate context-appropriate success_metrics
- Falls back to type-based defaults if LLM fails
- Supports dry-run and limit flags

```bash
# Dry run to preview changes
node scripts/heal-empty-success-metrics.js --dry-run

# Heal first 5 SDs
node scripts/heal-empty-success-metrics.js --limit 5

# Heal all SDs with empty metrics
node scripts/heal-empty-success-metrics.js
```

## Prevention Strategy

### Code Review Checklist

When working with array-based JSONB fields:

- [ ] Use explicit array length check: `Array.isArray(arr) && arr.length > 0`
- [ ] Never use truthy operator `||` for array validation
- [ ] Add database constraints to prevent empty arrays
- [ ] Validate array content, not just presence

### Validation Pattern

```javascript
/**
 * Validate array field has content
 * @param {Array} arr - Array to validate
 * @param {Function} buildDefaults - Function to generate defaults
 * @returns {Array} Valid non-empty array
 */
function validateArrayField(arr, buildDefaults) {
  // Explicit check: must be array AND have length
  if (Array.isArray(arr) && arr.length > 0) {
    return arr;
  }

  // Generate defaults
  return buildDefaults();
}
```

### Database Constraint Pattern

For any JSONB array column that should not be empty:

```sql
ALTER TABLE table_name
ADD CONSTRAINT column_name_not_empty
CHECK (
  column_name IS NULL  -- Allow NULL to be handled by application
  OR
  jsonb_array_length(column_name) >= 1  -- If array, must have content
);
```

## Related Patterns

- **PAT-CHILD-SD-INHERITANCE**: Child SDs should not inherit parent success_metrics
- **PAT-DATABASE-CONSTRAINT**: Use schema constraints to prevent invalid states
- **PAT-DATA-HEALING**: LLM-powered intelligent data repair for existing issues

## Testing

### Validation Test

```javascript
// Test empty array detection
const testCases = [
  { input: [], expected: 'defaults' },
  { input: null, expected: 'defaults' },
  { input: undefined, expected: 'defaults' },
  { input: [{ metric: 'test' }], expected: 'provided' }
];

testCases.forEach(({ input, expected }) => {
  const result = (Array.isArray(input) && input.length > 0) ? 'provided' : 'defaults';
  console.assert(result === expected, `Failed for input: ${JSON.stringify(input)}`);
});
```

### Database Constraint Test

```sql
-- Should succeed (NULL allowed)
INSERT INTO strategic_directives_v2 (sd_key, success_metrics) VALUES ('TEST-1', NULL);

-- Should succeed (non-empty array)
INSERT INTO strategic_directives_v2 (sd_key, success_metrics)
VALUES ('TEST-2', '[{"metric":"test","target":"100%"}]'::jsonb);

-- Should FAIL (empty array)
INSERT INTO strategic_directives_v2 (sd_key, success_metrics) VALUES ('TEST-3', '[]'::jsonb);
-- Expected: ERROR: new row violates check constraint "success_metrics_not_empty"
```

## Impact

### Before Fix
- AUTO-PROCEED stopped unexpectedly
- Child SDs created with empty success_metrics
- No validation preventing empty arrays
- Manual intervention required

### After Fix
- Empty arrays caught at creation time
- Child SDs always get appropriate metrics
- Database constraint prevents future issues
- Data healing script available for existing issues

## References

- **RCA Document**: docs/reference/rca-auto-proceed-empty-metrics-2026-01-30.md
- **Implementation PR**: https://github.com/rickfelix/EHG_Engineer/pull/688
- **Migration**: database/migrations/20260130_add_success_metrics_constraint.sql
- **Data Healing Script**: scripts/heal-empty-success-metrics.js

## Version History

- **v1.0.0** (2026-01-30): Initial pattern documentation
  - Documented JavaScript truthy check bug
  - Documented child SD inheritance issue
  - Documented fix implementation and prevention strategy
  - Added database constraint pattern
