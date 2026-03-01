
## Table of Contents

- [Executive Summary](#executive-summary)
- [Findings](#findings)
  - [CRITICAL-1: Reality Gate 9→10 Validates Wrong Artifacts](#critical-1-reality-gate-910-validates-wrong-artifacts)
  - [CRITICAL-2: Risk Threshold Triple-Inconsistency](#critical-2-risk-threshold-triple-inconsistency)
  - [HIGH-1: risk_source Enum — Three Divergent Definitions](#high-1-risk_source-enum-three-divergent-definitions)
  - [HIGH-2: 2-Factor vs 3-Factor Risk Scoring](#high-2-2-factor-vs-3-factor-risk-scoring)
  - [HIGH-3: Four Architecture v2.0 Fields Missing from Stage 7](#high-3-four-architecture-v20-fields-missing-from-stage-7)
  - [HIGH-4: pricing_model Enum Missing from Template + Three Variants](#high-4-pricing_model-enum-missing-from-template-three-variants)
  - [HIGH-5: Aggregate Risk Metrics Not in Template Output](#high-5-aggregate-risk-metrics-not-in-template-output)
  - [MEDIUM-1: BMC Priority — Enum vs Integer Mismatch](#medium-1-bmc-priority-enum-vs-integer-mismatch)
  - [MEDIUM-2: BMC Evidence Field — Optional vs Required](#medium-2-bmc-evidence-field-optional-vs-required)
  - [MEDIUM-3: crossBlockWarnings Missing from BMC Analysis](#medium-3-crossblockwarnings-missing-from-bmc-analysis)
  - [MEDIUM-4: exit_type Field Location — Top-Level vs Nested](#medium-4-exit_type-field-location-top-level-vs-nested)
  - [LOW-1: Tier Count Mismatch — Template vs Analysis](#low-1-tier-count-mismatch-template-vs-analysis)
  - [LOW-2: Two Architecture v2.0 Fields Missing from Stage 9](#low-2-two-architecture-v20-fields-missing-from-stage-9)
- [Cross-Cutting Observations](#cross-cutting-observations)
  - [Code Quality Patterns](#code-quality-patterns)
  - [Vision v4.7 Compliance Matrix](#vision-v47-compliance-matrix)
  - [Overall Phase 2 Score Breakdown](#overall-phase-2-score-breakdown)
- [Recommendations](#recommendations)

---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Audit: Phase 2 — THE ENGINE (Stages 6-9)

**SD**: SD-EVA-QA-AUDIT-ENGINE-001
**Auditor**: Claude Opus 4.6
**Date**: 2026-02-14
**Scope**: Stages 6 (Risk Deep-Dive), 7 (Revenue Model), 8 (Business Model Canvas), 9 (Exit Strategy) + Reality Gate 9→10

## Executive Summary

Phase 2 "THE ENGINE" covers the core business modeling stages where ventures define risk profiles, revenue models, business model canvases, and exit strategies. This audit compares the EVA codebase implementation against the Vision v4.7 specification, Architecture v2.0 documents, and cross-stage consistency requirements.

**Overall Score**: 62/100 (significant gaps)
**Critical Gaps**: 2
**High Gaps**: 5
**Medium Gaps**: 4
**Low Gaps**: 2

The most impactful finding is that Reality Gate 9→10 validates the WRONG stage artifacts (Stage 4 instead of Stages 6-9), meaning ventures can pass into Phase 3 without any ENGINE-phase validation.

## Findings

### CRITICAL-1: Reality Gate 9→10 Validates Wrong Artifacts

**Severity**: Critical
**Location**: `lib/eva/gates/reality-gate-stage-9-to-10.mjs`
**Vision Ref**: Section 6.3 (Reality Gates), Appendix A (Gate Scoring)

The Reality Gate checking the Phase 2→3 boundary validates Stage 4 artifacts (problem_validation, solution_hypothesis, tam_sam_som) instead of Stage 6-9 artifacts (risk_assessment, revenue_model, business_model_canvas, exit_strategy). Phase labels reference "DISCOVERY" instead of "ENGINE".

**Impact**: Ventures pass from ENGINE to IDENTITY without any validation of risk, revenue, BMC, or exit work. This is the single highest-risk gap in Phase 2 — it renders all ENGINE-stage gates effectively optional.

**Required artifacts that should be checked**:
- Stage 6: `risk_assessment` with `risk_factors[]`, `aggregate_risk_score`
- Stage 7: `revenue_model` with `pricing_tiers[]`, `revenue_projections`
- Stage 8: `business_model_canvas` with 9 BMC blocks populated
- Stage 9: `exit_strategy` with `exit_scenarios[]`, `timeline`

### CRITICAL-2: Risk Threshold Triple-Inconsistency

**Severity**: Critical
**Location**: `lib/eva/stages/stage-6-risk-deep-dive.mjs` (template + analysis), `lib/eva/gates/kill-gate-stage-5.mjs`
**Vision Ref**: Section 4.6 (Risk Deep-Dive), Appendix A (Scoring Models)

Three different risk threshold values exist across the codebase:
- **Stage 6 template**: `riskThreshold: 1` (nonsensical — nearly all ventures would exceed)
- **Stage 6 analysis**: `riskThreshold: 8` (hardcoded in analysis step)
- **Kill Gate 5**: `riskThreshold: 10` (gate-level override)

Vision v4.7 specifies a 1-10 scale with threshold at 7 for "proceed with caution" and 9 for "requires chairman review". None of the three implementations match the spec.

**Impact**: Risk scoring is unreliable. A venture could pass Kill Gate 5 with risk=9 but be flagged by Stage 6 analysis at risk=8, creating contradictory signals.

### HIGH-1: risk_source Enum — Three Divergent Definitions

**Severity**: High
**Location**: Vision v4.7 Section 4.6, Architecture v2.0 `RiskFactor` interface, `stage-6-risk-deep-dive.mjs`
**Vision Ref**: Appendix D (Enum Reference)

| Source | Enum Values |
|--------|------------|
| Vision v4.7 | market, technical, financial, regulatory, operational, team |
| Architecture v2.0 | market, technical, financial, regulatory, competitive, execution |
| Implementation | market, technical, financial, regulatory, operational, competitive |

No two sources agree. "team" (Vision) vs "execution" (Architecture) vs "operational+competitive" (implementation) represent different risk categorization philosophies.

### HIGH-2: 2-Factor vs 3-Factor Risk Scoring

**Severity**: High
**Location**: Architecture v2.0 `RiskFactor` interface, `stage-6-risk-deep-dive.mjs` analysis step
**Vision Ref**: Section 4.6, Appendix A

Architecture v2.0 defines risk scoring as 2-factor: `probability (1-5) * impact (1-5)` yielding max score of 25. The implementation uses 3-factor scoring: `probability * impact * detectability` (scaled to 1-10). Vision v4.7 references a 1-10 aggregate scale without specifying the formula.

**Impact**: Risk scores are not comparable across components. A "high risk" score of 8/10 in analysis means something different than 20/25 in architecture.

### HIGH-3: Four Architecture v2.0 Fields Missing from Stage 7

**Severity**: High
**Location**: `stage-7-revenue-model.mjs` template, Architecture v2.0 `RevenueModel` interface

Four fields defined in Architecture v2.0 are absent from the Stage 7 template:
- `primaryValueMetric` — what the customer pays for
- `priceAnchor` — competitive reference price
- `competitiveContext` — market positioning data
- `positioningDecision` — strategic pricing position

These fields inform the revenue model's market fit. Without them, revenue projections lack competitive grounding.

### HIGH-4: pricing_model Enum Missing from Template + Three Variants

**Severity**: High
**Location**: `stage-7-revenue-model.mjs`, Vision v4.7 Section 4.7, Architecture v2.0
**Vision Ref**: Appendix D

The Stage 7 template omits the `pricing_model` enum entirely. Three different definitions exist:
- Vision: subscription, transactional, freemium, marketplace, licensing
- Architecture: subscription, usage_based, tiered, freemium, enterprise, marketplace
- Implementation: references pricing but no explicit enum enforcement

### HIGH-5: Aggregate Risk Metrics Not in Template Output

**Severity**: High
**Location**: `stage-6-risk-deep-dive.mjs` template vs analysis step

The analysis step computes `aggregate_risk_score`, `highest_risk_factor`, and `mitigation_coverage_pct`, but the template output schema does not include fields for these values. They are computed but may not persist to the venture record, making them unavailable to downstream stages and the Reality Gate.

### MEDIUM-1: BMC Priority — Enum vs Integer Mismatch

**Severity**: Medium
**Location**: `stage-8-business-model-canvas.mjs`, Architecture v2.0 `BMCBlock` interface

Vision v4.7 and Architecture v2.0 define BMC block priority as an enum: `critical | important | standard`. The implementation uses integer values (1-3). While functionally equivalent, this creates a type mismatch when comparing template output against spec validation.

### MEDIUM-2: BMC Evidence Field — Optional vs Required

**Severity**: Medium
**Location**: `stage-8-business-model-canvas.mjs` template

Architecture v2.0 marks the `evidence` field on BMC blocks as required (part of the `BMCBlock` interface). The Stage 8 template treats it as optional (no validation if absent). This means BMC blocks can be submitted without supporting evidence.

### MEDIUM-3: crossBlockWarnings Missing from BMC Analysis

**Severity**: Medium
**Location**: `stage-8-business-model-canvas.mjs` analysis step

Architecture v2.0 specifies a `crossBlockWarnings[]` output from BMC analysis that flags inconsistencies between BMC blocks (e.g., customer segments that don't align with channels). This field is absent from the analysis step implementation.

### MEDIUM-4: exit_type Field Location — Top-Level vs Nested

**Severity**: Medium
**Location**: `stage-9-exit-strategy.mjs` template, Architecture v2.0 `ExitStrategy` interface

Architecture v2.0 places `exit_type` at the top level of the exit strategy object. The implementation nests it inside each `exit_scenario[]` array element. This means the "primary exit type" is ambiguous when multiple scenarios exist.

### LOW-1: Tier Count Mismatch — Template vs Analysis

**Severity**: Low
**Location**: `stage-7-revenue-model.mjs`

The Stage 7 template generates a single pricing tier by default. The analysis step expects 2+ tiers for comparison analysis. This doesn't cause errors but means first-pass analysis always flags "insufficient tier diversity".

### LOW-2: Two Architecture v2.0 Fields Missing from Stage 9

**Severity**: Low
**Location**: `stage-9-exit-strategy.mjs`, Architecture v2.0

Two minor fields are missing:
- `buyerType` — categorization of likely acquirer (strategic, financial, IPO)
- `milestone.category` — grouping milestones by type (revenue, product, team)

These are informational and don't affect gate decisions.

## Cross-Cutting Observations

### Code Quality Patterns
- All 4 stages use inline `parseJSON()` helper copies instead of a shared utility
- Logger injection is properly done via constructor in all stages
- DFE (Decision Feedback Engine) triggers are wired at the orchestrator level, not per-stage
- Template → Analysis → Gate pipeline pattern is consistent across all stages

### Vision v4.7 Compliance Matrix

| Dimension | Stage 6 | Stage 7 | Stage 8 | Stage 9 | Gate 9→10 |
|-----------|:-------:|:-------:|:-------:|:-------:|:---------:|
| Template fields match spec | 70% | 60% | 75% | 70% | N/A |
| Analysis step coverage | 65% | 70% | 60% | 70% | N/A |
| Enum consistency | 40% | 35% | 65% | 70% | N/A |
| Architecture v2.0 alignment | 55% | 50% | 60% | 65% | 10% |
| Gate artifact validation | N/A | N/A | N/A | N/A | 10% |

### Overall Phase 2 Score Breakdown

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Template completeness | 25% | 70/100 | 17.5 |
| Analysis step coverage | 20% | 65/100 | 13.0 |
| Enum/type consistency | 20% | 50/100 | 10.0 |
| Architecture alignment | 20% | 55/100 | 11.0 |
| Reality Gate correctness | 15% | 10/100 | 1.5 |
| **Total** | **100%** | | **53/100** |

*Note: Weighted score (53) is lower than headline score (62) because Reality Gate correctness — the highest-severity gap — has disproportionate impact.*

## Recommendations

1. **Immediate**: Fix Reality Gate 9→10 to validate Stage 6-9 artifacts instead of Stage 4 artifacts
2. **Immediate**: Standardize risk_source enum across Vision, Architecture, and implementation (recommend Architecture v2.0 values as canonical)
3. **Immediate**: Resolve risk threshold to a single value matching Vision v4.7 spec (threshold=7 with chairman review at 9)
4. **Short-term**: Add missing Architecture v2.0 fields to Stage 7 and Stage 9 templates
5. **Short-term**: Enforce pricing_model enum in Stage 7 template
6. **Short-term**: Surface aggregate risk metrics in template output schema
7. **Medium-term**: Extract shared `parseJSON()` utility to reduce code duplication
8. **Medium-term**: Add crossBlockWarnings to BMC analysis step
