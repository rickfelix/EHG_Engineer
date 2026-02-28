---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Root Cause Analysis: Refactor SD Workflow Issues


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-24
- **Tags**: database, testing, feature, leo

**RCA ID**: RCA-REFACTOR-SD-WORKFLOW-001
**Date**: 2026-01-24
**Affected SDs**: SD-LEO-REFAC-DB-SUB-003, SD-LEO-REFAC-BASE-AGENT-003, SD-LEO-REFAC-UAT-ASSESS-003
**Impact**: High - 75% handoff rejection rate, completion blocked despite merged PRs

---

## 1. Issue Summary

During execution of three refactor-type child SDs from orchestrator SD-LEO-REFACTOR-LARGE-FILES-003, we encountered systematic workflow failures:

| Issue | Frequency | Impact |
|-------|-----------|--------|
| Database completion trigger blocking | 3/3 SDs | Could not mark SD complete despite merged PR |
| TESTING sub-agent validation failure | 3/3 SDs | Required bypass to proceed |
| DESIGN sub-agent validation failure | 2/3 SDs | Required bypass to proceed |
| Progress calculation stuck at 45% | 3/3 SDs | Triggered completion block |
| High handoff rejection rate | ~75% | 16 attempts for 4 acceptances |

---

## 2. Five-Whys Analysis

### Problem 1: SD Completion Blocked Despite Merged PRs

**Why 1**: Why couldn't we mark the SD as completed?
→ Database trigger `enforce_sd_completion_requirements` rejected the update with "Progress: 45% (need 100%)"

**Why 2**: Why did the progress show 45% when all work was done?
→ Progress calculation function checks for `subagent_verified`, `user_stories_validated`, and `deliverables_complete` flags

**Why 3**: Why weren't those flags set to true?
→ The validation gates (TESTING, DESIGN sub-agents) were failing, so no record was created to set those flags

**Why 4**: Why were TESTING and DESIGN sub-agents required for a refactor SD?
→ The validation profile for `refactor` type requires `requires_sub_agents: true` without specifying WHICH sub-agents

**Why 5**: Why doesn't the system distinguish between applicable and non-applicable sub-agents per SD type?
→ **ROOT CAUSE**: The sub-agent validation is binary (run/not-run) rather than context-aware. Refactor SDs should only require REGRESSION sub-agent, not TESTING or DESIGN.

---

### Problem 2: High Handoff Rejection Rate (75%)

**Why 1**: Why did 75% of handoff attempts fail?
→ Validation gates for TESTING and DESIGN sub-agents returned failures

**Why 2**: Why did those gates fail?
→ The validators check for sub-agent execution records in `sub_agent_executions` table that don't exist

**Why 3**: Why don't those records exist?
→ We ran REGRESSION sub-agent (appropriate for refactors) but not TESTING/DESIGN (inappropriate for refactors)

**Why 4**: Why does the system expect TESTING/DESIGN for refactor SDs?
→ Gate configuration doesn't differentiate by SD type - same gates apply to all SDs

**Why 5**: Why isn't gate configuration SD-type-aware?
→ **ROOT CAUSE**: Gates are configured globally rather than per SD-type profile. The `sd_type_validation_profiles` table defines requirements but gate validators don't read from it.

---

### Problem 3: Progress Calculation Mismatch

**Why 1**: Why did progress stay at 45% after all handoffs passed?
→ Progress function `get_progress_breakdown()` returned incomplete phases

**Why 2**: Why did it show phases as incomplete?
→ `PLAN_verification.subagent_verified` and `EXEC_implementation.deliverables_complete` were false

**Why 3**: Why were those flags false?
→ The system looks for specific sub-agent verdicts and deliverable records that weren't created

**Why 4**: Why weren't they created?
→ The handoff system bypassed validations but didn't create placeholder records for skipped validations

**Why 5**: Why doesn't bypass create placeholder records?
→ **ROOT CAUSE**: Bypass flag skips validation but doesn't reconcile the progress calculation. The two systems are disconnected.

---

## 3. Root Causes Identified

| ID | Root Cause | Category |
|----|------------|----------|
| RC-1 | Sub-agent validation is binary, not context-aware per SD type | Validation Logic |
| RC-2 | Gates are globally configured, not SD-type-aware | Gate Configuration |
| RC-3 | Bypass flag doesn't reconcile with progress calculation | State Management |
| RC-4 | Progress calculation doesn't recognize handoff bypass as valid completion | Progress Logic |

---

## 4. Recommended Solutions (Simplified)

### Solution 1: Skip Non-Applicable Validators by SD Type (PRIMARY FIX)
**Addresses**: RC-1, RC-2
**Complexity**: Low - ~20 lines of code

Add an early-exit check to sub-agent validators:

```javascript
// In sub-agent-validator.js
const REQUIRED_AGENTS_BY_TYPE = {
  refactor: ['REGRESSION'],
  documentation: [],
  bugfix: ['TESTING'],
  feature: ['DESIGN', 'TESTING'],
  infrastructure: ['TESTING']
};

// Early exit if this agent isn't required for this SD type
const required = REQUIRED_AGENTS_BY_TYPE[sdType] || ['TESTING', 'DESIGN'];
if (!required.includes(agentType)) {
  return { score: 100, skipped: true, reason: `${agentType} not required for ${sdType} SDs` };
}
```

### Solution 2: Treat "Skipped" as Valid in Progress Calculation
**Addresses**: RC-3, RC-4
**Complexity**: Low - ~10 lines of code

Update progress calculation to recognize skipped validations:

```sql
-- In progress calculation trigger
-- Instead of checking: subagent_verified = true
-- Check: subagent_verified = true OR subagent_skipped_for_type = true
```

### Why Not More Complex?

- **No new tables needed** - Use existing `sd_type_validation_profiles` or inline config
- **No new columns needed** - Return `skipped: true` in validation result
- **No bypass reconciliation needed** - Validators just return 100% for non-applicable checks
- **Backward compatible** - Feature SDs still get full validation

---

## 5. Action Items (Simplified)

| Priority | Action | Est. LOC |
|----------|--------|----------|
| HIGH | Add SD-type check to sub-agent validators | ~20 |
| HIGH | Update progress trigger to recognize skipped validations | ~10 |

**Total estimated change**: ~30 lines of code

---

## 6. Affected Files

| File | Change |
|------|--------|
| `scripts/modules/handoff/validators/sub-agent-validator.js` | Add early-exit for non-applicable SD types |
| `database/functions/calculate_sd_progress.sql` | Treat skipped as valid |

---

## 7. Success Criteria for Fix SD

1. Refactor SDs complete with REGRESSION sub-agent only (no TESTING/DESIGN required)
2. Progress calculation reaches 100% after valid handoffs
3. No bypass needed for non-applicable sub-agent validations
4. Handoff acceptance rate > 90% for compliant SDs
