# SD Type Handoff Sequences Reference

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-02-05
- **Tags**: sd-type, handoff, workflow, leo-protocol, auto-proceed

## Overview

This document provides the canonical reference for Strategic Directive (SD) type-aware handoff sequences in the LEO Protocol. Different SD types require different handoff workflows, and this mapping is critical for AUTO-PROCEED mode to correctly route work through the appropriate phases.

**Canonical Source**: `scripts/modules/handoff/cli/workflow-definitions.js`

## Quick Reference Table

| SD Type | Required Handoffs | Optional Handoffs | AUTO-PROCEED Behavior |
|---------|-------------------|-------------------|----------------------|
| **feature** | LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL | None | Full workflow, all gates |
| **infrastructure** | LEAD-TO-PLAN → PLAN-TO-EXEC → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL | EXEC-TO-PLAN | Skips code validation if not needed |
| **documentation** | LEAD-TO-PLAN → PLAN-TO-EXEC → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL | EXEC-TO-PLAN | Minimal validation (no E2E) |
| **database** | LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL | None | DATABASE sub-agent required |
| **security** | LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL | None | SECURITY sub-agent required |
| **refactor** | LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD | LEAD-FINAL-APPROVAL | Intensity-aware (cosmetic/structural/architectural) |
| **bugfix** | LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL | None | Regression testing required |
| **performance** | LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL | None | PERFORMANCE sub-agent + benchmarks |
| **orchestrator** | LEAD-TO-PLAN → PLAN-TO-LEAD → LEAD-FINAL-APPROVAL | PLAN-TO-EXEC, EXEC-TO-PLAN | Children do implementation work |

---

## Detailed SD Type Workflows

### Feature SD

**Workflow**: Full LEO Protocol (all phases)

```
LEAD-TO-PLAN (20%)
      ↓
PLAN-TO-EXEC (40%)
      ↓
EXEC-TO-PLAN (60%)
      ↓
PLAN-TO-LEAD (75%)
      ↓
LEAD-FINAL-APPROVAL (100%)
```

**Required**:
- All 5 handoffs
- Full E2E testing
- TESTING, DESIGN, GITHUB, DOCMON, STORIES sub-agents
- Complete validation gates

**Skipped**: None

**Gate Thresholds**: 85% (standard)

**AUTO-PROCEED**: Continues through all 5 handoffs automatically when scores pass.

---

### Infrastructure SD

**Workflow**: Modified LEO Workflow (reduced validation)

```
LEAD-TO-PLAN (20%)
      ↓
PLAN-TO-EXEC (40%)
      ↓
[EXEC-TO-PLAN optional - may skip if no code validation needed]
      ↓
PLAN-TO-LEAD (75%)
      ↓
LEAD-FINAL-APPROVAL (100%)
```

**Required**:
- LEAD-TO-PLAN, PLAN-TO-EXEC, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL
- DOCMON sub-agent

**Optional**:
- EXEC-TO-PLAN (can skip if no code validation needed)

**Skipped**:
- TESTING, GITHUB sub-agents
- E2E tests
- Gates 3 & 4 (implementation fidelity)

**Gate Thresholds**: 80%

**AUTO-PROCEED**: May skip EXEC-TO-PLAN if metadata indicates no code validation required.

---

### Documentation SD

**Workflow**: Quick LEO Workflow (minimal validation)

```
LEAD-TO-PLAN (20%)
      ↓
PLAN-TO-EXEC (40%)
      ↓
[EXEC-TO-PLAN optional - no code to validate]
      ↓
PLAN-TO-LEAD (75%)
      ↓
LEAD-FINAL-APPROVAL (100%)
```

**Required**:
- LEAD-TO-PLAN, PLAN-TO-EXEC, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL
- DOCMON sub-agent (critical)

**Optional**:
- EXEC-TO-PLAN (rarely needed for docs-only changes)

