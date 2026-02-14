# EVA Audit: Phase 3 — THE IDENTITY (Stages 10-12)

**SD**: `SD-EVA-QA-AUDIT-IDENTITY-001`
**Parent**: `SD-EVA-QA-AUDIT-ORCH-001`
**Auditor**: Claude Opus 4.6
**Date**: 2026-02-14
**Gold Standard**: Architecture v1.6 Section 8.3 + Vision v4.7

---

## Executive Summary

Phase 3 (THE IDENTITY) contains 6 files across 3 stages (10-12) plus a Reality Gate. The audit identified **10 Critical**, **4 High**, **2 Medium**, and **0 Low** severity gaps between the gold standard specification and the current implementation.

**Primary systemic finding**: Same pattern as Phase 5 — analysis steps produce all spec-required NEW v2.0 fields but **templates do not validate or persist them**. Additionally, the Stage 12 Reality Gate ignores economy validation, and there is a dual-gate coordination problem between `stage-12.js` and `reality-gates.js`.

| Severity | Count | Description |
|----------|-------|-------------|
| Critical | 10 | Missing template validation for spec-required fields |
| High | 4 | Reality Gate incomplete, field naming, structural mismatches |
| Medium | 2 | Enum validation gaps, dual-gate coordination |
| Low | 0 | Core arrays and counts are well-enforced |

**Overall Compliance Score**: ~60% against Architecture v1.6 Section 8.3 target schema.

---

## Files Audited

### Stage Templates (3 files)
| File | Stage | Version |
|------|-------|---------|
| `lib/eva/stage-templates/stage-10.js` | Naming / Brand | v2.0.0 |
| `lib/eva/stage-templates/stage-11.js` | Go-to-Market | v2.0.0 |
| `lib/eva/stage-templates/stage-12.js` | Pipeline Viability | v2.0.0 |

### Analysis Steps (3 files)
| File | Stage |
|------|-------|
| `lib/eva/stage-templates/analysis-steps/stage-10-naming-brand.js` | 10 |
| `lib/eva/stage-templates/analysis-steps/stage-11-gtm.js` | 11 |
| `lib/eva/stage-templates/analysis-steps/stage-12-sales-logic.js` | 12 |

### Supporting Files
| File | Purpose |
|------|---------|
| `lib/eva/stage-templates/validation.js` | Shared validation utilities |
| `lib/eva/reality-gates.js` | System-level phase boundary gates |

---

## Stage-by-Stage Gap Analysis

### Stage 10: Naming / Brand

**Spec**: `brandGenome` object, `scoringCriteria[]` (weights sum to 100), `candidates[]` (minItems: 5), plus NEW: `narrativeExtension`, `namingStrategy` enum, `decision` object.

| ID | Severity | Spec Requirement | Code Reality |
|----|----------|-----------------|--------------|
| G10-1 | **CRITICAL** | `narrativeExtension` object (vision, mission, brandVoice) | Analysis step produces it (lines 182-187); **template does not validate**. Not persisted to DB. |
| G10-2 | **CRITICAL** | `namingStrategy` enum (`descriptive\|abstract\|acronym\|founder\|metaphorical`) | Analysis step produces with enum validation (lines 189-192); **template does not validate**. |
| G10-3 | **CRITICAL** | `decision` object (selectedName, workingTitle, rationale, availabilityChecks) | Analysis step produces full object with availability check enums (lines 194-216); **template does not validate**. |

**Working correctly**: `brandGenome` validation, `scoringCriteria` weight sum enforcement, `candidates[]` minItems:5, score validation (0-100 integers per criterion).

**Cross-stage contracts**: Analysis step correctly consumes Stages 1, 3, 5, 8 context.

---

### Stage 11: Go-to-Market

**Spec**: `customerTiers[]` (exactly 3) with NEW `persona` and `painPoints[]`, `channels[]` (exactly 8) with NEW `channelType` enum and `primaryTier`, `targetCac` (renamed from `expectedCac`).

| ID | Severity | Spec Requirement | Code Reality |
|----|----------|-----------------|--------------|
| G11-1 | **CRITICAL** | `tiers[].persona` (ICP definition) | Analysis step produces (line 119); **template does not validate**. |
| G11-2 | **CRITICAL** | `tiers[].painPoints[]` (pain point mapping) | Analysis step produces (lines 120-122); **template does not validate**. |
| G11-3 | **CRITICAL** | `channels[].channelType` enum (`paid\|organic\|earned\|owned`) | Analysis step produces with enum validation (line 150); **template does not validate**. |
| G11-4 | **CRITICAL** | `channels[].primaryTier` (tier-channel mapping) | Analysis step produces (lines 142-144); **template does not validate**. |
| G11-5 | **HIGH** | `targetCac` (renamed from `expectedCac`) | Template uses `expected_cac` (old name). Spec v1.6 explicitly renamed to `targetCac`. |

**Working correctly**: `tiers[]` exactItems:3 enforcement, `channels[]` exactItems:8 enforcement, budget validation, launch_timeline.

---

### Stage 12: Pipeline Viability — REALITY GATE

**Spec**: `deals[]` (minItems: 3) with `mappedFunnelStage`, `funnel` with `conversionRateEstimate` per stage, Economy Check in gate logic. Reality Gate: Phase 3 completeness + economy check.

