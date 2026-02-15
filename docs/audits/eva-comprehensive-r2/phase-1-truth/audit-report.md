# EVA Comprehensive Audit R2 — Phase 1: The Truth (Stages 1-5)

**SD**: SD-EVA-QA-AUDIT-R2-TRUTH-001
**Parent**: SD-EVA-QA-AUDIT-R2-ORCH-001
**Date**: 2026-02-14
**Auditor**: Claude (Opus 4.6)

## Executive Summary

Phase 1 (The Truth) covers Stages 1-5 of the EVA Venture Lifecycle. This is the first audit of Phase 1 — no R1 baseline exists (R1 did not include a Phase 1 audit). The audit evaluates 5 stage templates, 5 analysis steps, and their unit tests against the Architecture v1.6 Section 8.1 gold standard.

**Overall Score: 72/100**

The implementation is structurally sound with correct kill gate logic for both Stage 3 and Stage 5. All 5 templates have v2.0 schemas, validation, and computeDerived functions. However, several specification deviations exist: a truncated analysis step (Stage 1), threshold mismatches between templates and analysis steps (Stage 3), schema divergence in the Stage 4/5 handoff contract, and missing test coverage for 3 of 5 stages.

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Schema Compliance | 78/100 | 30% | 23.4 |
| Kill Gate Logic | 85/100 | 25% | 21.3 |
| Cross-Stage Contracts | 62/100 | 20% | 12.4 |
| Analysis Step Quality | 65/100 | 15% | 9.8 |
| Test Coverage | 50/100 | 10% | 5.0 |
| **Total** | | | **71.9 → 72** |

## R1 Score Comparison

| Metric | R1 | R2 | Delta |
|--------|----|----|-------|
| Overall Score | N/A | 72/100 | N/A (baseline) |
| Finding Count | N/A | 14 | N/A (baseline) |
| Critical Findings | N/A | 2 | — |
| High Findings | N/A | 5 | — |
| Medium Findings | N/A | 5 | — |
| Low Findings | N/A | 2 | — |

*No R1 audit exists for Phase 1. This report establishes the R2 baseline.*

## Findings

### CRITICAL

#### F-TRUTH-001: Stage 1 Analysis Step Incomplete (Truncated)

**Severity**: CRITICAL
**Location**: `lib/eva/stage-templates/analysis-steps/stage-01-hydration.js`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 1

**Description**: The Stage 1 analysis step file contains only the `SYSTEM_PROMPT` constant (30 lines). The `analyzeStage01` function that is imported by `stage-01.js:19` and re-exported by `analysis-steps/index.js:13` does not exist in the file. This means:
- `import { analyzeStage01 }` resolves to `undefined` in ESM
- `TEMPLATE.analysisStep = analyzeStage01` sets `analysisStep` to `undefined`
- Any runtime call to `stage01.analysisStep()` will throw a TypeError

**Impact**: Stage 1 hydration from Stage 0 synthesis cannot execute. The entire Stage 0 → Stage 1 pipeline is broken at runtime.

**Recommendation**: Complete the `analyzeStage01` function implementation. It should consume Stage 0 synthesis output and produce structured draft idea fields using the defined SYSTEM_PROMPT.

---

#### F-TRUTH-002: Stage 3 Analysis Step Uses Wrong Kill Threshold

**Severity**: CRITICAL
**Location**: `lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring.js:19`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 3 Kill Gate Logic

**Description**: The Stage 3 analysis step defines `KILL_THRESHOLD = 40` but the Architecture spec and the template's own `evaluateKillGate()` use threshold 50 for per-metric kills. This creates a split-brain:

| Component | Per-Metric Kill Threshold | Overall Kill Threshold |
|-----------|--------------------------|----------------------|
| Spec (Architecture v1.6) | 50 | 50 |
| Template (`stage-03.js`) | 50 (METRIC_THRESHOLD) | 50 (REVISE_THRESHOLD) |
| Analysis Step (`stage-03-hybrid-scoring.js`) | **40** | **40** |

The analysis step is more permissive than both the spec and the template, allowing ventures with metrics between 40-49 to pass the analysis step but fail the template validation. This inconsistency means the gate behavior depends on which code path executes.

**Recommendation**: Change `KILL_THRESHOLD` in `stage-03-hybrid-scoring.js` to 50 to align with the spec and template. Alternatively, if the intentional threshold is 40, update the spec and template to match.

---

### HIGH

#### F-TRUTH-003: Stage 3 overallScore Uses Simple Average, Spec Says Weighted

**Severity**: HIGH
**Location**: `lib/eva/stage-templates/stage-03.js:120`, `lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring.js:68`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 3 — "overallScore (number, derived: weighted average)"