**Skipped**:
- TESTING, GITHUB, DESIGN sub-agents
- E2E tests
- Gates 3 & 4
- Implementation Fidelity validation

**Gate Thresholds**: 60%

**AUTO-PROCEED**: Skips EXEC-TO-PLAN automatically for pure documentation changes.

---

### Database SD

**Workflow**: Modified LEO Workflow (database-specific)

```
LEAD-TO-PLAN (20%)
      ↓
PLAN-TO-EXEC (40%)
      ↓
EXEC-TO-PLAN (60%)
      ↓
PLAN-TO-LEAD (75%)
      ↓
LEAD-FINAL-APPROVAL (100%)
```

**Required**:
- All 5 handoffs
- DATABASE sub-agent (MANDATORY)
- Schema validation
- Migration execution verification

**Skipped**:
- Some E2E tests (UI-dependent tests may be skipped)

**Gate Thresholds**: 85%

**AUTO-PROCEED**: Requires DATABASE sub-agent to run during EXEC-TO-PLAN. Continues through all phases.

**Note**: Database SDs MUST invoke DATABASE sub-agent to execute migrations and validate schema changes.

---

### Security SD

**Workflow**: Full LEO Workflow with SECURITY sub-agent

```
LEAD-TO-PLAN (20%)
      ↓
PLAN-TO-EXEC (40%)
      ↓
EXEC-TO-PLAN (60%)
      ↓
PLAN-TO-LEAD (75%)
      ↓
LEAD-FINAL-APPROVAL (100%)
```

**Required**:
- All 5 handoffs
- SECURITY sub-agent (MANDATORY)
- Threat model validation
- Security audit gates

**Skipped**: None

**Gate Thresholds**: 90% (highest)

**AUTO-PROCEED**: Requires SECURITY sub-agent validation. No shortcuts allowed.

---

### Refactor SD

**Workflow**: Intensity-Aware LEO Workflow

**Base Workflow**:
```
LEAD-TO-PLAN (20%)
      ↓
PLAN-TO-EXEC (40%)
      ↓
EXEC-TO-PLAN (60%)
      ↓
PLAN-TO-LEAD (75%)
      ↓
[LEAD-FINAL-APPROVAL optional - depends on intensity]
```

**Required** (varies by intensity):
- **Cosmetic**: LEAD-TO-PLAN → PLAN-TO-LEAD (minimal)
- **Structural**: LEAD-TO-PLAN → PLAN-TO-EXEC → EXEC-TO-PLAN → PLAN-TO-LEAD
- **Architectural**: Full workflow (all 5 handoffs)

**Critical Sub-Agent**:
- REGRESSION sub-agent (MANDATORY for structural/architectural)
- Verifies no behavioral changes
- Baseline comparison required

**Skipped** (varies by intensity):
- **Cosmetic**: E2E tests, REGRESSION (optional), full PRD
- **Structural**: Retrospective (optional)
- **Architectural**: None

**Gate Thresholds**: 80%

**AUTO-PROCEED**: Intensity level determines workflow path. REGRESSION sub-agent always runs for structural/architectural.

**Note**: Intensity level (cosmetic/structural/architectural) is REQUIRED metadata for refactor SDs.

---

### Bugfix SD

**Workflow**: Streamlined LEO Workflow with regression testing

```
LEAD-TO-PLAN (20%)
      ↓
PLAN-TO-EXEC (40%)
      ↓
EXEC-TO-PLAN (60%)
      ↓
PLAN-TO-LEAD (75%)
      ↓
LEAD-FINAL-APPROVAL (100%)
```