| ID | Severity | Spec Requirement | Code Reality |
|----|----------|-----------------|--------------|
| G12-1 | **CRITICAL** | `deals[]` array (minItems: 3) | Code uses `deal_stages[]` instead. Different naming — unclear if same concept. |
| G12-2 | **CRITICAL** | `deal_stages[].mappedFunnelStage` | Analysis step produces (line 138); **template does not validate**. |
| G12-3 | **CRITICAL** | `funnel_stages[].conversionRateEstimate` | Analysis step produces (lines 158-160); **template does not validate**. |
| G12-4 | **HIGH** | Economy Check in Reality Gate | `economyCheck` object produced by analysis step but **Reality Gate does not validate it**. Gate only checks artifact counts. |
| G12-5 | **HIGH** | `funnel` object structure | Spec suggests single `funnel` object. Code has `funnel_stages[]` array. Structural mismatch. |
| G12-6 | **HIGH** | Dual-gate coordination | `stage-12.js` has local Reality Gate (data-based, checks array lengths). `reality-gates.js` has system gate for boundary `12->13` (artifact-based, checks venture_artifacts table). Two gates checking different things with no integration. |

**Working correctly**: `sales_model` enum validation (6 values), `deal_stages` minItems:3, `funnel_stages` minItems:4, `customer_journey` minItems:5.

**Reality Gate Logic (stage-12.js lines 159-229)**:
- Stage 10: `candidates.length >= 5` AND scored
- Stage 11: `tiers.length === 3` AND `channels.length === 8`
- Stage 12: `funnel_stages.length >= 4` AND `customer_journey.length >= 5`
- **Missing**: No economy check (totalPipelineValue, avgConversionRate, pricingAvailable)

---

## Cross-Cutting Findings

### Finding 1: Template-Analysis Step Divergence (Systemic — CRITICAL)

Same pattern as Phase 5 (Build Loop): All v2.0 NEW fields are produced by analysis steps but not validated by templates. The analysis steps appear to have been updated for Architecture v1.6 compliance, but the templates were not.

**Affected fields (10 total)**:
- Stage 10: `narrativeExtension`, `namingStrategy`, `decision`
- Stage 11: `tiers[].persona`, `tiers[].painPoints[]`, `channels[].channelType`, `channels[].primaryTier`
- Stage 12: `deal_stages[].mappedFunnelStage`, `funnel_stages[].conversionRateEstimate`, `economyCheck`

### Finding 2: Dual Reality Gate Problem (HIGH)

Stage 12 has two separate gates that don't coordinate:
1. **Local gate** (`stage-12.js` lines 159-229): Data-based, checks in-memory stage data
2. **System gate** (`reality-gates.js` boundary `12->13`): Artifact-based, queries `venture_artifacts` table

The system gate checks for `business_model_canvas`, `technical_architecture`, `project_plan` — artifacts that belong to Phase 4 (Blueprint), not Phase 3 (Identity). This suggests the reality-gates.js boundaries may need updating.

### Finding 3: Field Naming Drift (HIGH)

- `expectedCac` → `targetCac` (spec renamed it; code still uses `expected_cac`)
- `deals[]` → `deal_stages[]` (spec vs code, potentially same concept)
- camelCase (spec/analysis) vs snake_case (templates)

### Finding 4: Existing Validators Underutilized (MEDIUM)

`validation.js` exports `validateEnum()` which could enforce all spec-required enums, but templates don't use it for the NEW v2.0 enum fields.

---

## Remediation Priority

### P0 — Must Fix

1. **Add 10 missing fields to template schemas** (all 3 stages)
   - Use existing `validateEnum()` for enum fields
   - Persist analysis step output to stageData

2. **Add economy check to Reality Gate** (Stage 12)
   - Validate `economyCheck.totalPipelineValue`, `avgConversionRate`
   - Cross-reference with Stage 5 financial projections

### P1 — Should Fix

3. **Resolve dual-gate coordination** (Stage 12)
   - Either: integrate local gate into reality-gates.js
   - Or: ensure orchestrator calls both gates

4. **Rename `expected_cac` → `targetCac`** (Stage 11)

5. **Clarify `deals[]` vs `deal_stages[]`** (Stage 12)

### P2 — Nice to Have

6. Add enum validation to templates using existing `validateEnum()`
7. Normalize field naming to camelCase

---

## Appendix: Data Flow Map

```
Stages 1-9 (Truth + Engine)
    ↓
Stage 10: Naming / Brand
    ├─ brandGenome + candidates[] + (narrativeExtension, namingStrategy, decision)
    ↓
Stage 11: Go-to-Market
    ├─ tiers[3] + channels[8] + launch_timeline + (persona, painPoints, channelType, primaryTier)
    ↓
Stage 12: Pipeline Viability — REALITY GATE
    ├─ deal_stages[] + funnel_stages[] + customer_journey[] + (mappedFunnelStage, conversionRateEstimate, economyCheck)
    └─ Reality Gate: Phase 3 completeness (counts OK, economy NOT checked)
         ↓
Stages 13-16 (Blueprint)
```

---

## Appendix: Comparison with Phase 5 Findings

The same systemic pattern was found in Phase 5 (Build Loop, SD-EVA-QA-AUDIT-BUILDLOOP-001):

| Pattern | Phase 3 (Identity) | Phase 5 (Build Loop) |
|---------|-------------------|---------------------|
| Analysis produces, template ignores | 10 fields | 5 decision objects + 8 fields |
| Enum validation gap | 3 enums | 8 free-text fields |
| Field naming mismatch | 2 fields | 5 fields |
| Gate checking incomplete | Economy check missing | Promotion gate uses stale booleans |

This confirms the template-analysis divergence is a **codebase-wide pattern**, not isolated to specific phases.

---

*Report generated: 2026-02-14*
*Auditor: Claude Opus 4.6*
*SD: SD-EVA-QA-AUDIT-IDENTITY-001*
