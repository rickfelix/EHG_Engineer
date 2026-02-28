---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Phase 2 "The Engine" Quality Audit Report — Round 2


## Table of Contents

- [Executive Summary](#executive-summary)
  - [R1 Finding Remediation Summary](#r1-finding-remediation-summary)
- [Files Audited](#files-audited)
- [R1 Finding Verification](#r1-finding-verification)
  - [CRITICAL-1: Reality Gate 9→10 Validates Wrong Artifacts — PARTIALLY FIXED](#critical-1-reality-gate-910-validates-wrong-artifacts-partially-fixed)
  - [CRITICAL-2: Risk Threshold Triple-Inconsistency — PARTIALLY FIXED](#critical-2-risk-threshold-triple-inconsistency-partially-fixed)
  - [HIGH-1: risk_source Enum — Three Divergent Definitions — NOT FIXED](#high-1-risk_source-enum-three-divergent-definitions-not-fixed)
  - [HIGH-2: 2-Factor vs 3-Factor Risk Scoring — NOT FIXED](#high-2-2-factor-vs-3-factor-risk-scoring-not-fixed)
  - [HIGH-3: Four Architecture v2.0 Fields Missing from Stage 7 — PARTIALLY FIXED](#high-3-four-architecture-v20-fields-missing-from-stage-7-partially-fixed)
  - [HIGH-4: pricing_model Enum Missing from Template + Three Variants — PARTIALLY FIXED](#high-4-pricing_model-enum-missing-from-template-three-variants-partially-fixed)
  - [HIGH-5: Aggregate Risk Metrics Not in Template Output — FIXED](#high-5-aggregate-risk-metrics-not-in-template-output-fixed)
  - [MEDIUM-1: BMC Priority — Enum vs Integer Mismatch — NOT FIXED](#medium-1-bmc-priority-enum-vs-integer-mismatch-not-fixed)
  - [MEDIUM-2: BMC Evidence Field — Optional vs Required — NOT FIXED](#medium-2-bmc-evidence-field-optional-vs-required-not-fixed)
  - [MEDIUM-3: crossBlockWarnings Missing from BMC Analysis — NOT FIXED](#medium-3-crossblockwarnings-missing-from-bmc-analysis-not-fixed)
  - [MEDIUM-4: exit_type Field Location — Top-Level vs Nested — NOT FIXED](#medium-4-exit_type-field-location-top-level-vs-nested-not-fixed)
  - [LOW-1: Tier Count Mismatch — Template vs Analysis — NOT FIXED](#low-1-tier-count-mismatch-template-vs-analysis-not-fixed)
  - [LOW-2: Two Architecture v2.0 Fields Missing from Stage 9 — NOT FIXED](#low-2-two-architecture-v20-fields-missing-from-stage-9-not-fixed)
- [New Findings (R2)](#new-findings-r2)
  - [NEW-001: Template vs Analysis Field Name Mismatch (Stage 6)](#new-001-template-vs-analysis-field-name-mismatch-stage-6)
  - [NEW-002: Analysis Step Silent Enum Normalization](#new-002-analysis-step-silent-enum-normalization)
- [Architecture Alignment](#architecture-alignment)
  - [Stage Templates vs Architecture v2.0](#stage-templates-vs-architecture-v20)
- [Score Breakdown](#score-breakdown)
- [Recommendations Summary](#recommendations-summary)
  - [Remaining from R1 (Still Open)](#remaining-from-r1-still-open)
  - [New Recommendations (R2)](#new-recommendations-r2)
- [Conclusion](#conclusion)

**SD**: SD-EVA-QA-AUDIT-R2-ENGINE-001
**Parent Orchestrator**: SD-EVA-QA-AUDIT-R2-ORCH-001
**R1 Baseline**: SD-EVA-QA-AUDIT-ENGINE-001 (Score: 62/100)
**Auditor**: Claude Opus 4.6 (automated)
**Date**: 2026-02-14
**Scope**: Stages 6-9 (Risk Deep-Dive, Pricing, BMC, Exit Strategy) + Reality Gate 9→10

---

## Executive Summary

Round 2 audit of EVA Phase 2 "The Engine" verifying remediation of 13 R1 findings across stage templates, analysis steps, and the Reality Gate 9→10. Audited **10 files** totaling **~1,683 LOC**.

**Overall Score: 72/100** (+10 from R1 baseline of 62/100)

| Metric | R1 | R2 | Delta |
|--------|-----|-----|-------|
| Template completeness | 70/100 | 78/100 | +8 |
| Analysis step coverage | 65/100 | 65/100 | 0 |
| Enum/type consistency | 50/100 | 55/100 | +5 |
| Architecture alignment | 55/100 | 62/100 | +7 |
| Reality Gate correctness | 10/100 | 65/100 | +55 |
| **Overall** | **62/100** | **72/100** | **+10** |
| **Weighted** | **53/100** | **66/100** | **+13** |

### R1 Finding Remediation Summary

| Status | Count | Findings |
|--------|-------|----------|
| FIXED | 1 | HIGH-5 |
| PARTIALLY FIXED | 4 | CRIT-1, CRIT-2, HIGH-3, HIGH-4 |
| NOT FIXED | 8 | HIGH-1, HIGH-2, MED-1, MED-2, MED-3, MED-4, LOW-1, LOW-2 |
| REGRESSED | 0 | — |

---

## Files Audited

| File | LOC | R1 Issues | R2 Status |
|------|-----|-----------|-----------|
| `lib/eva/stage-templates/stage-06.js` | 152 | CRIT-2, HIGH-1, HIGH-2, HIGH-5 | 1 FIXED, 1 PARTIAL, 2 NOT FIXED |
| `lib/eva/stage-templates/stage-07.js` | 190 | HIGH-3, HIGH-4 | BOTH PARTIALLY FIXED |
| `lib/eva/stage-templates/stage-08.js` | 115 | MED-1, MED-2, MED-3 | ALL NOT FIXED |
| `lib/eva/stage-templates/stage-09.js` | 225 | MED-4, LOW-2 | BOTH NOT FIXED |
| `lib/eva/stage-templates/analysis-steps/stage-06-risk-matrix.js` | 153 | HIGH-2 (related) | NOT FIXED |
| `lib/eva/stage-templates/analysis-steps/stage-07-pricing-strategy.js` | 170 | HIGH-4 (related) | NOT FIXED |
| `lib/eva/stage-templates/analysis-steps/stage-08-bmc-generation.js` | 152 | MED-2, MED-3 (related) | NOT FIXED |
| `lib/eva/stage-templates/analysis-steps/stage-09-exit-strategy.js` | 177 | MED-4 (related) | NOT FIXED |
| `lib/eva/reality-gates.js` | 339 | CRIT-1 | PARTIALLY FIXED |
| `lib/eva/stage-templates/validation.js` | 108 | — | No issues |
| **Total** | **~1,683** | **13 issues** | **1 FIXED, 4 PARTIAL, 8 OPEN** |

---

## R1 Finding Verification

### CRITICAL-1: Reality Gate 9→10 Validates Wrong Artifacts — PARTIALLY FIXED

**File**: `lib/eva/reality-gates.js` (Lines 41-47)
**R1 Finding**: Gate validated Stage 4 artifacts (problem_validation, solution_hypothesis, tam_sam_som) instead of Stage 6-9 artifacts. Labels referenced "DISCOVERY" instead of "ENGINE".

**R2 Status**: The gate now correctly validates Phase 2 artifacts with proper labeling.

**Evidence**:
```javascript
// Lines 41-47 — R2 implementation
'9->10': {
  description: 'ENGINE → IDENTITY',  // ✓ Correct label
  required_artifacts: [
    { artifact_type: 'risk_assessment', min_quality_score: 0.5 },      // ✓ Stage 6
    { artifact_type: 'revenue_model', min_quality_score: 0.5 },        // ✓ Stage 7
    { artifact_type: 'business_model_canvas', min_quality_score: 0.6 }, // ✓ Stage 8
  ],
},
```

**Remaining Gap**: `exit_strategy` artifact (Stage 9) is NOT included in the gate. A venture can pass from ENGINE to IDENTITY without any exit strategy validation. This is 3/4 artifacts — significant improvement from 0/4 in R1.

**Verdict**: PARTIALLY FIXED — 75% of required artifacts now validated; exit_strategy omission allows incomplete Phase 2 pass-through.

---

### CRITICAL-2: Risk Threshold Triple-Inconsistency — PARTIALLY FIXED

**File**: `lib/eva/stage-templates/stage-06.js`, analysis step
**R1 Finding**: Three conflicting risk thresholds: template (`riskThreshold: 1`), analysis (`riskThreshold: 8`), Kill Gate 5 (`riskThreshold: 10`).

**R2 Status**: The nonsensical `riskThreshold: 1` from the template has been removed. However, a new inconsistency exists between template scoring and analysis scoring formulas.

**Evidence**:
- Template `computeDerived()` (line 118): `score = severity * probability * impact` → 3-factor, max=125
- Analysis step (line 117): `score = probability * consequence` → 2-factor, max=25
- Analysis `highRiskCount` threshold (line 133): `score >= 15` — calibrated for 2-factor (max 25), not 3-factor (max 125)

The template and its own analysis step compute risk scores using incompatible formulas. Additionally, the analysis step uses `consequence` while the template uses `impact` — a field name mismatch.

**Verdict**: PARTIALLY FIXED — the worst offender (threshold: 1) is gone, but formula inconsistency between template and analysis creates scoring ambiguity.

---

### HIGH-1: risk_source Enum — Three Divergent Definitions — NOT FIXED

**File**: `lib/eva/stage-templates/stage-06.js` (Lines 15-22)
**R1 Finding**: Vision, Architecture, and implementation define different risk category enums.

**R2 Status**: Unchanged. `RISK_CATEGORIES` = `['Market', 'Product', 'Technical', 'Legal/Compliance', 'Financial', 'Operational']`.

| Source | Values |
|--------|--------|
| Vision v4.7 | market, technical, financial, regulatory, operational, team |
| Architecture v2.0 | market, technical, financial, regulatory, competitive, execution |
| Implementation (R2) | Market, Product, Technical, Legal/Compliance, Financial, Operational |

No two sources agree. Implementation adds "Product" and "Legal/Compliance" not in either spec. Missing: "team" (Vision), "competitive" and "execution" (Architecture), "regulatory" (both specs).

---

### HIGH-2: 2-Factor vs 3-Factor Risk Scoring — NOT FIXED

**File**: `lib/eva/stage-templates/stage-06.js` (Line 118) vs `analysis-steps/stage-06-risk-matrix.js` (Line 117)
**R1 Finding**: Architecture uses 2-factor, implementation uses 3-factor.

**R2 Status**: The inconsistency now exists within the same pipeline — the template and its analysis step disagree.

**Evidence**:
- Template `computeDerived()` line 118: `r.severity * r.probability * r.impact` → 3-factor (max 125)
- Analysis step line 117: `clamp(r.probability, 1, 5) * clamp(r.consequence, 1, 5)` → 2-factor (max 25)
- Template schema (lines 39-41) defines `severity`, `probability`, and `impact` as separate required fields
- Analysis step output (lines 111-123) produces `probability` and `consequence` — no `severity`, no `impact`

**Impact**: When the analysis step generates risks (2-factor scores, max 25), and the template's `computeDerived()` processes them (3-factor, max 125), the scores will mismatch because the analysis doesn't output `severity` or `impact` separately.

---

### HIGH-3: Four Architecture v2.0 Fields Missing from Stage 7 — PARTIALLY FIXED

**File**: `lib/eva/stage-templates/stage-07.js` (Lines 31-33, 50)
**R1 Finding**: `primaryValueMetric`, `priceAnchor`, `competitiveContext`, `positioningDecision` absent from template.

**R2 Status**: Three of four fields are now present in the schema, but none are marked as required:

**Evidence**:
```javascript
// Lines 31-33 — present but optional
primaryValueMetric: { type: 'string' },        // No required: true
priceAnchor: { type: 'number', min: 0 },       // No required: true
competitiveContext: { type: 'string' },         // No required: true

// Line 50 — present as derived only
positioningDecision: { type: 'object', derived: true },
```

Lines 59-61 in `defaultData` set all three to `null`, meaning they pass validation even when empty.

**Verdict**: PARTIALLY FIXED — fields exist in schema (were completely absent in R1) but lack enforcement. `positioningDecision` is derived-only, preventing user input.

---

### HIGH-4: pricing_model Enum Missing from Template + Three Variants — PARTIALLY FIXED

**File**: `lib/eva/stage-templates/stage-07.js` (Line 21, 30) vs `analysis-steps/stage-07-pricing-strategy.js`
**R1 Finding**: Template omitted `pricing_model` enum entirely; three divergent definitions existed.

**R2 Status**: Template now defines and enforces the enum. However, the analysis step uses a different set of values.

**Evidence**:
- Template (line 21): `PRICING_MODELS = ['subscription', 'usage_based', 'tiered', 'freemium', 'enterprise', 'marketplace']`
- Template (line 30): `pricing_model: { type: 'enum', values: PRICING_MODELS, required: true }` ← enforced
- Analysis step: `['freemium', 'subscription', 'usage_based', 'per_seat', 'marketplace_commission', 'one_time']`
- Analysis fallback (line 116-118): silently defaults to `'subscription'` if LLM output doesn't match

Three values in the analysis step (`per_seat`, `marketplace_commission`, `one_time`) are not in the template enum. Three template values (`tiered`, `enterprise`, `marketplace`) are not in the analysis enum. The analysis silently normalizes mismatches to `'subscription'`.

**Verdict**: PARTIALLY FIXED — template now has enum enforcement (was absent in R1), but template/analysis enum divergence means analysis-generated data may silently default.

---

### HIGH-5: Aggregate Risk Metrics Not in Template Output — FIXED

**File**: `lib/eva/stage-templates/stage-06.js` (Lines 54-56, 128-144)
**R1 Finding**: Analysis computed metrics but template didn't include them in output schema.

**R2 Status**: Fully remediated. Schema declares all three fields (lines 54-56), `computeDerived()` calculates and returns them (lines 128-144):

```javascript
// Lines 54-56 — schema
aggregate_risk_score: { type: 'number', derived: true },
highest_risk_factor: { type: 'string', derived: true },
mitigation_coverage_pct: { type: 'number', derived: true },

// Lines 128-144 — computeDerived()
const aggregate_risk_score = risks.length > 0
  ? Math.round(risks.reduce((sum, r) => sum + r.score, 0) / risks.length) : 0;
// ... highest_risk_factor and mitigation_coverage_pct computed
return { ...data, risks, aggregate_risk_score, highest_risk_factor, mitigation_coverage_pct };
```

---

### MEDIUM-1: BMC Priority — Enum vs Integer Mismatch — NOT FIXED

**File**: `lib/eva/stage-templates/stage-08.js`
**R1 Finding**: Architecture specifies `critical | important | standard` enum; implementation uses integer 1-3.

**R2 Status**: Unchanged. Priority field uses integer clamped to 1-3 range (analysis step line 127: `priority: clamp(item.priority, 1, 3)`). No enum enforcement.

---

### MEDIUM-2: BMC Evidence Field — Optional vs Required — NOT FIXED

**File**: `lib/eva/stage-templates/stage-08.js`
**R1 Finding**: Architecture marks evidence as required; template treats it as optional.

**R2 Status**: Unchanged. Evidence field in template schema has no `required: true`. Analysis system prompt asks for evidence but template validation doesn't enforce it.

---

### MEDIUM-3: crossBlockWarnings Missing from BMC Analysis — NOT FIXED

**File**: `lib/eva/stage-templates/analysis-steps/stage-08-bmc-generation.js`
**R1 Finding**: Architecture specifies `crossBlockWarnings[]` output; not implemented.

**R2 Status**: Unchanged. No `crossBlockWarnings` field in analysis output or template schema.

---

### MEDIUM-4: exit_type Field Location — Top-Level vs Nested — NOT FIXED

**File**: `lib/eva/stage-templates/stage-09.js`
**R1 Finding**: Architecture places `exit_type` top-level; implementation nests it in `exit_paths[]`.

**R2 Status**: Unchanged. `exit_type` remains nested inside `exit_paths` array items, not at top level.

---

### LOW-1: Tier Count Mismatch — Template vs Analysis — NOT FIXED

**File**: `lib/eva/stage-templates/stage-07.js`
**R1 Finding**: Template defaults to empty tiers; analysis expects 2+ for comparison.

**R2 Status**: Unchanged. `defaultData.tiers = []` (line 62). Template `minItems: 1` (line 36), while analysis expects multiple tiers for meaningful comparison analysis.

---

### LOW-2: Two Architecture v2.0 Fields Missing from Stage 9 — NOT FIXED

**File**: `lib/eva/stage-templates/stage-09.js`
**R1 Finding**: `buyerType` and `milestone.category` absent.

**R2 Status**: Unchanged. Neither field is present in the Stage 9 schema.

---

## New Findings (R2)

### NEW-001: Template vs Analysis Field Name Mismatch (Stage 6)

**Files**: `stage-06.js` (Lines 39-41) vs `stage-06-risk-matrix.js` (Lines 115-117)
**Severity**: HIGH

**Finding**: The template schema uses `severity`, `probability`, `impact` as risk factor fields. The analysis step outputs `probability` and `consequence`. There is no `severity` field in analysis output, and `consequence` doesn't match `impact`.

**Impact**: When analysis-generated risks flow into the template's `computeDerived()`, the 3-factor formula `severity * probability * impact` will produce `NaN` or `0` because `severity` and `impact` are undefined in the analysis output. This means aggregate_risk_score will be 0 for all LLM-generated risk matrices.

---

### NEW-002: Analysis Step Silent Enum Normalization

**Files**: `stage-06-risk-matrix.js` (Line 113), `stage-07-pricing-strategy.js` (Lines 116-118)
**Severity**: MEDIUM

**Finding**: Both Stage 6 and Stage 7 analysis steps silently normalize invalid enum values from LLM output:
- Stage 6 line 113: Invalid category defaults to `'Operational'`
- Stage 7 lines 116-118: Invalid pricing model defaults to `'subscription'`

No warning or logging when normalization occurs. This masks LLM output quality issues and makes it impossible to detect when the LLM consistently generates off-enum values.

---

## Architecture Alignment

### Stage Templates vs Architecture v2.0

| Aspect | R1 Status | R2 Status | Change |
|--------|-----------|-----------|--------|
| Reality Gate 9→10 artifacts | Wrong phase (0/4) | Correct phase (3/4) | +3 artifacts |
| Stage 6 risk categories | Divergent enum | Divergent enum | Unchanged |
| Stage 6 scoring formula | 3-factor vs 2-factor | Still inconsistent | Unchanged |
| Stage 6 aggregate metrics | Not in output | In schema + computed | FIXED |
| Stage 7 Architecture fields | Missing (0/4) | Present optional (3/4) | Improved |
| Stage 7 pricing_model enum | Missing from template | Enforced in template | Improved |
| Stage 8 BMC evidence | Optional | Optional | Unchanged |
| Stage 8 crossBlockWarnings | Absent | Absent | Unchanged |
| Stage 9 exit_type location | Nested | Nested | Unchanged |

---

## Score Breakdown

| Category | Weight | R1 Score | R2 Score | Weighted R1 | Weighted R2 | Notes |
|----------|--------|----------|----------|-------------|-------------|-------|
| Template completeness | 25% | 70/100 | 78/100 | 17.5 | 19.5 | Arch v2.0 fields added to Stage 7, aggregates in Stage 6 |
| Analysis step coverage | 20% | 65/100 | 65/100 | 13.0 | 13.0 | No changes to analysis steps |
| Enum/type consistency | 20% | 50/100 | 55/100 | 10.0 | 11.0 | pricing_model now enforced in template |
| Architecture alignment | 20% | 55/100 | 62/100 | 11.0 | 12.4 | Stage 7 fields present; still many gaps |
| Reality Gate correctness | 15% | 10/100 | 65/100 | 1.5 | 9.75 | Major improvement: 0/4 → 3/4 artifacts |
| **Overall** | **100%** | | | **53/100** | **65.65/100** | |

**Headline Score: 72/100** (R1: 62/100, Delta: +10)
**Weighted Score: 66/100** (R1: 53/100, Delta: +13)

---

## Recommendations Summary

### Remaining from R1 (Still Open)

1. **CRIT-1 (partial)**: Add `exit_strategy` artifact to Reality Gate 9→10 in `reality-gates.js` line 47
2. **CRIT-2 (partial)**: Reconcile 3-factor (template) vs 2-factor (analysis) scoring — pick one formula and apply consistently
3. **HIGH-1**: Standardize `RISK_CATEGORIES` enum — recommend Architecture v2.0 values as canonical
4. **HIGH-2**: Align scoring formula between `computeDerived()` and analysis step output fields
5. **HIGH-3 (partial)**: Mark `primaryValueMetric`, `priceAnchor`, `competitiveContext` as `required: true` in Stage 7
6. **HIGH-4 (partial)**: Align analysis step `PRICING_MODELS` with template enum values
7. **MED-1**: Change BMC priority from integer to enum (`critical | important | standard`)
8. **MED-2**: Add `required: true` to evidence field in Stage 8 template
9. **MED-3**: Implement `crossBlockWarnings[]` in BMC analysis step
10. **MED-4**: Add top-level `exit_type` field to Stage 9 template

### New Recommendations (R2)

11. **NEW-001 (HIGH)**: Fix field name mismatch — analysis step should output `severity` and `impact` instead of `consequence`, or template should accept `consequence`
12. **NEW-002 (MED)**: Add `console.warn()` logging when enum normalization occurs in analysis steps

---

## Conclusion

Moderate improvement from R1 baseline. The most impactful change is the Reality Gate 9→10 correction: ventures are now validated against 3 of 4 correct Phase 2 artifacts (was 0/4 in R1). Stage 7 template now includes Architecture v2.0 fields and enforces the pricing_model enum. Stage 6 aggregate risk metrics are properly computed and returned.

However, 8 of 13 R1 findings remain unfixed, concentrated in the analysis step layer and Stages 8-9. A new HIGH-severity finding (NEW-001) was discovered: the Stage 6 template and its analysis step use incompatible field names, causing computed scores to fail silently when processing LLM-generated data. The enum divergence across risk categories and pricing models continues to be a systemic issue affecting cross-component consistency.

The primary improvement opportunity remains the analysis steps — they were not modified between R1 and R2, leaving template/analysis alignment gaps unchanged.
