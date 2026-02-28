---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Phase 6: Launch & Learn — Round 2 Audit Report


## Table of Contents

- [Executive Summary](#executive-summary)
- [Stage 23: Launch Execution — Kill Gate](#stage-23-launch-execution-kill-gate)
  - [Files Audited](#files-audited)
  - [Findings](#findings)
  - [Stage 23 Compliance: 72%](#stage-23-compliance-72)
- [Stage 24: Metrics & Learning](#stage-24-metrics-learning)
  - [Files Audited](#files-audited)
  - [Findings](#findings)
  - [Stage 24 Compliance: 67%](#stage-24-compliance-67)
- [Stage 25: Venture Review (Capstone)](#stage-25-venture-review-capstone)
  - [Files Audited](#files-audited)
  - [Findings](#findings)
  - [Stage 25 Compliance: 55%](#stage-25-compliance-55)
- [Cross-Stage Contract Analysis](#cross-stage-contract-analysis)
  - [Stage 22 → Stage 23 Contract](#stage-22-stage-23-contract)
  - [Stage 23 → Stage 24 Contract](#stage-23-stage-24-contract)
  - [Stage 24 → Stage 25 Contract](#stage-24-stage-25-contract)
  - [All Stages → Stage 25 (Capstone Consumption)](#all-stages-stage-25-capstone-consumption)
- [Summary of Findings by Severity](#summary-of-findings-by-severity)
- [Recurring Pattern: Template vs Analysis Step Divergence](#recurring-pattern-template-vs-analysis-step-divergence)
- [Recommendations](#recommendations)

**SD**: SD-EVA-QA-AUDIT-R2-LAUNCH-001
**Date**: 2026-02-14
**Auditor**: Claude (automated)
**Gold Standard**: Architecture v1.6, Section 8.6
**Scope**: Stages 23–25 (templates + analysis steps)
**Round 1 Baseline**: SD-EVA-QA-AUDIT-R1 findings

---

## Executive Summary

Phase 6 (Launch & Learn) covers the final three stages of the EVA 25-stage lifecycle. Overall compliance is **moderate** with several enum and schema mismatches between the architecture spec, the stage templates, and their analysis steps. The most critical gaps are in Stage 25 (Venture Review) where the template's venture decision enum diverges significantly from the spec, and the venture health assessment structure is absent from the template schema.

**Overall Compliance Score: 62%**

| Stage | Template | Analysis Step | Combined |
|-------|----------|--------------|----------|
| 23 | 65% | 80% | 72% |
| 24 | 60% | 75% | 67% |
| 25 | 45% | 65% | 55% |

---

## Stage 23: Launch Execution — Kill Gate

### Files Audited
- `lib/eva/stage-templates/stage-23.js` (190 lines)
- `lib/eva/stage-templates/analysis-steps/stage-23-launch-execution.js` (191 lines)

### Findings

#### F-23-01: `launchType` Enum Mismatch (Severity: Major, Gap Importance: 4/5)

| | Spec (v1.6 §8.6) | Template | Analysis Step |
|---|---|---|---|
| Values | `soft_launch\|beta\|general_availability` | `soft_launch\|hard_launch\|staged_rollout\|beta_release` | `soft_launch\|beta\|general_availability` |

The template's enum diverges from the spec on 3 of 4 values. The analysis step correctly implements the spec. This means data produced by the analysis step may use values (`beta`, `general_availability`) that the template does not recognize, and vice versa (`hard_launch`, `staged_rollout`, `beta_release` are template-only).

**Impact**: Cross-stage contract break between Stage 23 template and Stage 24's interpretation of `launchType`.

#### F-23-02: `launchTasks[].status` Not Enum-Constrained (Severity: Minor, Gap Importance: 2/5)

Spec requires `status` as enum: `pending|in_progress|done|blocked`. Template schema declares `{ type: 'string' }` (free text). The analysis step correctly uses `TASK_STATUSES = ['pending', 'in_progress', 'done', 'blocked']` for normalization.

**Impact**: Template validation accepts any string for task status; analysis step output is correctly constrained.

#### F-23-03: `plannedLaunchDate` Not Required (Severity: Minor, Gap Importance: 2/5)

Spec marks `plannedLaunchDate` as required with ISO date validation. Template has `planned_launch_date: { type: 'string' }` (optional, no format validation). The analysis step provides a default date if missing.

#### F-23-04: `successCriteria[]` Field Name Mismatch (Severity: Major, Gap Importance: 4/5)

| Field | Spec | Template | Analysis Step |
|-------|------|----------|--------------|
| criterion name | `metric` | `criterion` + `metric` | `metric` |
| time window | `measurementWindow` | `timeframe` | `measurementWindow` |
| priority | `priority` (enum: `primary\|secondary`) | absent | `priority` |

Template uses different field names (`criterion`, `timeframe`) than the spec (`metric`, `measurementWindow`). Analysis step output aligns with spec. This creates a contract mismatch: analysis step produces spec-compliant output, but template schema expects different fields.

#### F-23-05: `rollbackTriggers[]` Field Divergence (Severity: Minor, Gap Importance: 2/5)

| Field | Spec | Template | Analysis Step |
|-------|------|----------|--------------|
| trigger desc | `condition` | `trigger` | `condition` |
| response | `action` | `action` | `severity` |

Template uses `trigger` (spec: `condition`). Analysis step uses `severity` instead of spec's `action`. Minor naming inconsistencies.

#### F-23-06: Kill Gate Missing `releaseDecision` Check (Severity: Major, Gap Importance: 3/5)

Spec: Kill gate requires `Stage 22 promotionGate = pass AND releaseDecision = 'release'`.
Implementation: `evaluateKillGate()` checks `stage22Data.promotion_gate?.pass` but does NOT check `releaseDecision`. A stage with a passing promotion gate but `releaseDecision = 'hold'` would incorrectly pass the kill gate.

#### F-23-07: `goDecision` Extra Value (Severity: Minor, Gap Importance: 1/5)

Template includes `conditional_go` in the enum. Spec only defines `go|no-go`. The extra value is a reasonable extension but not in spec.

### Stage 23 Compliance: 72%

---

## Stage 24: Metrics & Learning

### Files Audited
- `lib/eva/stage-templates/stage-24.js` (188 lines)
- `lib/eva/stage-templates/analysis-steps/stage-24-metrics-learning.js` (217 lines)

### Findings

#### F-24-01: `criterionRef` Missing from AARRR Metrics (Severity: Major, Gap Importance: 4/5)

Spec requires each AARRR metric to have optional `criterionRef` field linking back to Stage 23 success criteria. Neither the template nor the analysis step includes this field.

**Impact**: No automated linkage between Stage 23 success criteria and Stage 24 AARRR metrics. The analysis step compensates with a separate `criteriaEvaluation` array, but the per-metric back-reference is absent.

#### F-24-02: `trend_window_days` Naming Convention (Severity: Minor, Gap Importance: 1/5)

Template uses `trend_window_days` (snake_case). Spec uses `trendWindowDays` (camelCase). Inconsistent naming convention.

#### F-24-03: `launchOutcome.assessment` Enum Mismatch (Severity: Major, Gap Importance: 4/5)

| | Spec | Template (`computeDerived`) | Analysis Step |
|---|---|---|---|
| Values | `success\|partial\|failure\|indeterminate` | `successful\|partial\|underperforming` | `success\|partial\|failure\|indeterminate` |

Template uses `successful` (spec: `success`) and `underperforming` (spec: `failure`). Template also omits `indeterminate`. Analysis step correctly implements the spec enum.

**Impact**: Downstream consumers (Stage 25) may receive non-spec values from the template's `computeDerived()` path.

#### F-24-04: `funnels[].steps` Not Structured Per Spec (Severity: Minor, Gap Importance: 2/5)

Spec: steps have `name` (string) and `count` (number), with derived `conversionRates[]`. Template only validates `minItems: 2` without enforcing step structure. No `conversionRates` derivation.

#### F-24-05: `learnings[].category` Not Enum (Severity: Minor, Gap Importance: 2/5)

Spec: `category` is enum `product|market|technical|financial|process`. Template declares `{ type: 'string' }` (free text). Analysis step uses `IMPACT_LEVELS` for `impactLevel` but does not constrain `category`.

### Stage 24 Compliance: 67%

---

## Stage 25: Venture Review (Capstone)

### Files Audited
- `lib/eva/stage-templates/stage-25.js` (296 lines)
- `lib/eva/stage-templates/analysis-steps/stage-25-venture-review.js` (256 lines)

### Findings

#### F-25-01: `ventureDecision.decision` Enum Mismatch (Severity: Critical, Gap Importance: 5/5)

| | Spec | Template | Analysis Step |
|---|---|---|---|
| Values | `continue\|pivot\|expand\|sunset\|exit` | `proceed\|pivot\|pause\|terminate` | `continue\|pivot\|expand\|sunset\|exit` |

Template enum diverges on 3 of 4 values (`proceed` vs `continue`, `pause` vs `expand`/`sunset`, `terminate` vs `exit`). Missing `expand`, `sunset`, `exit` from template; missing `continue` and `expand` from template. Analysis step matches spec.

**Impact**: The capstone output — the single most important decision in the 25-stage lifecycle — uses non-spec values when derived by the template. Stage 25 → cross-venture learning pathway receives incorrect enum values.

#### F-25-02: `ventureHealth` Missing from Template Schema (Severity: Critical, Gap Importance: 5/5)

Spec requires a `ventureHealth` object with:
- Per-dimension scores (product, market, technical, financial, team) on 0-100 scale
- `overall` (0-100)
- `band` (enum: `critical|fragile|viable|strong`)

Template schema has NO `ventureHealth` field. It is only produced by the analysis step, which uses:
- 1-10 scale (spec: 0-100)
- `HEALTH_RATINGS = ['excellent', 'good', 'fair', 'poor', 'critical']` (spec: `critical|fragile|viable|strong`)

**Impact**: Template cannot validate or store venture health data. Analysis step scale (1-10) and band enum both differ from spec.

#### F-25-03: `financialComparison` Structure Divergence (Severity: Major, Gap Importance: 4/5)

| Field | Spec | Template | Analysis Step |
|-------|------|----------|--------------|
| `projectionSource` | Required (string: "Stage 5" or "Stage 16") | absent | absent |
| `revenueVariancePct` | Required (number) | absent | absent |
| `unitEconomicsAssessment` | Required (string) | absent | absent |
| `financialTrajectory` | Required (enum: `improving\|flat\|declining`) | absent | absent |
| `projected`/`actual` | Not in spec | In template | In analysis step |

Both template and analysis step use a freeform string-based structure (`projected`, `actual`, `variance`, `assessment`) instead of the spec's quantitative fields.

#### F-25-04: `INITIATIVE_STATUSES` Enum Mismatch (Severity: Minor, Gap Importance: 2/5)

Template: `planned|in_progress|completed|cancelled`. Spec: `planned|in_progress|completed|abandoned|deferred`. Template uses `cancelled` (not in spec), missing `abandoned` and `deferred`.

#### F-25-05: `driftCheck.semanticDrift` Enum Mismatch (Severity: Minor, Gap Importance: 3/5)

Template: `none|minor|moderate|severe`. Spec: `aligned|moderate_drift|major_drift`. Different value naming and granularity. Template has 4 levels vs spec's 3.

#### F-25-06: `next_steps[].category` Not Enum (Severity: Minor, Gap Importance: 1/5)

Spec: enum `product|market|technical|financial|team`. Template declares `{ type: 'string' }`.

#### F-25-07: Template/Analysis Step `VENTURE_DECISIONS` Inconsistency (Severity: Major, Gap Importance: 4/5)

The template exports `VENTURE_DECISIONS = ['proceed', 'pivot', 'pause', 'terminate']` while the analysis step exports `VENTURE_DECISIONS = ['continue', 'pivot', 'expand', 'sunset', 'exit']`. Any code importing from one module gets a different enum than the other. The analysis step is spec-compliant; the template is not.

### Stage 25 Compliance: 55%

---

## Cross-Stage Contract Analysis

### Stage 22 → Stage 23 Contract

**Spec**: Stage 22 must provide `promotionGate = pass` AND `releaseDecision = 'release'`.
**Implementation**: Kill gate only checks `promotion_gate.pass`, not `releaseDecision`. **Partial compliance.**

### Stage 23 → Stage 24 Contract

**Spec**: Stage 23 provides `successCriteria[]` and `launchType` to Stage 24.
**Implementation**: Analysis step produces spec-compliant output. Template schema uses different field names (`criterion`/`timeframe` vs `metric`/`measurementWindow`). The `criterionRef` back-link in Stage 24 is missing. **Partial compliance.**

### Stage 24 → Stage 25 Contract

**Spec**: Stage 24 provides metrics + learnings + `launchOutcome` to Stage 25.
**Implementation**: Analysis step produces compliant output. Template `computeDerived` uses non-spec enum values for `launchOutcome.assessment`. **Partial compliance.**

### All Stages → Stage 25 (Capstone Consumption)

**Spec**: Stage 25 consumes Stages 1, 5, 13, 16, 20-24.
**Implementation**: Analysis step accepts `stage24Data`, `stage23Data`, `stage01Data`, `stage05Data`, `stage16Data`, `stage13Data`. Missing explicit consumption of Stages 20-22. **Partial compliance** — Stages 20-22 data not directly consumed.

---

## Summary of Findings by Severity

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| Critical | 2 | F-25-01, F-25-02 |
| Major | 7 | F-23-01, F-23-04, F-23-06, F-24-01, F-24-03, F-25-03, F-25-07 |
| Minor | 9 | F-23-02, F-23-03, F-23-05, F-23-07, F-24-02, F-24-04, F-24-05, F-25-04, F-25-05, F-25-06 |

## Recurring Pattern: Template vs Analysis Step Divergence

A systemic pattern emerges: **analysis steps are more spec-compliant than their parent templates**. In all three stages, the analysis step enums and output structures more closely match the Architecture v1.6 spec, while the template schemas use older or alternative values. This suggests the analysis steps were written (or updated) with the spec as reference, but the template schemas were not updated to match.

**Recommendation**: Align template enums and schema fields to match the analysis step outputs, which are already spec-compliant.

---

## Recommendations

1. **[Critical] Align Stage 25 `VENTURE_DECISIONS` template enum** to spec values (`continue|pivot|expand|sunset|exit`)
2. **[Critical] Add `ventureHealth` to Stage 25 template schema** with 0-100 scale and spec band enum
3. **[Major] Align Stage 23 `launchType` template enum** to spec values (`soft_launch|beta|general_availability`)
4. **[Major] Align Stage 23 `successCriteria[]` field names** to spec (`measurementWindow`, `priority`)
5. **[Major] Add `releaseDecision` check** to Stage 23 kill gate
6. **[Major] Add `criterionRef`** to Stage 24 AARRR metric schema
7. **[Major] Align Stage 24 `launchOutcome.assessment`** template enum to spec (`success` not `successful`)
8. **[Major] Restructure Stage 25 `financialComparison`** to include `revenueVariancePct`, `financialTrajectory`, etc.
9. **[Minor] Constrain enum fields** that are currently free-text strings (task status, learnings category, next step category)
10. **[Minor] Normalize naming conventions** (`trend_window_days` → `trendWindowDays`)
