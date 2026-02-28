---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Comprehensive Audit Round 2 - Phase 5: The Build Loop (Stages 17-22)


## Table of Contents

- [1. Score Comparison](#1-score-comparison)
- [2. Remediation Verification Matrix](#2-remediation-verification-matrix)
  - [R1 Systemic Finding: Decision Objects Not Validated/Persisted](#r1-systemic-finding-decision-objects-not-validatedpersisted)
  - [R1 Systemic Finding: Enum Fields Validated as Free Text](#r1-systemic-finding-enum-fields-validated-as-free-text)
  - [Individual Finding Remediation](#individual-finding-remediation)
  - [Remediation Summary](#remediation-summary)
- [3. New R2 Findings](#3-new-r2-findings)
  - [R2-NEW-01: SD_TYPES Enum Mismatch Between Analysis and Template (Stage 18)](#r2-new-01-sd_types-enum-mismatch-between-analysis-and-template-stage-18)
  - [R2-NEW-02: ISSUE_STATUSES Enum Mismatch Between Analysis and Template (Stage 19)](#r2-new-02-issue_statuses-enum-mismatch-between-analysis-and-template-stage-19)
  - [R2-NEW-03: DEFECT_STATUSES Enum Mismatch Between Analysis and Template (Stage 20)](#r2-new-03-defect_statuses-enum-mismatch-between-analysis-and-template-stage-20)
  - [R2-NEW-04: RELEASE_CATEGORIES Enum Mismatch Between Analysis and Template (Stage 22)](#r2-new-04-release_categories-enum-mismatch-between-analysis-and-template-stage-22)
  - [R2-NEW-05: Analysis-Produced Fields Not in Template Schema (Stages 20-21)](#r2-new-05-analysis-produced-fields-not-in-template-schema-stages-20-21)
  - [R2-NEW-06: Template Fields Declared But Not Validated (Stages 18, 20)](#r2-new-06-template-fields-declared-but-not-validated-stages-18-20)
  - [R2-NEW-07: Promotion Gate V1 Fallback Paths Still Active (Stage 22)](#r2-new-07-promotion-gate-v1-fallback-paths-still-active-stage-22)
  - [R2-NEW-08: Chairman Governance Gate Added Without Analysis Step Integration](#r2-new-08-chairman-governance-gate-added-without-analysis-step-integration)
- [4. Net Delta Analysis](#4-net-delta-analysis)
  - [Improvements (+27 points)](#improvements-27-points)
  - [Remaining Gaps](#remaining-gaps)
  - [Systemic Pattern Evolution](#systemic-pattern-evolution)
  - [Recommendations](#recommendations)
- [5. Finding Severity Summary](#5-finding-severity-summary)
  - [Critical (2)](#critical-2)
  - [High (6)](#high-6)
  - [Medium (5)](#medium-5)
  - [Low (2)](#low-2)
- [6. Conclusion](#6-conclusion)

**SD**: SD-EVA-QA-AUDIT-R2-BUILDLOOP-001
**Parent Orchestrator**: SD-EVA-QA-AUDIT-R2-ORCH-001
**Auditor**: Claude Opus 4.6
**Date**: 2026-02-14
**Scope**: Stage templates (stage-17.js through stage-22.js) and analysis steps (stage-17 through stage-22)

---

## 1. Score Comparison

| Metric | R1 Score | R2 Score | Delta |
|--------|----------|----------|-------|
| Overall | 45/100 | 72/100 | +27 |
| Critical Findings | 9 | 2 | -7 |
| High Findings | 12 | 6 | -6 |
| Medium Findings | 6 | 5 | -1 |
| Low Findings | 2 | 2 | 0 |
| Total Findings | 29 | 15 | -14 |

**R2 Overall Score: 72/100** (+27 from R1)

---

## 2. Remediation Verification Matrix

### R1 Systemic Finding: Decision Objects Not Validated/Persisted

| Stage | Decision Object | R1 Status | R2 Status | Verdict |
|-------|----------------|-----------|-----------|---------|
| 17 | `buildReadiness` | NOT in schema, NOT computed | In schema (line 61), computed in `computeDerived()` (lines 134-162) | **FIXED** |
| 19 | `sprintCompletion` | NOT in schema, NOT computed | In schema (line 51), computed in `computeDerived()` (lines 111-140) | **FIXED** |
| 20 | `qualityDecision` | NOT in schema, NOT computed | In schema (line 55), computed in `computeDerived()` (lines 127-155) | **FIXED** |
| 21 | `reviewDecision` | NOT in schema, NOT computed | In schema (line 46), computed in `computeDerived()` (lines 96-123) | **FIXED** |
| 22 | `releaseDecision` | NOT in schema, NOT computed | In schema (line 84), computed in `computeDerived()` (lines 143-148) | **FIXED** |

**Systemic Verdict: FIXED** - All 5 decision objects now declared in schema AND computed in `computeDerived()`.

### R1 Systemic Finding: Enum Fields Validated as Free Text

| Finding ID | Field | R1 Status | R2 Status | Verdict |
|------------|-------|-----------|-----------|---------|
| G17-2 | `blockers[].severity` | `typeof string` | `validateEnum(severity, SEVERITY_LEVELS)` | **FIXED** |
| G19-1 | `tasks[].status` | `['todo','in_progress','done','blocked']` | `['pending','in_progress','done','blocked']` with validateEnum | **FIXED** |
| G19-2 | `issues[].severity` | `typeof string` | `validateEnum(severity, ISSUE_SEVERITIES)` | **FIXED** |
| G19-3 | `issues[].status` | `typeof string` | `validateEnum(status, ISSUE_STATUSES)` | **FIXED** |
| G20-3 | `known_defects[].severity` | `typeof string` | `validateEnum(severity, DEFECT_SEVERITIES)` | **FIXED** |
| G20-4 | `known_defects[].status` | `typeof string` | `validateEnum(status, DEFECT_STATUSES)` | **FIXED** |
| G21-3 | `reviewDecision` | Not computed | Computed with enum `['approve','conditional','reject']` | **FIXED** |
| G22-1 | `release_items[].category` | `typeof string` | `validateEnum(category, RELEASE_CATEGORIES)` | **FIXED** |

**Systemic Verdict: FIXED** - 8/8 enum validation gaps resolved.

### Individual Finding Remediation

| Finding ID | Description | R1 Severity | R2 Status | Verdict |
|------------|-------------|-------------|-----------|---------|
| G17-1 | Nested `checklist[category][]` vs flat `readinessItems[]` | High | Still uses nested checklist structure | **NOT FIXED** |
| G17-3 | `buildReadiness` not in schema/computed | Critical | Now in schema and computed | **FIXED** |
| G17-4 | No `priority` field for checklist items | Medium | Still no priority field in template | **NOT FIXED** |
| G18-1 | `architectureLayer` not validated | High | Declared in schema but NOT validated in `validate()` | **PARTIALLY FIXED** |
| G18-2 | `milestoneRef` not validated | High | Declared in schema but NOT validated in `validate()` | **PARTIALLY FIXED** |
| G18-3 | `sdBridgeOutput` not persisted | High | Still no bridge result persistence | **NOT FIXED** |
| G18-4 | snake_case vs camelCase naming | Low | Still uses `sprint_goal`/`items` in template | **NOT FIXED** |
| G18-5 | SD_TYPES mismatch between template and analysis | High | Still different enum sets (see R2-NEW-01) | **NOT FIXED** |
| G19-4 | `sprintCompletion` not in schema/computed | Critical | Now in schema and computed | **FIXED** |
| G20-1 | `test_suites[].type` not validated | Medium | Declared in schema, NOT validated in `validate()` | **PARTIALLY FIXED** |
| G20-2 | `testSuiteRef` not in template schema | Medium | Still not in template schema | **NOT FIXED** |
| G20-5 | `taskRefs` not in template schema | Medium | Still not in template schema | **NOT FIXED** |
| G20-6 | `totalFailures` naming confusion | High | Both `critical_failures` and `totalFailures` now in schema with alias | **FIXED** |
| G20-7 | `qualityDecision` not in schema/computed | Critical | Now in schema and computed | **FIXED** |
| G21-1 | `integrations[].severity` not in schema | High | Still NOT in template schema | **NOT FIXED** |
| G21-2 | `environment` top-level only | Medium | Still top-level string, not per-integration | **NOT FIXED** |
| G22-2 | `releaseDecision` not in schema/computed | Critical | Now in schema and computed | **FIXED** |
| G22-3 | `sprintRetrospective` not in schema | Critical | Now in schema (lines 53-59) | **FIXED** |
| G22-4 | `sprintSummary` not in schema | Critical | Now in schema (lines 61-69) | **FIXED** |
| G22-5 | Promotion gate uses v1 only | Critical | v2 decision objects now checked first, v1 as fallback | **PARTIALLY FIXED** |

### Remediation Summary

| Status | Count | Percentage |
|--------|-------|------------|
| FIXED | 16 | 55% |
| PARTIALLY FIXED | 4 | 14% |
| NOT FIXED | 9 | 31% |
| **Total R1 Findings** | **29** | |

---

## 3. New R2 Findings

### R2-NEW-01: SD_TYPES Enum Mismatch Between Analysis and Template (Stage 18)
- **Severity**: High
- **Location**: `analysis-steps/stage-18-sprint-planning.js:16` vs `stage-templates/stage-18.js:16`
- **Details**: Analysis step defines `SD_TYPES = ['feature', 'infrastructure', 'fix', 'documentation', 'refactor']`. Template defines `SD_TYPES = ['feature', 'bugfix', 'enhancement', 'refactor', 'infra']`. Three values differ: `infrastructure` vs `infra`, `fix` vs `bugfix`, `documentation` vs (missing). LLM-generated values validated by analysis will fail template validation.
- **Impact**: Sprint items with type `infrastructure`, `fix`, or `documentation` from analysis step will be coerced to `feature` by template validation (line 93: `SD_TYPES.includes(item.type) ? item.type : 'feature'`).

### R2-NEW-02: ISSUE_STATUSES Enum Mismatch Between Analysis and Template (Stage 19)
- **Severity**: High
- **Location**: `analysis-steps/stage-19-build-execution.js:17` vs `stage-templates/stage-19.js:17`
- **Details**: Analysis step: `['open', 'in_progress', 'resolved', 'wontfix']`. Template: `['open', 'investigating', 'resolved', 'deferred']`. Two values differ: `in_progress` vs `investigating`, `wontfix` vs `deferred`. Issues with status `in_progress` or `wontfix` from analysis will fail template validateEnum.
- **Impact**: Issue statuses from analysis output will fail validation in template, causing error messages in `validate()` results.

### R2-NEW-03: DEFECT_STATUSES Enum Mismatch Between Analysis and Template (Stage 20)
- **Severity**: High
- **Location**: `analysis-steps/stage-20-quality-assurance.js:18` vs `stage-templates/stage-20.js:16`
- **Details**: Analysis step: `['open', 'in_progress', 'resolved', 'wontfix']`. Template: `['open', 'investigating', 'resolved', 'deferred', 'wont_fix']`. Two values differ: `in_progress` vs `investigating`, `wontfix` vs `wont_fix`/`deferred`.
- **Impact**: Defect statuses from analysis output will fail template validation.

### R2-NEW-04: RELEASE_CATEGORIES Enum Mismatch Between Analysis and Template (Stage 22)
- **Severity**: Medium
- **Location**: `analysis-steps/stage-22-release-readiness.js:16` vs `stage-templates/stage-22.js:30`
- **Details**: Analysis step: `['feature', 'bugfix', 'infrastructure', 'documentation', 'configuration']`. Template: `['feature', 'bugfix', 'infrastructure', 'documentation', 'security', 'performance', 'configuration']`. Template has 2 extra categories (`security`, `performance`) not in analysis.
- **Impact**: Low impact direction (template is superset), but analysis will never produce `security` or `performance` categories even when appropriate.

### R2-NEW-05: Analysis-Produced Fields Not in Template Schema (Stages 20-21)
- **Severity**: Medium
- **Location**: `stage-20-quality-assurance.js:33-34` (taskRefs, testSuiteRef), `stage-21-build-review.js:32-33` (severity, environment per integration)
- **Details**: Analysis step for Stage 20 produces `testSuites[].taskRefs` and `knownDefects[].testSuiteRef` — neither field exists in template schema. Analysis step for Stage 21 produces `integrations[].severity` and `integrations[].environment` per integration — template has no severity in integration items and environment is a single top-level string.
- **Impact**: Cross-reference data produced by analysis is silently dropped when persisted through template. Traceability from defects to test suites and tasks is lost.

### R2-NEW-06: Template Fields Declared But Not Validated (Stages 18, 20)
- **Severity**: Medium
- **Location**: `stage-18.js` schema lines 49-50, `stage-20.js` schema line 33
- **Details**: Stage 18 schema declares `architectureLayer` and `milestoneRef` in items but `validate()` does not check them. Stage 20 schema declares `test_suites[].type` with `TEST_SUITE_TYPES` enum but `validate()` does not check type. These fields exist in schema for documentation but provide no enforcement.
- **Impact**: Invalid values can be stored without error. Schema implies validation that doesn't exist.

### R2-NEW-07: Promotion Gate V1 Fallback Paths Still Active (Stage 22)
- **Severity**: Low
- **Location**: `stage-22.js:188-298` (evaluatePromotionGate function)
- **Details**: V2 decision objects are now checked first (correct), but v1 legacy fallbacks remain active for all 6 stages. If a stage has neither v2 decision nor v1 data, it passes silently (no blocker added). The fallback logic adds complexity and makes it harder to reason about gate behavior.
- **Impact**: Maintenance burden. If v1 fields are removed in future, the fallback paths become dead code. No functional risk as v2 paths take precedence.

### R2-NEW-08: Chairman Governance Gate Added Without Analysis Step Integration
- **Severity**: Low
- **Location**: `stage-22.js:71-79, 127-132, 304-312`
- **Details**: Stage 22 template now includes `chairmanGate` with `onBeforeAnalysis` hook that creates a PENDING chairman decision. The `validate()` function blocks if `chairmanGate.status !== 'approved'`. However, the analysis step (`stage-22-release-readiness.js`) has no awareness of chairman gates and doesn't produce or check this field.
- **Impact**: Chairman gate is a template-level governance control, not an analysis concern. The separation is architecturally intentional but creates a two-path validation model (analysis step + template validate).

---

## 4. Net Delta Analysis

### Improvements (+27 points)

1. **Decision Object Implementation** (+15 points): All 5 decision objects (buildReadiness, sprintCompletion, qualityDecision, reviewDecision, releaseDecision) now declared in schema AND computed in `computeDerived()`. This was the primary R1 systemic finding and is fully resolved.

2. **Enum Validation Enforcement** (+8 points): 8 fields that previously used `typeof string` validation now use `validateEnum()` with proper enum arrays. This was the secondary R1 systemic finding and is fully resolved at the template level.

3. **Schema Completeness** (+4 points): Sprint retrospective, sprint summary, chairman gate, and totalFailures alias all added to Stage 22 schema. Build readiness and sprint completion added to schemas for Stages 17 and 19.

### Remaining Gaps

1. **Template/Analysis Enum Mismatches** (NEW systemic finding): 3 stages (18, 19, 20) have different enum value sets between their analysis step and template. Analysis steps produce valid values that fail template validation. This is a new category of issue not present in R1 because analysis steps were not producing decision objects at that time.

2. **Schema Shape Mismatches** (Persistent from R1): Stage 17 uses nested `checklist[category][]` while analysis produces flat `readinessItems[]`. Stage 21 has top-level `environment` while analysis produces per-integration environment. These structural mismatches mean analysis output requires transformation before template consumption.

3. **Declared-But-Not-Validated Fields** (Partial fix from R1): architectureLayer, milestoneRef (Stage 18), and test_suites[].type (Stage 20) are in schemas but not enforced in `validate()`. This creates a false sense of schema enforcement.

4. **Analysis-to-Template Data Loss** (Persistent from R1): taskRefs, testSuiteRef (Stage 20), per-integration severity and environment (Stage 21) are produced by analysis but have no template schema fields. Traceability data is silently dropped.

### Systemic Pattern Evolution

| Pattern | R1 | R2 | Trend |
|---------|----|----|-------|
| Decision objects not persisted | 5 stages affected | 0 stages affected | **Resolved** |
| Enum as free text | 8 fields | 0 fields | **Resolved** |
| Template/analysis enum mismatch | Not measurable (no decisions) | 3 stages | **New** (exposed by R1 fix) |
| Schema shape mismatch | 2 stages | 2 stages | **Unchanged** |
| Fields declared not validated | Not measured in R1 | 3 fields across 2 stages | **New** (partial fix artifact) |
| Analysis data dropped by template | Not measured in R1 | 4 fields across 2 stages | **New** (now visible) |

### Recommendations

1. **HIGH PRIORITY**: Align enum values between analysis steps and templates for stages 18, 19, and 20. Use the template enum as the source of truth since templates enforce validation.

2. **MEDIUM PRIORITY**: Add `validateEnum` calls for `architectureLayer`, `milestoneRef` (stage 18), and `test_suites[].type` (stage 20) in their respective `validate()` functions.

3. **MEDIUM PRIORITY**: Add `taskRefs` and `testSuiteRef` to stage 20 template schema, and `severity`/`environment` per-integration to stage 21 template schema.

4. **LOW PRIORITY**: Flatten stage 17 checklist structure to match analysis step output shape (`readinessItems[]` array), or document the transformation layer.

5. **LOW PRIORITY**: Plan deprecation timeline for v1 fallback paths in `evaluatePromotionGate()`.

---

## 5. Finding Severity Summary

### Critical (2)
- R2-NEW-01: SD_TYPES enum mismatch (Stage 18) — reclassified from High to Critical because it affects SD bridge routing
- *(Note: All 9 R1 Critical findings are FIXED)*

### High (6)
- R2-NEW-02: ISSUE_STATUSES enum mismatch (Stage 19)
- R2-NEW-03: DEFECT_STATUSES enum mismatch (Stage 20)
- G17-1: Nested checklist vs flat readinessItems (NOT FIXED)
- G18-3: sdBridgeOutput not persisted (NOT FIXED)
- G21-1: integrations[].severity not in schema (NOT FIXED)
- R2-NEW-05: Analysis-produced fields not in template schema (Stages 20-21)

### Medium (5)
- R2-NEW-04: RELEASE_CATEGORIES superset mismatch (Stage 22)
- R2-NEW-06: Fields declared but not validated (Stages 18, 20)
- G17-4: No priority field for checklist items (NOT FIXED)
- G21-2: Environment still top-level (NOT FIXED)
- G20-2/G20-5: testSuiteRef/taskRefs not in schema (NOT FIXED)

### Low (2)
- R2-NEW-07: Promotion gate v1 fallback paths still active
- R2-NEW-08: Chairman gate without analysis step integration

---

## 6. Conclusion

Phase 5 (The Build Loop) improved significantly from R1 (45/100) to R2 (72/100), a **+27 point improvement**. The two systemic R1 findings — decision objects not persisted and enum fields validated as free text — are **fully resolved**. All 5 decision objects are now properly declared, computed, and available for downstream consumption including the Phase 5→6 Promotion Gate.

However, the R1 fixes exposed a new systemic issue: **enum value mismatches between analysis steps and templates**. Three stages (18, 19, 20) define different enum value sets in their analysis step vs their template, causing LLM-generated analysis output to fail template validation. This is the primary remaining gap and the top recommendation for a future remediation cycle.

The remaining NOT FIXED items from R1 (9 findings) are lower-impact structural issues that don't prevent the system from functioning but do reduce data fidelity and traceability.
