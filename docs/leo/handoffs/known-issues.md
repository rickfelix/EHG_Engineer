# Handoff System Known Issues


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, unit, schema, guide

**Last Updated**: 2026-01-20

This document tracks known bugs, workarounds, and improvement opportunities in the LEO Protocol handoff system.

---

## Critical Issues

### 1. LEAD-FINAL-APPROVAL Validator Schema Mismatch

**File**: `scripts/modules/workflow-roi-validation.js:137`
**Severity**: High (blocks SD completion)
**Discovered**: 2026-01-20 (SD-FIX-NAV-001-D)

#### Problem

The `validateGate4LeadFinal()` function queries for a `LEAD-FINAL` handoff type that doesn't exist in the database schema:

```javascript
// Line 137 in workflow-roi-validation.js
const { data: leadHandoff } = await supabase
  .from('sd_phase_handoffs')
  .select('metadata, created_at')
  .eq('sd_id', sd_id)
  .eq('handoff_type', 'LEAD-FINAL')  // ❌ This type doesn't exist!
  .order('created_at', { ascending: false })
  .limit(1);
```

**Schema Constraint** (`sd_phase_handoffs` table):
```sql
CHECK (handoff_type = ANY (ARRAY[
  'LEAD-TO-PLAN'::text,
  'PLAN-TO-EXEC'::text,
  'EXEC-TO-PLAN'::text,
  'PLAN-TO-LEAD'::text
]))
```

Notice `LEAD-FINAL` is NOT in the allowed values.

#### Impact

- LEAD-FINAL-APPROVAL handoff always fails validation even when all gates pass
- Reports "No documented LEAD strategic review found" (false negative)
- Cannot store handoff record due to schema constraint violation
- Blocks SD completion requiring manual database intervention

#### Workaround

**Manual SD Completion**:
```javascript
// After PLAN-TO-LEAD passes at ≥75%, complete SD directly
const { data, error } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'completed',
    current_phase: 'COMPLETED',
    progress_percentage: 100,
    is_working_on: false,
    completion_date: new Date().toISOString()
  })
  .eq('id', 'SD-XXX-XXX');
```

#### Root Cause

The validator was designed to check for a `LEAD-FINAL` handoff record, but:
1. The schema was never updated to allow this handoff type
2. The `LeadFinalApprovalExecutor.js` doesn't create a `LEAD-FINAL` handoff
3. The gate validator expects data that can never exist

#### Recommended Fix

**Option 1: Update Schema** (Preferred)
```sql
-- Add LEAD-FINAL-APPROVAL to allowed handoff types
ALTER TABLE sd_phase_handoffs
  DROP CONSTRAINT sd_phase_handoffs_handoff_type_check;

ALTER TABLE sd_phase_handoffs
  ADD CONSTRAINT sd_phase_handoffs_handoff_type_check
  CHECK (handoff_type = ANY (ARRAY[
    'LEAD-TO-PLAN'::text,
    'PLAN-TO-EXEC'::text,
    'EXEC-TO-PLAN'::text,
    'PLAN-TO-LEAD'::text,
    'LEAD-FINAL-APPROVAL'::text  -- Add this
  ]));
```

Then update `LeadFinalApprovalExecutor.js` to create the handoff record.

**Option 2: Validator Lookup Fix** (Quick Fix)
```javascript
// Change line 137 in workflow-roi-validation.js
// Look for strategic_review in PLAN-TO-LEAD handoff instead
const { data: leadHandoff } = await supabase
  .from('sd_phase_handoffs')
  .select('metadata, created_at')
  .eq('sd_id', sd_id)
  .eq('handoff_type', 'PLAN-TO-LEAD')  // ✅ This exists!
  .order('created_at', { ascending: false })
  .limit(1);
```

#### Related Files

- `scripts/modules/workflow-roi-validation.js` - Gate 4 validator
- `scripts/modules/handoff/executors/LeadFinalApprovalExecutor.js` - Completion executor
- `database/schema/007_leo_protocol_schema_fixed.sql` - Schema definition

#### Test Case

**SD-FIX-NAV-001-D** encountered this issue:
- PLAN-TO-LEAD passed at 91%
- LEAD-FINAL-APPROVAL failed at 65% (threshold 75%)
- All prior gates passed (LEAD-TO-PLAN: 99%, PLAN-TO-EXEC: 92%, EXEC-TO-PLAN: 66%)
- Error: "No documented LEAD strategic review found" (false - strategic_review was added to PLAN-TO-LEAD metadata)
- Resolution: Manual database completion

---

## Medium Priority Issues

### 2. Gate Score Lookup Inconsistency

**Severity**: Medium (validation inaccuracy)

The `validateGate4LeadFinal()` function looks for gate scores in two different locations:

1. `metadata.gate1_validation`, `metadata.gate2_validation`, `metadata.gate3_validation` (old format)
2. `metadata.gate_results.GATE3_TRACEABILITY` (new unified format)

However, it doesn't consistently find scores, leading to false warnings like:
```
⚠️  Gate 1 score unavailable (3/6)
⚠️  Gate 3 score unavailable (3/6)
```

Even though scores exist in `metadata.gate_results` with full details.

#### Recommended Fix

Standardize gate score lookup to always check `metadata.gate_results` first:

```javascript
// Check unified format first (current system)
if (handoff.metadata?.gate_results) {
  for (const [gateName, gateResult] of Object.entries(handoff.metadata.gate_results)) {
    if (gateResult.score !== undefined) {
      gateResults[gateName.toLowerCase()] = gateResult;
    }
  }
}

// Fall back to legacy format
if (!gateResults.gate1 && handoff.metadata?.gate1_validation) {
  gateResults.gate1 = handoff.metadata.gate1_validation;
}
```

---

## Documentation Gaps

### 3. Missing LEAD-FINAL-APPROVAL Documentation

The handoff system guide (`docs/leo/handoffs/handoff-system-guide.md`) documents LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, and PLAN-TO-LEAD, but doesn't document LEAD-FINAL-APPROVAL workflow.

**Needs**:
- Workflow diagram including LEAD-FINAL-APPROVAL step
- Gate 4 validation criteria explanation
- Strategic review requirements
- Completion state transition documentation

---

## Change Log

| Date | Issue | Status | Resolution |
|------|-------|--------|------------|
| 2026-01-20 | LEAD-FINAL validator schema mismatch | Open | Workaround: manual completion |
| 2026-01-20 | Gate score lookup inconsistency | Open | Investigation needed |
| 2026-01-20 | LEAD-FINAL-APPROVAL missing from docs | Open | Documentation task |

---

## Related Documentation

- [Handoff System Guide](./handoff-system-guide.md) - Architecture and gate patterns
- [SD Validation Profiles](../../reference/sd-validation-profiles.md) - Type-specific validation rules
- [Database Schema: sd_phase_handoffs](../../reference/schema/engineer/tables/sd_phase_handoffs.md) - Table constraints
