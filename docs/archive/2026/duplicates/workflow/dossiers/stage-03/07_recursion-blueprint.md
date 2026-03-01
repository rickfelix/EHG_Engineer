---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-03-01
tags: [general, auto-generated]
---

## Table of Contents

- [Metadata](#metadata)
- [Intelligent Dependency-Driven Recursion](#intelligent-dependency-driven-recursion)
- [Inbound Recursion Triggers](#inbound-recursion-triggers)
- [Recursion Behavior When Triggered](#recursion-behavior-when-triggered)
  - [1. Preserve Context](#1-preserve-context)
  - [2. Re-validate with New Constraints](#2-re-validate-with-new-constraints)
  - [3. Kill/Revise/Proceed Gate May Change](#3-killreviseproceed-gate-may-change)
  - [4. Comparison Analysis](#4-comparison-analysis)
- [Outbound Recursion Triggers](#outbound-recursion-triggers)
- [Loop Prevention](#loop-prevention)
- [Chairman Controls](#chairman-controls)
- [Performance Requirements](#performance-requirements)
- [UI/UX Implications](#uiux-implications)
- [Sources Table](#sources-table)

---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
<!-- ARCHIVED: 2026-01-26T16:26:48.663Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-03\07_recursion-blueprint.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 3: Recursion Blueprint


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, schema, sd, validation

**Status**: ✅ **DETAILED RECURSION SUPPORT**

**Consistency Scan Result**: Y/Y/Y (Detailed recursion implemented)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:29-86

---

## Intelligent Dependency-Driven Recursion

Stage 3 participates in the unified venture creation system (SD-VENTURE-UNIFICATION-001) where downstream stages can automatically trigger recursion back to this stage when dependencies are violated.

---

## Inbound Recursion Triggers

**Recursion Triggers That May RETURN TO This Stage**:

| From Stage | Trigger Type | Condition | Severity | Auto-Execute? | Reason |
|------------|--------------|-----------|----------|---------------|--------|
| Stage 5 | FIN-001 | ROI < 15% | CRITICAL | Yes | Profitability forecasting reveals venture is not financially viable, requires re-validation of problem-solution fit and willingness-to-pay assumptions |
| Stage 6+ | MKT-001 | Market validation failure | HIGH | Needs approval | Market research reveals flaws in original validation assumptions |
| Stage 10+ | QUALITY-001 | Quality standard violation | HIGH | Needs approval | Technical review uncovers quality issues requiring fundamental rework |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:35-40

---

## Recursion Behavior When Triggered

**When Stage 5 (or other downstream stages) triggers recursion back to Stage 3**:

### 1. Preserve Context

**Action**: All validation data from previous pass is retained for comparison

**Database**: Store original validation scores in `validation_history` table

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:43-44

---

### 2. Re-validate with New Constraints

**Steps**:
- **Problem validation**: Re-run with updated financial/market data
- **Solution validation**: Re-run with technical feasibility insights
- **Willingness to pay**: Reassess with corrected ROI expectations

**Example**: If FIN-001 triggered due to ROI 8.5% (below 15% threshold), re-validate willingness-to-pay with lower ROI target.

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:45-49

---

### 3. Kill/Revise/Proceed Gate May Change

**Original Decision**: PROCEED (validation score 80%)

**After Recursion**: May change to REVISE or KILL based on new downstream insights

**Example**: Original validation assumed 25% conversion rate; FIN-001 reveals only 10% feasible → Validation score drops to 60% → Decision changes to REVISE

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:50

---

### 4. Comparison Analysis

**UI Display**: Show delta between original and updated validation scores

**Example**:
```
Original Pass (Stage 3.1):
- Problem Validation: 85%
- Solution Validation: 80%
- Willingness to Pay: 75%
- Overall: 80% (PROCEED)

After FIN-001 Recursion:
- Problem Validation: 85% (no change)
- Solution Validation: 80% (no change)
- Willingness to Pay: 45% (↓30%)
- Overall: 70% (REVISE)

Delta: -10% → Decision changed to REVISE
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:51

---

## Outbound Recursion Triggers

**Triggers FROM This Stage**:

| Target Stage | Trigger Type | Condition | Severity | Reason |
|--------------|--------------|-----------|----------|--------|
| Stage 2 | MKT-001 | User validation contradicts AI analysis | MEDIUM | Need additional AI review with real user feedback |
| Stage 1 | CUSTOM | Technical infeasibility discovered | HIGH | Fundamental problem definition needs rework |

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:54-59

---

## Loop Prevention

**Recursion Limits**:
- **Max recursions**: 3 returns to Stage 3 per venture
- **Escalation**: After 3rd recursion, Chairman approval required to continue
- **Tracking**: All recursions logged in `recursion_events` table

**Database Schema**:
```sql
recursion_events (
  venture_id UUID,
  from_stage INT,
  to_stage INT,
  trigger_type VARCHAR,
  recursion_count_for_stage INT,  -- Incremented each time
  trigger_data JSONB,              -- e.g., {"original_roi": 8.5, "threshold": 15}
  resolution_notes TEXT            -- What changed between iterations
)
```

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:62-68

---

## Chairman Controls

**CRITICAL severity** (FIN-001 from Stage 5):
- **Auto-executed**: Recursion triggers immediately
- **Post-notification**: Chairman notified after execution

**HIGH severity** (MKT-001, QUALITY-001):
- **Requires approval**: Chairman must approve before recursion
- **Override capability**: Chairman can skip recursion and proceed despite violations

**Chairman Override Options**:
- Skip recursion and proceed despite violations
- Modify severity thresholds for specific ventures
- Approve continuation after max recursions exceeded

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:71-76

---

## Performance Requirements

- **Detection latency**: <100ms for recursion trigger evaluation
- **Async execution**: Non-blocking, user sees progress indicator during recursion processing
- **Database logging**: Every recursion event tracked with full context for analytics

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:78-80

---

## UI/UX Implications

**Recursion History Panel**: Shows timeline of all recursions affecting this stage

**Comparison View**: Side-by-side of validation scores before/after recursion

**Explanation**: Clear messaging explaining why recursion occurred (e.g., "ROI dropped to 8.5%, below 15% threshold")

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:82-86

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Recursion triggers | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 35-40 |
| Recursion behavior | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 42-51 |
| Outbound triggers | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 54-59 |
| Loop prevention | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 62-68 |
| Chairman controls | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 71-76 |
| Performance/UI | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 78-86 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