**Required**:
- All 5 handoffs
- REGRESSION sub-agent (verify fix doesn't break other code)
- RCA (Root Cause Analysis) for non-trivial bugs

**Skipped**: None (full validation required)

**Gate Thresholds**: 85%

**AUTO-PROCEED**: Continues through all phases. REGRESSION sub-agent runs during EXEC-TO-PLAN.

---

### Performance SD

**Workflow**: Full LEO Workflow with PERFORMANCE sub-agent

```
LEAD-TO-PLAN (20%)
      ↓
PLAN-TO-EXEC (40%)
      ↓
EXEC-TO-PLAN (60%)
      ↓
PLAN-TO-LEAD (75%)
      ↓
LEAD-FINAL-APPROVAL (100%)
```

**Required**:
- All 5 handoffs
- PERFORMANCE sub-agent (MANDATORY)
- Baseline performance metrics
- Before/after comparison benchmarks

**Skipped**: None

**Gate Thresholds**: 85%

**AUTO-PROCEED**: Requires PERFORMANCE sub-agent to run benchmarks and compare results. Continues through all phases.

**Note**: PERFORMANCE sub-agent must show measurable improvement in metrics.

---

### Orchestrator SD

**Workflow**: Parent SD Workflow (children do implementation)

```
LEAD-TO-PLAN (20%)
      ↓
[PLAN-TO-EXEC skipped - no direct implementation]
      ↓
[EXEC-TO-PLAN skipped - children implement]
      ↓
PLAN-TO-LEAD (75%)
      ↓
LEAD-FINAL-APPROVAL (100%)
```

**Required**:
- LEAD-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL
- All children must complete their workflows

**Optional**:
- PLAN-TO-EXEC, EXEC-TO-PLAN (skipped - children do this work)

**Skipped**:
- E2E tests (children run their own tests)
- Implementation Fidelity (children implement)
- Deliverables Gate (children produce deliverables)

**Gate Thresholds**: 85%

**AUTO-PROCEED**:
- LEAD-TO-PLAN → Creates child SDs
- Children work independently (each follows their own SD type workflow)
- PLAN-TO-LEAD → Verifies all children completed
- LEAD-FINAL-APPROVAL → Orchestrator complete

**Note**: Orchestrator completion is driven by child SD completion, not direct code implementation.

---

## AUTO-PROCEED Workflow Routing Logic

### Implementation

**File**: `scripts/modules/handoff/cli/cli-main.js`

**Function**: `getNextInWorkflow(currentHandoff, sdType)`

```javascript
function getNextInWorkflow(currentHandoff, sdType) {
  // Orchestrator-specific workflow (skips PLAN-TO-EXEC and EXEC-TO-PLAN)
  if (sdType === 'orchestrator') {
    const orchestratorSequence = {
      'LEAD-TO-PLAN': null,              // Terminal - children work outside parent
      'PLAN-TO-LEAD': 'LEAD-FINAL-APPROVAL',
      'LEAD-FINAL-APPROVAL': null,
    };
    return orchestratorSequence[currentHandoff] ?? null;
  }

  // Full workflow (feature, database, security, bugfix, performance)
  const fullSequence = {
    'LEAD-TO-PLAN': 'PLAN-TO-EXEC',
    'PLAN-TO-EXEC': 'EXEC-TO-PLAN',      // Added 2026-02-01 (was missing)
    'EXEC-TO-PLAN': 'PLAN-TO-LEAD',
    'PLAN-TO-LEAD': 'LEAD-FINAL-APPROVAL',
    'LEAD-FINAL-APPROVAL': null,
  };
  return fullSequence[currentHandoff] ?? null;
}
```

**Why SD-Type Awareness Is Critical**:
- Orchestrators skip PLAN-TO-EXEC and EXEC-TO-PLAN (children do implementation)
- Infrastructure/Documentation SDs may skip EXEC-TO-PLAN (optional)
- Refactor SDs may skip LEAD-FINAL-APPROVAL (depends on intensity)
- AUTO-PROCEED must know the correct next handoff for each SD type

---

## Child SD Selection (Within Orchestrators)

**File**: `scripts/modules/handoff/child-sd-selector.js`

**Function**: `getNextReadyChild(supabase, parentSdId, excludeCompletedId)`

When an orchestrator child completes, AUTO-PROCEED selects the next child based on:
1. **Urgency Score** (priority band → score → enqueue time)
2. **Blocked Status** (children with unresolved blockers are skipped)
3. **SD Type** (each child follows its own SD type workflow)

**Each child SD requires fresh context loading:**
- Read CLAUDE.md and CLAUDE_CORE.md (MANDATORY)
- Read phase-specific file (CLAUDE_LEAD.md, CLAUDE_PLAN.md, or CLAUDE_EXEC.md)

**Critical Fix (2026-02-01)**:
- Added `sd_type` to child SD selection query (line 46)
- Ensures AUTO-PROCEED knows each child's workflow requirements

---

## Workflow Validation Gate Enforcement

### SD Type-Aware Validation Policy

**File**: `scripts/modules/handoff/validation/sd-type-applicability-policy.js`

Different SD types have different validator requirements:

| SD Type | Required Validators | Non-Applicable Validators |
|---------|-------------------|---------------------------|
| **refactor** | REGRESSION, GITHUB | TESTING, DESIGN, DATABASE, STORIES |
| **infrastructure** | DOCMON | TESTING, DESIGN, GITHUB |
| **feature** | TESTING, DESIGN, DOCMON, STORIES, GITHUB | None |
| **database** | DATABASE, TESTING, GITHUB | DESIGN |
| **security** | SECURITY, TESTING, GITHUB | None |
| **documentation** | DOCMON | TESTING, DESIGN, GITHUB, DATABASE, REGRESSION, STORIES |
| **bugfix** | TESTING, REGRESSION | DESIGN, STORIES |
| **performance** | TESTING, REGRESSION, GITHUB | DESIGN, STORIES |

**SKIPPED Status**: Non-applicable validators return `status: 'SKIPPED'` with `score: 100`, counted as passing.

**Impact**: Prevents 75% handoff rejection rate for refactor/infrastructure SDs.

---

## Progress Calculation by SD Type

**Database Function**: `get_min_required_handoffs(sd_type VARCHAR)`

**Migration**: `database/migrations/20260124_sd_type_aware_progress_calculation.sql`

```sql
CREATE OR REPLACE FUNCTION get_min_required_handoffs(sd_type_param VARCHAR)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE
    -- Infrastructure/Documentation SDs - minimal handoffs
    WHEN sd_type_param IN ('infrastructure', 'documentation', 'docs', 'process', 'qa', 'orchestrator')
    THEN 2

    -- Refactor SDs - need REGRESSION but skip TESTING/DESIGN
    WHEN sd_type_param = 'refactor'
    THEN 2

    -- Bugfix/Performance - lighter than feature
    WHEN sd_type_param IN ('bugfix', 'performance', 'enhancement')
    THEN 3

    -- Feature/Database/Security - full validation
    WHEN sd_type_param IN ('feature', 'database', 'security')
    THEN 3

    -- Default (unknown type) - require full validation (safe default)
    ELSE 3
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

**Impact on Progress**:
- Infrastructure SD: 2 handoffs = 100% (not 3)
- Refactor SD: 2 handoffs = 100% (not 3)
- Feature/Database/Security SD: 3 handoffs = 100%

---

## Common Workflow Failures (Root Causes)

### 1. AUTO-PROCEED Stops After PLAN-TO-LEAD (97%)

**Symptom**: Workflow pauses instead of continuing to LEAD-FINAL-APPROVAL.

**Root Cause**: Missing `PLAN-TO-LEAD` → `LEAD-FINAL-APPROVAL` mapping in `WORKFLOW_SEQUENCE` (2026-02-01 fix).

**Solution**: Added complete workflow sequence with SD-type awareness in `getNextInWorkflow()`.

---

### 2. Orchestrator SD Fails EXEC-TO-PLAN Gate

**Symptom**: Orchestrator SD blocked at EXEC-TO-PLAN validation.

**Root Cause**: Orchestrators have no direct implementation - children do the work.

**Solution**: Orchestrator workflow skips PLAN-TO-EXEC and EXEC-TO-PLAN. Children complete their own workflows.

---

### 3. Refactor SD Rejected at 75% (3 Handoffs)

**Symptom**: EXEC-TO-PLAN handoff rejected for missing TESTING/DESIGN validators.

**Root Cause**: Refactor SDs don't change UI or add features - validators were non-applicable.

**Solution**: SD-type-aware validation policy skips TESTING/DESIGN for refactor SDs. REGRESSION is required instead.

---

### 4. Child SD Selector Returns Wrong Workflow

**Symptom**: AUTO-PROCEED tries to execute wrong handoff for child SD.

**Root Cause**: Child SD query missing `sd_type` field (2026-02-05 fix).

**Solution**: Added `sd_type` to query (line 46 in `child-sd-selector.js`). Each child now follows its own SD type workflow.

---

## Integration with AUTO-PROCEED

### SD Continuation Truth Table

**Reference**: `CLAUDE.md` - SD Continuation Truth Table

| Transition Context | AUTO-PROCEED | Chaining | Behavior |
|-------------------|:------------:|:--------:|----------|
| Child completes → next child | ON | * | **AUTO-CONTINUE** to next ready child (priority-based) |
| All children complete (orchestrator done) | ON | ON | Run /learn → **AUTO-CONTINUE** to next orchestrator |
| All children complete (orchestrator done) | ON | OFF | Run /learn → Show queue → **PAUSE** |
| Dependency unresolved | * | * | **SKIP** SD, continue to next ready |

**Implementation**: `scripts/modules/handoff/cli/cli-main.js` - `handleExecuteWithContinuation()`

**Critical Fix (2026-02-01)**:
- Added WORKFLOW_SEQUENCE mappings (PLAN-TO-LEAD, EXEC-TO-PLAN)
- Implemented SD-type-aware routing via `getNextInWorkflow()`
- Orchestrators skip PLAN-TO-EXEC and EXEC-TO-PLAN
- Children continue through their own workflow sequences

---

## Related Documentation

- **[Handoff System Guide](../leo/handoffs/handoff-system-guide.md)** - Gate validation, executor catalog, prerequisite chains
- **[Validation Enforcement Framework](validation-enforcement.md)** - Adaptive thresholds, gate architecture
- **[Workflow Definitions](../../scripts/modules/handoff/cli/workflow-definitions.js)** - Canonical source of truth
- **[SD Type Applicability Policy](../../scripts/modules/handoff/validation/sd-type-applicability-policy.js)** - Validator requirement levels
- **[CLAUDE.md](../../CLAUDE.md)** - SD Continuation Truth Table, AUTO-PROCEED mode
- **[CLAUDE_CORE.md](../../CLAUDE_CORE.md)** - SD type definitions, requirements, gate thresholds

---

## Summary

**Key Takeaways**:
1. **SD types determine workflow** - Not all SDs follow the same handoff sequence
2. **Orchestrators skip implementation phases** - Children do PLAN-TO-EXEC and EXEC-TO-PLAN work
3. **Refactor SDs use REGRESSION, not TESTING** - Intensity-aware workflow
4. **AUTO-PROCEED requires SD-type awareness** - Routing logic in `getNextInWorkflow()`
5. **Each child follows its own workflow** - Orchestrator children may have different SD types
6. **Progress calculation is SD-type-aware** - Minimum handoff count varies (2-3)
7. **Validators are SD-type-aware** - Non-applicable validators return SKIPPED status

**When Adding New SD Types**:
1. Update `workflow-definitions.js` with required/optional handoffs
2. Update `sd-type-applicability-policy.js` with validator requirements
3. Update `get_min_required_handoffs()` database function
4. Add SD type to `getNextInWorkflow()` if it has special routing logic
5. Update this documentation with new SD type workflow

---

*Version 1.0.0 | Generated 2026-02-05 | LEO Protocol v4.3.3*
