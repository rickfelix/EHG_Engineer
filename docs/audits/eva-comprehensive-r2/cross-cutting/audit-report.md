---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Cross-Cutting Consistency Audit Report - Round 2


## Table of Contents

- [1. Score Comparison](#1-score-comparison)
- [2. Remediation Verification Matrix](#2-remediation-verification-matrix)
  - [Individual Finding Remediation](#individual-finding-remediation)
  - [Remediation Summary](#remediation-summary)
- [3. Category Score Breakdown](#3-category-score-breakdown)
- [4. Detailed Finding Analysis](#4-detailed-finding-analysis)
  - [CRIT-001: parseJSON Duplication — **FIXED**](#crit-001-parsejson-duplication-fixed)
  - [CRIT-002: No Logging (57% of Files) — **NOT FIXED**](#crit-002-no-logging-57-of-files-not-fixed)
  - [CRIT-003: Two Competing Error Systems — **PARTIALLY FIXED** (downgraded to HIGH)](#crit-003-two-competing-error-systems-partially-fixed-downgraded-to-high)
  - [HIGH-001: Silent Catch Blocks — **PARTIALLY FIXED**](#high-001-silent-catch-blocks-partially-fixed)
  - [HIGH-002: Three Competing Logging Approaches — **PARTIALLY FIXED**](#high-002-three-competing-logging-approaches-partially-fixed)
  - [HIGH-003: DI Parameter Naming (`db` vs `supabase`) — **NOT FIXED**](#high-003-di-parameter-naming-db-vs-supabase-not-fixed)
  - [MED-001: Unguarded JSON.parse — **PARTIALLY FIXED**](#med-001-unguarded-jsonparse-partially-fixed)
  - [MED-002: Default Exports — **NOT FIXED**](#med-002-default-exports-not-fixed)
  - [MED-003: Mixed Default + Named Exports — **NOT FIXED**](#med-003-mixed-default-named-exports-not-fixed)
  - [MED-004: No Centralized Utility Library — **PARTIALLY FIXED**](#med-004-no-centralized-utility-library-partially-fixed)
  - [LOW-001: Log Message Format Inconsistency — **NOT FIXED**](#low-001-log-message-format-inconsistency-not-fixed)
- [5. New R2 Findings](#5-new-r2-findings)
  - [R2-NEW-01: LLM Client Parameter Named `client` (All 25 Stage Templates)](#r2-new-01-llm-client-parameter-named-client-all-25-stage-templates)
  - [R2-NEW-02: Utils Directory Only Contains 1 Function](#r2-new-02-utils-directory-only-contains-1-function)
- [6. Cross-Reference with R2 Phase Audit Findings](#6-cross-reference-with-r2-phase-audit-findings)
- [7. Net Delta Analysis](#7-net-delta-analysis)
  - [Improvements (+17 points)](#improvements-17-points)
  - [Unchanged or Worsened](#unchanged-or-worsened)
- [8. Recommendations](#8-recommendations)
  - [P0 - Immediate](#p0---immediate)
  - [P1 - Short-Term](#p1---short-term)
  - [P2 - Medium-Term](#p2---medium-term)
- [9. Conclusion](#9-conclusion)

**SD**: SD-EVA-QA-AUDIT-R2-CROSSCUT-001
**Parent Orchestrator**: SD-EVA-QA-AUDIT-R2-ORCH-001
**Auditor**: Claude Opus 4.6
**Date**: 2026-02-15
**Scope**: Cross-cutting patterns across 121 files in `lib/eva/` and 90+ EVA scripts

---

## 1. Score Comparison

| Metric | R1 Score | R2 Score | Delta |
|--------|----------|----------|-------|
| Overall | 38/100 | 55/100 | +17 |
| Critical Findings | 3 | 1 | -2 |
| High Findings | 3 | 3 | 0 |
| Medium Findings | 4 | 3 | -1 |
| Low Findings | 1 | 1 | 0 |
| Total Findings | 11 | 8 | -3 |

**R2 Overall Score: 55/100** (+17 from R1)

---

## 2. Remediation Verification Matrix

### Individual Finding Remediation

| Finding ID | Description | R1 Severity | R2 Status | Verdict |
|------------|-------------|-------------|-----------|---------|
| CRIT-001 | 25 identical copies of parseJSON utility | Critical | Centralized to `lib/eva/utils/parse-json.js`; 1 local duplicate remains in stage-15 | **FIXED** |
| CRIT-002 | 68 files have no logging (57% of codebase) | Critical | 72 files still silent (59.5% of 121 files); proportion unchanged | **NOT FIXED** |
| CRIT-003 | Two competing error systems | Critical | ServiceError adoption grew from 1 to 10 files; 48 files still use generic Error | **PARTIALLY FIXED** |
| HIGH-001 | Silent catch blocks (12+ files) | High | Reduced from 12+ to 3 files (sd-completed.js, eva-orchestrator.js, venture-research.js) | **PARTIALLY FIXED** |
| HIGH-002 | Three competing logging approaches | High | 41 files use injected logger, 9 use console.log, 72 have none; no unified facade | **PARTIALLY FIXED** |
| HIGH-003 | DI parameter naming (`db` vs `supabase`) | High | 4+ files still use `db`: constraint-drift-detector, orchestrator-state-machine, reality-gates, saga-coordinator | **NOT FIXED** |
| MED-001 | 60+ unguarded JSON.parse calls | Medium | Reduced to ~17 unguarded calls (centralized parseJSON covers most analysis steps) | **PARTIALLY FIXED** |
| MED-002 | 28 files use default exports | Medium | Still 28 files (all 25 stage templates + 3 others) | **NOT FIXED** |
| MED-003 | Mixed default + named exports | Medium | 3 files confirmed: chairman-preference-store, decision-filter-engine, venture-context-manager | **NOT FIXED** |
| MED-004 | No centralized utility library | Medium | `lib/eva/utils/` created with `parse-json.js` and `index.js` | **PARTIALLY FIXED** |
| LOW-001 | Log message format inconsistency | Low | Mixed prefix formats persist: `[Scheduler]`, `[SagaCoordinator]`, `[ConstraintDrift]` — no standard | **NOT FIXED** |

### Remediation Summary

| Status | Count | Percentage |
|--------|-------|------------|
| FIXED | 1 | 9% |
| PARTIALLY FIXED | 5 | 45% |
| NOT FIXED | 5 | 45% |
| **Total R1 Findings** | **11** | |

---

## 3. Category Score Breakdown

| Category | R1 Score | R2 Score | Delta | Key Change |
|----------|----------|----------|-------|------------|
| Error handling consistency | 5/25 | 10/25 | +5 | ServiceError adoption 1 → 10 files, silent catches 12 → 3 |
| Logging consistency | 5/25 | 8/25 | +3 | 41 files now use injected logger, but 72 still silent |
| Utility duplication (DRY) | 5/20 | 16/20 | +11 | parseJSON centralized, 25 → 1 duplicate remaining |
| Export pattern consistency | 13/15 | 13/15 | 0 | Unchanged: 28 default exports, 3 mixed |
| DI naming consistency | 10/15 | 8/15 | -2 | Still 4+ files with `db`; new file count (121) makes ratio slightly worse |
| **Overall** | **38/100** | **55/100** | **+17** | |

---

## 4. Detailed Finding Analysis

### CRIT-001: parseJSON Duplication — **FIXED**

**R1**: 25 identical 9-line `parseJSON()` functions across all analysis step files.

**R2 Evidence**:
- Centralized utility created at `lib/eva/utils/parse-json.js`
- Re-exported via `lib/eva/utils/index.js`
- 24 of 25 analysis steps now import from centralized utility
- **1 remaining duplicate**: `lib/eva/stage-templates/analysis-steps/stage-15-risk-register.js` (lines 130-137) defines a local `parseJSON()` alongside importing the centralized one

**Verdict**: FIXED (96% remediation; stage-15 duplicate is residual, not systemic)

---

### CRIT-002: No Logging (57% of Files) — **NOT FIXED**

**R1**: 68 of 119 files (57%) had zero logging.

**R2 Evidence**:
- 72 of 121 files (59.5%) still have zero logging
- File count grew from 119 → 121 (2 new files added)
- All 25 analysis step files remain completely silent (no logging of LLM calls)
- Stage-zero files remain uninstrumented
- No mandatory logger injection standard established

**Breakdown**:
| Approach | File Count | Percentage |
|----------|-----------|------------|
| Injected `logger` parameter | 41 | 33.9% |
| Direct `console.log/error/warn` | 9 | 7.4% |
| No logging at all | 72 | 59.5% |

**Verdict**: NOT FIXED — proportion unchanged; systemic gap persists

---

### CRIT-003: Two Competing Error Systems — **PARTIALLY FIXED** (downgraded to HIGH)

**R1**: 55 files used `throw new Error()`, 1 file used `ServiceError`.

**R2 Evidence**:
- **ServiceError adoption**: 1 → 10 files (10x increase)
  - New adopters: saga-coordinator, gate-signal-service, escalation-event-persister, lifecycle-sd-bridge, cross-venture-learning, dependency-manager, chairman-decision-watcher, expand-spinoff-evaluator, portfolio-optimizer
- **Generic `throw new Error()`**: 48 files with 139 total occurrences
- **No error handling**: ~63 files

**Verdict**: PARTIALLY FIXED — ServiceError adoption growing but still minority (10/121 = 8.3%)

---

### HIGH-001: Silent Catch Blocks — **PARTIALLY FIXED**

**R1**: 12+ files with catch blocks that swallow exceptions.

**R2 Evidence**:
- Reduced to 3 files:
  1. `lib/eva/event-bus/handlers/sd-completed.js` — `.catch(() => {})` on audit logging
  2. `lib/eva/eva-orchestrator.js` — catch block without error logging
  3. `lib/eva/services/venture-research.js` — catch block suppressing errors
- No empty `catch { }` blocks found
- No `.catch(() => {})` patterns found outside sd-completed.js

**Verdict**: PARTIALLY FIXED — 75% reduction (12+ → 3 files)

---

### HIGH-002: Three Competing Logging Approaches — **PARTIALLY FIXED**

**R1**: Three approaches coexisting with no standard.

**R2 Evidence**:
- Injected `logger` has become the dominant approach (41 files, 33.9%)
- `console.log` usage reduced to 9 files (7.4%)
- No centralized logging facade or factory exists
- No log format standard document
- OrchestratorTracer still isolated to 2 files

**Key files still using console.log directly**:
- `eva-master-scheduler.js`
- `venture-monitor.js`
- `observability.js`
- 6 event-bus handler files

**Verdict**: PARTIALLY FIXED — injected logger gaining adoption, but no unified standard

---

### HIGH-003: DI Parameter Naming (`db` vs `supabase`) — **NOT FIXED**

**R1**: 6 files used `db` instead of `supabase`.

**R2 Evidence**:
- 4 files confirmed still using `db`:
  1. `constraint-drift-detector.js` (line 47, plus internal usage at lines 182, 200)
  2. `orchestrator-state-machine.js` (lines 90, 150, 207)
  3. `saga-coordinator.js` (lines 181, 200)
  4. `reality-gates.js` (line 100+)
- No renaming effort detected
- Additionally, all 25 stage templates still use `client` for LLM client (not `llmClient`)

**Verdict**: NOT FIXED — no progress on naming consistency

---

### MED-001: Unguarded JSON.parse — **PARTIALLY FIXED**

**R1**: 60+ direct `JSON.parse()` calls without error handling.

**R2 Evidence**:
- Centralized parseJSON covers most analysis step usage
- ~17 unguarded `JSON.parse()` calls remain in lib/eva/
- Concentrated in: shared-services.js, venture-monitor.js, stage template `computeDerived()` functions

**Verdict**: PARTIALLY FIXED — ~72% reduction (60+ → 17)

---

### MED-002: Default Exports — **NOT FIXED**

**R1**: 28 files use `export default`.

**R2 Evidence**:
- Still 28 files:
  - All 25 stage template files (stage-01.js through stage-25.js)
  - `decision-filter-engine.js`
  - `chairman-preference-store.js`
  - `venture-context-manager.js`

**Verdict**: NOT FIXED — no consolidation to named exports

---

### MED-003: Mixed Default + Named Exports — **NOT FIXED**

**R1**: Identified as issue but count not tracked.

**R2 Evidence**:
- 3 files confirmed with both `export default` and named exports:
  1. `chairman-preference-store.js`
  2. `decision-filter-engine.js`
  3. `venture-context-manager.js`

**Verdict**: NOT FIXED — anti-pattern persists in same 3 files

---

### MED-004: No Centralized Utility Library — **PARTIALLY FIXED**

**R1**: No `lib/eva/utils/` directory existed.

**R2 Evidence**:
- `lib/eva/utils/` created with:
  - `parse-json.js` — parseJSON utility
  - `index.js` — re-export barrel file
- Only 1 utility function centralized
- Other candidates not yet extracted: error factory, logger factory, validation helpers

**Verdict**: PARTIALLY FIXED — directory exists with 1 utility; more consolidation needed

---

### LOW-001: Log Message Format Inconsistency — **NOT FIXED**

**R1**: No established log prefix convention.

**R2 Evidence**:
- Mixed prefix formats persist:
  - `[Scheduler]` in eva-master-scheduler.js
  - `[SagaCoordinator]` in saga-coordinator.js
  - `[ConstraintDrift]` in constraint-drift-detector.js
  - `[Tracer]` in observability.js
- All PascalCase, but no documented standard for length or naming convention
- No log format specification document exists

**Verdict**: NOT FIXED — inconsistency persists

---

## 5. New R2 Findings

### R2-NEW-01: LLM Client Parameter Named `client` (All 25 Stage Templates)

- **Severity**: Medium
- **Location**: `lib/eva/stage-templates/analysis-steps/stage-*.js` (all 25 files)
- **Details**: All analysis steps use `client` as the parameter name for the LLM client. This generic name collides with potential Supabase client references and is ambiguous.
- **Impact**: Copy-paste errors when moving code between modules that use different `client` objects. Confusion about whether `client` refers to LLM, database, or HTTP client.
- **Recommendation**: Rename to `llmClient` for disambiguation.

### R2-NEW-02: Utils Directory Only Contains 1 Function

- **Severity**: Low
- **Location**: `lib/eva/utils/` (only `parse-json.js` and `index.js`)
- **Details**: The utility directory was created to address CRIT-001 but only contains the parseJSON function. No error handling utilities, no logging factory, no type validation helpers have been extracted despite being identified as candidates in R1.
- **Impact**: Low immediate impact, but missed opportunity for further DRY improvement.

---

## 6. Cross-Reference with R2 Phase Audit Findings

| Phase Audit (R2) | Score | Cross-Cutting Confirmation |
|-------------------|-------|---------------------------|
| Infrastructure (75/100) | +17 from R1 | INFRA CRIT-001 (dead retry logic) linked to error system inconsistency (CRIT-003); bare catch blocks in event-bus confirmed reduced from HIGH-001 |
| Phase 5 Build Loop (72/100) | +27 from R1 | Enum validation improvements corroborate ServiceError adoption trend; build stages still use generic Error for validation failures |
| Phase 6 Launch (62%) | New | Stage 23-25 analysis steps confirm zero logging (CRIT-002); all use local parseJSON imports from centralized util (CRIT-001 FIXED) |
| PRD-EXEC Gap (78/100) | +23 from R1 | Gate validators now enforce PRD field presence; integration_operationalization still NULL across all EVA PRDs |
| Phase 1 Truth | Completed | Stage templates confirmed using centralized parseJSON |
| Phase 3 Identity | Completed | Confirmed injected logger pattern in newer services |
| Phase 4 Blueprint | Completed | Stage templates confirmed using default exports pattern |

---

## 7. Net Delta Analysis

### Improvements (+17 points)

1. **Utility Centralization** (+11 points): parseJSON consolidated from 25 copies to 1 centralized utility with 1 residual duplicate. This was the single largest quality improvement, creating the `lib/eva/utils/` directory and establishing a pattern for future consolidation.

2. **Error System Convergence** (+5 points): ServiceError adoption grew 10x (1 → 10 files). While still a minority, this demonstrates directional movement toward structured error handling. Silent catch blocks reduced 75% (12 → 3 files).

3. **Logging Pattern Emergence** (+1 point): Injected `logger` parameter now used in 41 files (34%), becoming the de facto standard even without formal documentation. However, 72 files (60%) remain completely silent, offsetting most gains.

### Unchanged or Worsened

1. **Logging Coverage** (0 points): 60% of files have zero logging, unchanged from R1. No mandatory logger injection standard created.

2. **DI Naming** (-2 points): Still 4+ files using `db` instead of `supabase`. Proportion slightly worse with new file additions.

3. **Export Patterns** (0 points): Same 28 default exports, same 3 mixed export files. No migration effort.

---

## 8. Recommendations

### P0 - Immediate

1. **Establish mandatory logging standard**: Define logger injection pattern and instrument the 72 silent files, starting with all 25 analysis steps (LLM calls have zero observability).

2. **Create ServiceError migration guide**: Document error code catalog and provide migration pattern from `throw new Error()` to `throw new ServiceError()`.

### P1 - Short-Term

3. **Rename `db` → `supabase`** in constraint-drift-detector.js, orchestrator-state-machine.js, saga-coordinator.js, reality-gates.js.

4. **Add remaining silent catch error logging** in sd-completed.js, eva-orchestrator.js, venture-research.js.

5. **Rename `client` → `llmClient`** in 25 analysis step files for disambiguation.

### P2 - Medium-Term

6. **Convert 28 default exports to named exports**, starting with the 3 mixed-export files.

7. **Expand `lib/eva/utils/`** with error-factory.js, logger-factory.js, and validation helpers.

8. **Wrap remaining 17 unguarded `JSON.parse` calls** with try/catch or centralized utility.

9. **Document log prefix format standard** (e.g., `[ModuleName]` PascalCase, max 20 chars).

---

## 9. Conclusion

The EVA cross-cutting consistency audit improved from R1 (38/100) to R2 (55/100), a **+17 point improvement**. The dominant driver was **parseJSON centralization** (CRIT-001), which created the `lib/eva/utils/` directory and reduced 25 duplicate functions to 1. ServiceError adoption grew 10x and silent catch blocks dropped 75%, showing positive directional movement on error handling.

However, the **largest remaining gap is logging**: 60% of EVA files (72/121) have zero instrumentation, making production debugging and LLM call observability impossible. This was CRIT-002 in R1 and remains the single most impactful unresolved finding. DI naming inconsistency and export pattern issues persist unchanged.

**Positive trajectory**: The creation of `lib/eva/utils/` and ServiceError adoption show that centralization patterns are gaining traction. The 41-file adoption of injected `logger` provides a foundation for mandatory logging enforcement.

**Key risk**: Without logging instrumentation, the other improvements (error handling, utility centralization) cannot be observed in production, limiting their practical value.
