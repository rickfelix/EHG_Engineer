---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
<!-- ARCHIVED: 2026-01-26T16:26:44.484Z
     Reason: Duplicate of canonical file
     Original location: docs\workflow\dossiers\stage-03\05_professional-sop.md
     See: docs/fixes/duplicate-consolidation-manifest.json for details
-->

# Stage 3: Professional SOP


## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-21
- **Tags**: validation, workflow, ci, context

**Purpose**: Validate problem-solution fit, willingness to pay, and make Kill/Revise/Proceed decision

---

## Entry Conditions

**Pre-Execution Checklist**:

- [ ] Stage 2 complete (AI review exists)
- [ ] AI critique report available
- [ ] Risk assessment done (top-5 risks identified)
- [ ] Market research accessible
- [ ] User interview candidates identified

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:105-107 `"gates.entry"`

---

## Execution Steps

### Substage 3.1: Problem Validation

**Owner**: PLAN agent

**Steps**:
1. Load AI review report from Stage 2
2. Conduct user interviews (minimum: 5-10 target users)
3. Document pain points and problem severity
4. Compare user feedback to AI review assumptions
5. Calculate problem validation score

**Done When**:
- User interviews conducted
- Pain points documented

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:113-117

---

### Substage 3.2: Solution Validation

**Owner**: PLAN agent

**Steps**:
1. Present proposed solution to interviewed users
2. Confirm solution-fit (does solution address pain points?)
3. Define MVP scope based on user feedback
4. Validate technical feasibility
5. Calculate solution validation score

**Done When**:
- Solution-fit confirmed
- MVP scope defined

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:118-122

---

### Substage 3.3: Willingness to Pay

**Owner**: PLAN agent

**Steps**:
1. Capture pricing signals from user interviews
2. Test revenue model assumptions
3. Validate willingness to pay at proposed price points
4. Calculate expected conversion rates
5. Calculate willingness-to-pay score

**Done When**:
- Pricing signals captured
- Revenue model validated

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:123-127

---

### Substage 3.4: Kill/Revise/Proceed Gate

**Owner**: PLAN agent + Chairman approval

**Steps**:
1. Aggregate validation scores (problem, solution, willingness-to-pay)
2. Calculate overall validation score
3. Apply decision criteria:
   - **KILL**: Validation score < 50% → Terminate venture
   - **REVISE**: 50% ≤ Validation score < 75% → Return to Stage 1, 2, or 3
   - **PROCEED**: Validation score ≥ 75% → Advance to Stage 4
4. Document decision and rationale
5. Define next steps

**Done When**:
- Decision documented
- Next steps defined

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:128-133

---

## Exit Conditions

**Validation Checklist**:

- [ ] Problem validated
- [ ] Solution validated
- [ ] Kill/Revise/Proceed decision made
- [ ] Validation report generated
- [ ] User feedback documented
- [ ] Feasibility assessment complete

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:108-111

---

## Rollback Procedure

**Triggers** (from critique):
- Validation score < 50% (KILL decision)
- 50% ≤ Validation score < 75% (REVISE decision)
- Recursion trigger from downstream stage (FIN-001, MKT-001, QUALITY-001)

**Actions**:
1. **If KILL**: Archive venture, notify Chairman, stop workflow
2. **If REVISE**: Determine target stage for rework:
   - Problem validation failed → Return to Stage 1
   - AI review assumptions invalid → Return to Stage 2
   - Solution validation failed → Retry Stage 3
3. **If Recursion**: Execute recursion behavior (see 07_recursion-blueprint.md)
4. Escalate to Chairman if blockers persist

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:103-108

---

## Recursion Handling

**When recursion triggered** (e.g., FIN-001 from Stage 5):

1. **Preserve Context**: Store original validation scores
2. **Re-validate with New Constraints**:
   - Problem validation: Adjust for financial insights
   - Solution validation: Adjust for technical insights
   - Willingness to pay: Adjust for updated ROI expectations
3. **Comparison Analysis**: Show delta between original and updated scores
4. **Re-apply Decision Gate**: May change decision based on new insights

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-03.md:42-50

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Entry gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 105-107 |
| Exit gates | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 108-111 |
| Substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 112-133 |
| Rollback procedure | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 103-108 |
| Recursion handling | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-03.md | 42-50 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
