---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
<!-- ARCHIVED: 2026-01-26T16:26:54.729Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-03\10_gaps-backlog.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 3: Gaps & Implementation Backlog


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: database, api, schema, feature

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:87-114

---

## Critical Gaps (Block Automation)

### GAP-S3-001: Validation Score Calculation Not Implemented

**Issue**: Critique notes metrics defined but validation criteria unclear; no formula for aggregate validation score

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:9

**Impact**: Cannot automate Kill/Revise/Proceed decision gate; manual review required

**Proposed Artifacts**:
1. Define validation score formula:
   - `overall_validation_score = (problem_validation_pct + solution_validation_pct + willingness_to_pay_pct) / 3`
2. Implement database schema for `validation_scores` table
3. Create automated decision gate logic with thresholds (PROCEED: ≥75%, KILL: <50%)

**Priority**: P0 (blocks automation)

---

### GAP-S3-002: Recursion Event Tracking Not Implemented

**Issue**: Detailed recursion blueprint exists in critique, but no database implementation

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:62-68 (describes `recursion_events` table, but not implemented)

**Impact**: Cannot track recursion history, enforce max recursion count, or display comparison analysis

**Proposed Artifacts**:
1. Create `recursion_events` table with schema:
   ```sql
   recursion_events (
     venture_id UUID,
     from_stage INT,
     to_stage INT,
     trigger_type VARCHAR,
     recursion_count_for_stage INT,
     trigger_data JSONB,
     resolution_notes TEXT,
     trigger_time TIMESTAMP,
     resolution_time TIMESTAMP
   )
   ```
2. Implement recursion count enforcement (max 3 per stage)
3. Build recursion history panel UI component

**Priority**: P0 (blocks recursion feature)

---

## Important Gaps (Reduce Quality)

### GAP-S3-003: User Interview Tool Integration Missing

**Issue**: stages.yaml references "User interviews conducted" but no tool integration defined

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:116; critique notes "Missing specific tool integrations" (stage-03.md:26)

**Impact**: Manual user interview scheduling and recording; reduces efficiency

**Proposed Artifacts**:
1. Integrate scheduling tools (Calendly, Google Calendar API)
2. Integrate video conferencing (Zoom API for recording/transcription)
3. Implement user interview template and scoring rubric

**Priority**: P1 (impacts efficiency)

---

### GAP-S3-004: Rollback Procedures Incomplete

**Issue**: Critique notes "Unclear rollback procedures"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:25

**Impact**: If Stage 3 fails or KILL/REVISE decision made, unclear how to recover state

**Proposed Artifacts**:
1. Define rollback decision tree for KILL/REVISE/PROCEED outcomes
2. Document state cleanup procedures (archive validation data, reset venture status)
3. Implement automated rollback triggers for each decision outcome

**Priority**: P1 (impacts reliability)

---

### GAP-S3-005: Chairman Approval Workflow Not Implemented

**Issue**: Recursion blueprint specifies Chairman approval for HIGH severity triggers (MKT-001, QUALITY-001) but no workflow exists

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:71-76

**Impact**: Cannot enforce approval requirements; all recursions auto-execute or all require manual intervention

**Proposed Artifacts**:
1. Implement approval request workflow (notify Chairman, wait for response)
2. Build Chairman override UI (skip recursion, modify thresholds)
3. Add audit trail for all Chairman override actions

**Priority**: P1 (impacts governance)

---

## Minor Gaps (Nice-to-Have)

### GAP-S3-006: Validation Delta Comparison UI Missing

**Issue**: Recursion blueprint describes comparison view showing before/after validation scores, but not implemented

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:82-86

**Impact**: Users cannot see impact of recursion; reduced transparency

**Proposed Artifacts**:
1. Build side-by-side comparison UI component
2. Implement validation score trend line chart
3. Add explanation text for why recursion occurred

**Priority**: P2 (enhances UX)

---

### GAP-S3-007: Technical Feasibility Assessment Not Defined

**Issue**: stages.yaml lists "Technical feasibility score" metric but no assessment method

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:102

**Impact**: Cannot measure technical feasibility programmatically

**Proposed Artifacts**:
1. Define technical feasibility rubric (10 criteria, 0-100 scale)
2. Integrate with technical review agents
3. Implement automated scoring

**Priority**: P3 (enhancement)

---

## Backlog Summary

| Gap ID | Title | Priority | Blocks Automation? | Estimated Effort |
|--------|-------|----------|-------------------|------------------|
| GAP-S3-001 | Validation Score Calculation | P0 | ✅ Yes | 2-3 days |
| GAP-S3-002 | Recursion Event Tracking | P0 | ✅ Yes | 3-5 days |
| GAP-S3-003 | User Interview Tool Integration | P1 | ❌ No | 5-7 days |
| GAP-S3-004 | Rollback Procedures Incomplete | P1 | ❌ No | 1-2 days |
| GAP-S3-005 | Chairman Approval Workflow | P1 | ❌ No | 3-5 days |
| GAP-S3-006 | Validation Delta Comparison UI | P2 | ❌ No | 2-3 days |
| GAP-S3-007 | Technical Feasibility Assessment | P3 | ❌ No | 3-4 days |

**Total Estimated Effort**: 19-29 days

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Critique weaknesses | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 24-27 |
| Recursion blueprint | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 62-68, 71-76, 82-86 |
| Improvement priorities | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 124-129 |
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 100-102 |
| Substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 112-133 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