**Description**: Both the template and analysis step compute `overallScore` as a simple (unweighted) average of the 6 metrics. The spec states "weighted average" and notes that `archetype` "drives Stage 3 scoring weights." No archetype-based weighting is implemented anywhere.

**Impact**: All archetypes are treated equally. A SaaS venture and a hardware venture get the same weight distribution, which may not reflect their different risk profiles.

**Recommendation**: Implement archetype-based metric weights. For example, `deeptech` might weight `executionFeasibility` higher, while `marketplace` weights `momentum` higher.

---

#### F-TRUTH-004: Stage 3 AI Calibration Not Capped at ±15 Per Metric

**Severity**: HIGH
**Location**: `lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring.js:58-64`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 3 — "50% AI calibration (capped at ±15 per metric)"

**Description**: The spec requires AI scores to be capped at ±15 deviation from deterministic scores. The implementation does a straight 50/50 blend with no cap:
```js
blended[metric] = Math.round((det + ai) / 2);
```
The AI score is unconstrained, so if deterministic = 80 and AI = 20, the blended score is 50 — a 30-point swing, double the spec's ±15 cap.

**Recommendation**: Add capping logic: `const cappedAi = Math.max(det - 15, Math.min(det + 15, ai))` before blending.

---

#### F-TRUTH-005: Stage 4 Template minItems:1, Spec Says minItems:3

**Severity**: HIGH
**Location**: `lib/eva/stage-templates/stage-04.js:35`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 4 — "competitors[] (array, minItems: 3)"

**Description**: The template schema defines `competitors` with `minItems: 1`, but the spec requires `minItems: 3`. The analysis step correctly enforces `MIN_COMPETITORS = 3`, but the template validation accepts as few as 1 competitor.

**Impact**: Data entering Stage 4 via direct template usage (not through the analysis step) could have fewer than 3 competitors, weakening competitive analysis quality.

**Recommendation**: Change `minItems: 1` to `minItems: 3` in the template schema and update `validateArray(data?.competitors, 'competitors', 1)` to use `3`.

---

#### F-TRUTH-006: Stage 4/5 Handoff Schema Mismatch

**Severity**: HIGH
**Location**: `lib/eva/stage-templates/stage-04.js:57-63` vs `lib/eva/stage-templates/analysis-steps/stage-04-competitive-landscape.js:43-48`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 4 — stage5Handoff

**Description**: The template and analysis step define different `stage5Handoff` structures:

| Field | Template (stage-04.js) | Analysis Step (stage-04-competitive-landscape.js) |
|-------|----------------------|--------------------------------------------------|
| Field 1 | `pricingLandscape` (string) | `avgMarketPrice` (string) |
| Field 2 | `competitivePositioning` (string) | `pricingModels[]` (array) |
| Field 3 | `marketGaps[]` (array) | `priceRange` (object: low, high) |
| Field 4 | — | `competitiveDensity` (enum) |

The analysis step produces a financially-oriented handoff (prices, models, density) while the template defines a strategically-oriented handoff (positioning, gaps). Stage 5's analysis step consumes the analysis step's format, so the pipeline works end-to-end, but the template's `computeDerived()` produces a different artifact that Stage 5 wouldn't understand.

**Recommendation**: Align the two structures. The analysis step's format is more useful for Stage 5 financial modeling, so update the template schema to match, or merge both formats into a single comprehensive structure.

---

#### F-TRUTH-007: Stage 5 Analysis Step Missing conditional_pass Decision

**Severity**: HIGH
**Location**: `lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js:160`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 5 — Kill Gate Logic (banded)

**Description**: The template's `evaluateKillGate()` correctly implements all 3 decisions (pass, conditional_pass, kill) with supplementary metric checks. However, the analysis step only implements 2 decisions (pass, kill) with a simpler threshold check (ROI < 0.25 OR breakEvenMonth > 24). It lacks:
- The conditional pass band (0.15 ≤ roi3y < 0.25)
- Supplementary metric checks (ltvCacRatio ≥ 3, paybackMonths ≤ 12)
- Chairman Review routing for conditional passes

**Impact**: Ventures in the conditional band (ROI 15-25%) are killed by the analysis step instead of being routed to Chairman Review.

**Recommendation**: Use the template's `evaluateKillGate()` function from the analysis step, or replicate its 3-way logic.

---

### MEDIUM

#### F-TRUTH-008: Stage 1 sourceProvenance Missing ai_refine Origin

**Severity**: MEDIUM
**Location**: `lib/eva/stage-templates/stage-01.js:96-99`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 1 — "sourceProvenance (per-field: stage0|user|ai_refine, derived)"

**Description**: The `computeDerived` function only assigns provenance values `stage0` or `user`. The spec defines a third origin `ai_refine` for fields refined by AI during hydration. This origin is never set.

