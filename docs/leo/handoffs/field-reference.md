# Handoff Field Reference Guide


## Metadata
- **Category**: Reference
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, testing, schema, feature

**Purpose**: Quick reference for JSONB field paths in `sd_phase_handoffs` table.
**Last Updated**: 2026-01-11
**Source**: SD-LEO-STREAMS-001 retrospective (16 handoff attempts root cause)

---

## Critical JSONB Field Mappings

### `metadata` vs `validation_details`

| Field | Purpose | Written By | Read By |
|-------|---------|------------|---------|
| `metadata.gate2_validation` | Gate 2 fidelity scores | EXEC-TO-PLAN handoff | PLAN-TO-LEAD Gate 3 |
| `metadata.gate1_validation` | Gate 1 PRD quality | PLAN-TO-EXEC handoff | LEAD-FINAL-APPROVAL |
| `metadata.gate_results` | All gate results (audit) | Any handoff executor | Debug/analysis only |
| `validation_details` | Top-level validation summary | HandoffRecorder | Display only |

### Common Mistake

```javascript
// WRONG - Gate 3 doesn't read validation_details
await supabase.from('sd_phase_handoffs')
  .update({ validation_details: { gate2: { score: 85 } } })

// CORRECT - Gate 3 reads metadata.gate2_validation
await supabase.from('sd_phase_handoffs')
  .update({
    metadata: {
      ...existingMetadata,
      gate2_validation: {
        score: 85,
        passed: true,
        gate_scores: {
          design_fidelity: 25,
          database_fidelity: 35,
          testing: 20,
          code_quality: 20
        }
      }
    }
  })
```

---

## Field Path Quick Reference

### EXEC-TO-PLAN Handoff (Creates)

```jsonc
{
  "metadata": {
    "execution_id": "uuid",
    "quality_score": 85,
    "gate2_validation": {           // ← CRITICAL: Read by PLAN-TO-LEAD
      "score": 85,
      "passed": true,
      "gate_scores": {
        "design_fidelity": 25,      // Max 30
        "database_fidelity": 35,    // Max 35
        "testing": 20,              // Max 20
        "code_quality": 20          // Max 20
      }
    },
    "gate_results": { /* all gates */ }
  },
  "validation_details": {           // Summary only, not used by downstream
    "passed": true,
    "score": 85
  }
}
```

### PLAN-TO-LEAD Handoff (Reads)

Gate 3 (Traceability) reads fidelity data from the **preceding** EXEC-TO-PLAN handoff:

```javascript
// Source: PlanToLeadExecutor.js:593
const gate2Results = execToPlanHandoff?.[0]?.metadata?.gate2_validation || null;
```

If `gate2_validation` is missing, Gate 3 logs:
```
⚠️ No design fidelity data available
```

---

## Gate → Field Mapping Table

| Gate | Handoff Type | Reads Field | Expected Structure |
|------|--------------|-------------|-------------------|
| Gate 3 (Traceability) | PLAN-TO-LEAD | `EXEC-TO-PLAN.metadata.gate2_validation` | See above |
| Gate 4 (Workflow ROI) | LEAD-FINAL | `PLAN-TO-EXEC.metadata.gate1_validation` | PRD quality scores |
| Gate 5 (Git Commit) | PLAN-TO-LEAD | None (queries git directly) | N/A |

---

## sd_scope_deliverables Column Reference

| Column Name | Description | Valid Values |
|-------------|-------------|--------------|
| `deliverable_name` | Title of the deliverable | Free text |
| `deliverable_type` | Category | `ui_feature`, `test`, `configuration`, `integration`, `database`, `documentation` |
| `completion_status` | Current status | `pending`, `in_progress`, `completed`, `blocked` |

### Common Mistakes

```javascript
// WRONG column names
{ category: 'code', title: 'My Feature', status: 'done' }

// CORRECT column names
{ deliverable_type: 'integration', deliverable_name: 'My Feature', completion_status: 'completed' }
```

---

## Handoff Type Enum Values

The `handoff_type` column has a check constraint requiring exact values:

| Value | Phases |
|-------|--------|
| `LEAD-TO-PLAN` | LEAD → PLAN |
| `PLAN-TO-EXEC` | PLAN → EXEC |
| `EXEC-TO-PLAN` | EXEC → PLAN |
| `PLAN-TO-LEAD` | PLAN → LEAD |

Note: These use uppercase with hyphens. The constraint is case-sensitive.

---

## Handoff Status Enum Values

| Status | Description |
|--------|-------------|
| `pending_acceptance` | Awaiting acceptance (default) |
| `accepted` | Handoff accepted, transition complete |
| `rejected` | Handoff rejected, needs rework |
| `blocked` | Validation failed, cannot proceed |

---

## Debugging Tips

### 1. Check field existence before update

```javascript
const { data: handoff } = await supabase
  .from('sd_phase_handoffs')
  .select('metadata')
  .eq('sd_id', sdId)
  .eq('handoff_type', 'EXEC-TO-PLAN')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

console.log('gate2_validation exists:', !!handoff?.metadata?.gate2_validation);
```

### 2. Update metadata safely (preserve existing)

```javascript
const { data: current } = await supabase
  .from('sd_phase_handoffs')
  .select('metadata')
  .eq('id', handoffId)
  .single();

const updatedMetadata = {
  ...current.metadata,
  gate2_validation: newGate2Data
};

await supabase
  .from('sd_phase_handoffs')
  .update({ metadata: updatedMetadata })
  .eq('id', handoffId);
```

---

## Related Documentation

- [sd_phase_handoffs Table Schema](../../reference/schema/engineer/tables/sd_phase_handoffs.md)
- [sd_scope_deliverables Table Schema](../../reference/schema/engineer/tables/sd_scope_deliverables.md)
- [Handoff Validation Architecture](../../reference/schema/engineer/tables/leo_handoff_validations.md)

---

*Generated from SD-LEO-STREAMS-001 retrospective analysis*
