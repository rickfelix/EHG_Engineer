---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 4: Gaps & Implementation Backlog

**Source**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-04.md:28-54

---

## Critical Gaps (Block Automation)

### GAP-S4-001: Competitive Intelligence Tool Integrations Missing

**Issue**: stages.yaml references competitor identification but no tool integrations defined

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:164; critique notes "Missing specific tool integrations" (stage-04.md:25)

**Impact**: Manual competitor research required; inefficient and incomplete coverage

**Proposed Artifacts**:
1. Integrate competitive intelligence APIs:
   - CB Insights for startup competitor tracking
   - Crunchbase for funding/company data
   - SimilarWeb for website traffic analysis
   - G2/Capterra for feature comparison data
2. Define competitor schema (name, URL, description, market_share, funding, features)
3. Implement automated competitor monitoring (alert on new funding, feature launches)

**Priority**: P0 (blocks automation)

---

### GAP-S4-002: Recursion Support Not Detailed

**Issue**: Critique contains recursion section header (line 28) but no trigger details like Stage 3

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-04.md:28 (header only, compare to stage-03.md:29-86)

**Impact**: Cannot handle recursion from downstream stages (e.g., if Stage 5 profitability reveals positioning invalid)

**Proposed Artifacts**:
1. Define recursion triggers:
   - **FIN-002** (from Stage 5): If pricing strategy contradicts competitive positioning
   - **MKT-002** (from Stage 6+): If market research reveals competitor analysis incomplete
   - **IP-001** (from Stage 10+): If IP review reveals moat not defensible
2. Document recursion behavior (preserve context, re-analyze with new data)
3. Add recursion tracking to `recursion_events` table

**Priority**: P0 (blocks recursion feature for Stage 4)

---

## Important Gaps (Reduce Quality)

### GAP-S4-003: Differentiation Score Calculation Not Defined

**Issue**: stages.yaml lists "Differentiation score" metric but no calculation formula

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:150; critique notes "Metrics defined but validation criteria unclear" (stage-04.md:9)

**Impact**: Cannot measure positioning strength programmatically

**Proposed Artifacts**:
1. Define differentiation score formula: `(usp_strength + moat_strength) / 2`
2. Define USP strength rubric (unique features, pain point addressed, articulation)
3. Define moat strength rubric (network effects, IP, brand, barriers to entry)
4. Implement scoring calculation and validation query

**Priority**: P1 (impacts quality measurement)

---

### GAP-S4-004: Rollback Procedures Undefined

**Issue**: Critique notes "Unclear rollback procedures"

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-04.md:23

**Impact**: If Stage 4 fails (e.g., no clear differentiation), unclear how to recover

**Proposed Artifacts**:
1. Define rollback decision tree:
   - If competitor count < 5 → Return to 4.1
   - If feature matrix incomplete → Return to 4.2
   - If USP unclear → Return to 4.3
   - If no defensible moat → Escalate to Chairman (may need to return to Stage 3)
2. Document state cleanup (archive partial competitive analysis)
3. Add rollback triggers to exit gates

**Priority**: P1 (impacts reliability)

---

## Minor Gaps (Nice-to-Have)

### GAP-S4-005: Feature Matrix Storage Not Defined

**Issue**: stages.yaml references "Feature matrix complete" but no database schema

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/stages.yaml:169

**Impact**: Manual feature comparison; cannot track feature parity over time

**Proposed Artifacts**:
1. Create `feature_matrix` table (venture_id, competitor_id, feature_id, has_feature BOOLEAN)
2. Define feature taxonomy (10-20 standard features for each industry vertical)
3. Build feature comparison UI component

**Priority**: P2 (enhances automation)

---

### GAP-S4-006: Customer Validation Touchpoint Missing

**Issue**: Critique notes "UX/Customer Signal: 1" (no customer interaction)

**Evidence**: EHG_Engineer@6ef8cf4:docs/workflow/critique/stage-04.md:14

**Impact**: Competitive analysis and positioning isolated from customer reality

**Proposed Artifacts**:
1. Add optional customer feedback loop in Substage 4.3 (validate USP with 3-5 target users)
2. Capture customer reactions to positioning statement
3. Update exit gates to include "Customer positioning validated (optional)"

**Priority**: P3 (enhancement)

---

## Backlog Summary

| Gap ID | Title | Priority | Blocks Automation? | Estimated Effort |
|--------|-------|----------|-------------------|------------------|
| GAP-S4-001 | Competitive Intelligence Tool Integrations | P0 | ✅ Yes | 5-7 days |
| GAP-S4-002 | Recursion Support Not Detailed | P0 | ✅ Yes | 2-3 days |
| GAP-S4-003 | Differentiation Score Calculation | P1 | ❌ No | 2-3 days |
| GAP-S4-004 | Rollback Procedures Undefined | P1 | ❌ No | 1-2 days |
| GAP-S4-005 | Feature Matrix Storage Not Defined | P2 | ❌ No | 3-4 days |
| GAP-S4-006 | Customer Validation Touchpoint | P3 | ❌ No | 2-3 days |

**Total Estimated Effort**: 15-22 days

---

## Sources Table

| Source | Repo | Commit | Path | Lines |
|--------|------|--------|------|-------|
| Critique weaknesses | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-04.md | 22-26 |
| Recursion gap | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-04.md | 28 |
| Improvement priorities | EHG_Engineer | 6ef8cf4 | docs/workflow/critique/stage-04.md | 65-70 |
| Metrics | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 148-150 |
| Substages | EHG_Engineer | 6ef8cf4 | docs/workflow/stages.yaml | 160-180 |

<!-- Generated by Claude Code Phase 3 | EHG_Engineer@6ef8cf4 | 2025-11-05 -->