**Impact**: No audit trail for AI-refined fields. All non-stage0 fields are attributed to `user` even if the hydration engine modified them.

**Recommendation**: Add `ai_refine` provenance tracking in the hydration analysis step output, then propagate it in `computeDerived`.

---

#### F-TRUTH-009: Stage 4 pricingModel Enum Mismatch Between Template and Analysis Step

**Severity**: MEDIUM
**Location**: `lib/eva/stage-templates/stage-04.js:24` vs `lib/eva/stage-templates/analysis-steps/stage-04-competitive-landscape.js:34`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 4

**Description**: The template and analysis step define different pricing model enums:

| Template | Analysis Step LLM Prompt |
|----------|-------------------------|
| `freemium` | `freemium` |
| `subscription` | `subscription` |
| `one_time` | `one-time` |
| `usage_based` | `usage-based` |
| `marketplace_commission` | `marketplace` |
| `hybrid` | `hybrid` |
| — | `advertising` |
| — | `enterprise` |

The analysis step's LLM may return `one-time` or `usage-based` (hyphenated) which won't pass the template's validation (expects underscores). Additionally, `advertising` and `enterprise` are in the LLM prompt but not in the template enum.

**Recommendation**: Align both enums. Add normalization in the analysis step to convert LLM output to template-compatible values.

---

#### F-TRUTH-010: Stage 4 Competitor Field Name Mismatch (description vs position)

**Severity**: MEDIUM
**Location**: `lib/eva/stage-templates/stage-04.js:38`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 4 — "name, description, strengths[], weaknesses[]"

**Description**: The spec lists `description` as a competitor field, but the template uses `position` instead. The analysis step also uses `position`. While semantically similar, this is a naming deviation from the spec.

**Recommendation**: Either rename `position` to `description` in the template and analysis step, or update the spec to use `position`.

---

#### F-TRUTH-011: Stage 1 keyAssumptions Not Consumed by Stage 3/5

**Severity**: MEDIUM
**Location**: Cross-stage contract gap
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 1 — "keyAssumptions[] validated at Stage 3/5"

**Description**: The spec states that `keyAssumptions` from Stage 1 should be "validated at Stage 3/5." Neither Stage 3 nor Stage 5 templates or analysis steps reference or validate `keyAssumptions`. The contract is declared but not enforced.

**Impact**: Key venture assumptions pass through the pipeline without validation, reducing the rigor of kill gate decisions.

**Recommendation**: Add keyAssumptions consumption in Stage 3 (as scoring context) and Stage 5 (as assumption documentation).

---

#### F-TRUTH-012: Stage 4 Analysis Step Doesn't Consume Stage 3 competitorEntities

**Severity**: MEDIUM
**Location**: `lib/eva/stage-templates/analysis-steps/stage-04-competitive-landscape.js:68`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 4 — "Consumes Stage 3 competitor entities"

**Description**: The Stage 4 analysis step function signature accepts `stage3Data` but only uses `stage3Data.overallScore` and `stage3Data.competitiveBarrier` for context. It does not use `stage3Data.competitorEntities` as seed data for the competitive landscape analysis. Instead, it asks the LLM to discover competitors from scratch.

**Impact**: Competitor entities identified during Stage 3 validation are discarded. The LLM may identify different competitors, creating discontinuity in the pipeline.

**Recommendation**: Pass `stage3Data.competitorEntities` to the LLM prompt as seed data to ensure continuity.

---

### LOW

#### F-TRUTH-013: Missing Unit Tests for Stages 2, 4, and 5

**Severity**: LOW
**Location**: `tests/unit/eva/stage-templates/`
**Spec Ref**: General quality standard

**Description**: Unit tests exist only for Stage 1 (`stage-01.test.js`) and Stage 3 (`stage-03.test.js`). No tests exist for:
- Stage 2 (Idea Validation) — schema validation, compositeScore computation
- Stage 4 (Competitive Intel) — competitor validation, duplicate detection, stage5Handoff computation
- Stage 5 (Profitability Kill Gate) — banded kill gate logic, unit economics validation, conditional_pass

The Stage 5 kill gate has the most complex banded logic and is the most important to test.

**Recommendation**: Add unit tests for Stages 2, 4, and 5. Stage 5's `evaluateKillGate()` is a pure function and should be straightforward to test with boundary value analysis.

---

#### F-TRUTH-014: Stage 2 compositeScore Is Simple Average (Matches Spec)

**Severity**: LOW (Informational)
**Location**: `lib/eva/stage-templates/stage-02.js:149-160`
**Spec Ref**: Architecture v1.6, Section 8.1, Stage 2 — "compositeScore (number, derived: average of 6 metrics)"

**Description**: Stage 2's `compositeScore` uses a simple average, which matches the spec. However, this means all 6 metric pre-scores contribute equally to the composite, regardless of archetype. This is consistent with Stage 2's role as a pre-flight (not a gate), but differs from Stage 3 where the spec calls for weighted averaging.

**Recommendation**: No action required. Documented for completeness.

---

## Cross-Stage Data Contract Verification

| Contract | Source | Target | Status |
|----------|--------|--------|--------|
| Stage 0 → Stage 1 | synthesis output | description, valueProp, targetMarket, problemStatement | BROKEN (F-TRUTH-001: hydration function missing) |
| Stage 1 → Stage 2 | description, problemStatement, valueProp, targetMarket, archetype | MoA analysis context | PASS |
| Stage 1 → Stage 3 | archetype (scoring weights) | overallScore weighting | FAIL (F-TRUTH-003: no weighting implemented) |
| Stage 1 → Stage 3/5 | keyAssumptions | validation context | FAIL (F-TRUTH-011: not consumed) |
| Stage 2 → Stage 3 | 6 pre-scores via persona critiques | deterministic component of hybrid scoring | PASS |
| Stage 3 → Stage 4 | competitorEntities | competitive landscape seed | FAIL (F-TRUTH-012: not consumed as seed) |
| Stage 4 → Stage 5 | stage5Handoff | financial model inputs | PARTIAL (F-TRUTH-006: schema mismatch between template and analysis step; pipeline works end-to-end via analysis step path) |
| Stage 1 → Stage 23 | successCriteria | launch criteria | NOT AUDITED (Stage 23 is out of scope) |

**Contract Pass Rate**: 2/7 PASS, 1/7 PARTIAL, 3/7 FAIL, 1/7 BROKEN = **29% full compliance**

## Summary of Findings by Severity

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| CRITICAL | 2 | F-TRUTH-001, F-TRUTH-002 |
| HIGH | 5 | F-TRUTH-003, F-TRUTH-004, F-TRUTH-005, F-TRUTH-006, F-TRUTH-007 |
| MEDIUM | 5 | F-TRUTH-008, F-TRUTH-009, F-TRUTH-010, F-TRUTH-011, F-TRUTH-012 |
| LOW | 2 | F-TRUTH-013, F-TRUTH-014 |
| **Total** | **14** | |

## Remediation Priority

1. **F-TRUTH-001** (CRITICAL): Complete `analyzeStage01` function — unblocks Stage 0→1 pipeline
2. **F-TRUTH-002** (CRITICAL): Fix Stage 3 analysis step threshold 40→50 — gate consistency
3. **F-TRUTH-007** (HIGH): Add conditional_pass to Stage 5 analysis step — correct gate behavior
4. **F-TRUTH-004** (HIGH): Cap AI calibration at ±15 in Stage 3 — spec compliance
5. **F-TRUTH-005** (HIGH): Fix Stage 4 minItems 1→3 — spec compliance
6. **F-TRUTH-006** (HIGH): Align Stage 4/5 handoff schema — contract integrity
7. **F-TRUTH-003** (HIGH): Implement archetype-based weighting — spec compliance

## Files Audited

| File | Lines | Purpose |
|------|-------|---------|
| `lib/eva/stage-templates/stage-01.js` | 138 | Stage 1 template |
| `lib/eva/stage-templates/stage-02.js` | 167 | Stage 2 template |
| `lib/eva/stage-templates/stage-03.js` | 203 | Stage 3 template |
| `lib/eva/stage-templates/stage-04.js` | 175 | Stage 4 template |
| `lib/eva/stage-templates/stage-05.js` | 353 | Stage 5 template |
| `lib/eva/stage-templates/analysis-steps/stage-01-hydration.js` | 30 | Stage 1 analysis (INCOMPLETE) |
| `lib/eva/stage-templates/analysis-steps/stage-02-multi-persona.js` | 139 | Stage 2 analysis |
| `lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring.js` | 167 | Stage 3 analysis |
| `lib/eva/stage-templates/analysis-steps/stage-04-competitive-landscape.js` | 154 | Stage 4 analysis |
| `lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js` | 206 | Stage 5 analysis |
| `lib/eva/stage-templates/validation.js` | 107 | Shared validation utilities |
| `tests/unit/eva/stage-templates/stage-01.test.js` | 244 | Stage 1 tests |
| `tests/unit/eva/stage-templates/stage-03.test.js` | 298 | Stage 3 tests |

**Gold Standards Referenced**:
- Architecture v1.6, Section 8.1 (`docs/plans/eva-platform-architecture.md:559-660`)
- Vision v4.7, Section 5 (`docs/plans/eva-venture-lifecycle-vision.md`)
