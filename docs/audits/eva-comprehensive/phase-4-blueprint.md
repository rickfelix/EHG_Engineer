# EVA Comprehensive Audit: Phase 4 - THE BLUEPRINT (Stages 13-16)

**Audit SD**: `SD-EVA-QA-AUDIT-BLUEPRINT-001`
**Auditor**: Claude Opus 4.6
**Date**: 2026-02-14
**Gold Standard**: Architecture v1.6 Section 8.4 (Stages 13-16)
**Scope**: 4 stage templates + 4 analysis steps = 8 files

## Executive Summary

Phase 4 ("The Blueprint") covers Stages 13-16: Product Roadmap, Technical Architecture, Risk Register, and Financial Projections. The audit found **27 findings** across all four stages, including **1 critical scope mismatch** (Stage 15 implements Resource Planning instead of Risk Register), **9 high-severity schema gaps**, and multiple missing v2.0 spec features. The most systemic issue is that v2.0 schema enrichments (typed enums, structured objects, measurable outcomes) were not implemented in any stage.

### Finding Severity Distribution

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH | 9 |
| MEDIUM | 12 |
| LOW | 4 |
| **Total** | **27** |

---

## Files Audited

| File | Path |
|------|------|
| Stage 13 Template | `lib/eva/stage-templates/stage-13.js` |
| Stage 13 Analysis | `lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js` |
| Stage 14 Template | `lib/eva/stage-templates/stage-14.js` |
| Stage 14 Analysis | `lib/eva/stage-templates/analysis-steps/stage-14-technical-architecture.js` |
| Stage 15 Template | `lib/eva/stage-templates/stage-15.js` |
| Stage 15 Analysis | `lib/eva/stage-templates/analysis-steps/stage-15-resource-planning.js` |
| Stage 16 Template | `lib/eva/stage-templates/stage-16.js` |
| Stage 16 Analysis | `lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js` |

---

## Stage 13: Product Roadmap (KILL GATE)

### Gap Table

| # | Finding Type | Spec Field/Feature | Actual | Severity | Notes |
|---|-------------|-------------------|--------|----------|-------|
| 1 | SCHEMA_MISMATCH | `milestones[].title` | `milestones[].name` | MEDIUM | Spec says `title`, code uses `name`. Functionally equivalent but naming differs. |
| 2 | SCHEMA_MISMATCH | `milestones[].description` | Missing | HIGH | Spec requires milestone `description` field. Not in schema or analysis step. |
| 3 | SCHEMA_MISMATCH | `milestones[].targetDate` | `milestones[].date` | MEDIUM | Spec says `targetDate`, code uses `date`. Naming mismatch. |
| 4 | MISSING_FEATURE | `milestones[].priority` (enum: now\|next\|later) | Missing from template schema | HIGH | Spec requires `priority` enum on milestones. Analysis step generates it, but template schema does NOT define or validate it. Kill gate does not check for "now" priority. |
| 5 | MISSING_FEATURE | `milestones[].deliverables[].type` (enum: feature\|infrastructure\|integration\|documentation) | Missing | HIGH | Spec requires typed deliverables with `name`, `description`, `type`. Actual deliverables are plain strings. |
| 6 | MISSING_FEATURE | `milestones[].deliverables[].name` + `description` (object) | Plain strings | HIGH | Deliverables should be objects with `name`+`description`+`type`, not flat strings. |
| 7 | MISSING_FEATURE | `milestones[].outcomes[]` (measurable success criteria) | Missing | HIGH | Spec requires `outcomes[]` array of strings per milestone. Not present in template or analysis. |
| 8 | GATE_LOGIC_GAP | Kill gate: "at least one 'now' milestone with deliverables" | Kill gate checks: milestone count >= 3, all have deliverables, timeline >= 3mo | HIGH | Spec kill gate specifically requires a "now"-priority milestone. Actual gate ignores priority entirely. |
| 9 | SCHEMA_MISMATCH | `milestones[].dependencies[]` = milestone references | `milestones[].dependencies[]` = free-text strings | LOW | Spec says dependencies reference other milestones. Actual is untyped string array. |
| 10 | CONSTANT_DRIFT | `minItems: 1` (spec) for milestones | `MIN_MILESTONES = 3` in template | MEDIUM | Spec says `minItems: 1` but kill gate requires "at least one now milestone". Template requires 3 minimum. Template is stricter than spec. |
| 11 | CONTRACT_MISSING | Contracts: "Stages 1-12 -> full venture context" | Analysis step consumes Stages 1, 5, 8, 9 only | MEDIUM | Spec says Stage 13 receives "full venture context" from Stages 1-12. Analysis only pulls 4 stages. Stages 2-4, 6-7, 10-12 not consumed. |

### Stage 13 Constant Consistency

| Constant | Template (stage-13.js) | Analysis (stage-13-product-roadmap.js) | Match? |
|----------|----------------------|--------------------------------------|--------|
| `MIN_MILESTONES` | 3 | 3 | Yes |
| `VALID_PRIORITIES` | Not defined | `['now', 'next', 'later']` | N/A (missing from template) |

---

## Stage 14: Technical Architecture

### Gap Table

| # | Finding Type | Spec Field/Feature | Actual | Severity | Notes |
|---|-------------|-------------------|--------|----------|-------|
| 12 | SCHEMA_MISMATCH | `layers[]` (array with 5 named layers: presentation, api, business_logic, data, infrastructure) | `layers` (object with 4 keys: frontend, backend, data, infra) | HIGH | Spec defines 5 layers with specific names. Actual has 4 layers with different names. Missing `presentation` (have `frontend`), `api` (have none), `business_logic` (have `backend` which conflates), `infrastructure` shortened to `infra`. |
| 13 | MISSING_FEATURE | `additionalLayers[]` (optional) | Missing | MEDIUM | Spec allows additional custom layers. Not in schema. |
| 14 | SCHEMA_MISMATCH | `constraints[].category` (enum: performance\|security\|scalability\|compliance\|budget\|timeline) | `constraints[]` has `name` + `description` only | MEDIUM | Spec requires typed `category` enum. Actual has free-text `name`. |
| 15 | MISSING_FEATURE | `security` object (authStrategy, dataClassification, complianceRequirements[]) | Missing | HIGH | Entire `security` object absent from schema and analysis step. |
| 16 | MISSING_FEATURE | `dataEntities[]` (name, description, relationships[], estimatedVolume) | Missing | HIGH | Data entity modeling not implemented at all. |
| 17 | CONTRACT_MISSING | "Consumes Stage 13 deliverables + Stage 6 risks" | Consumes Stage 1 + Stage 13 (milestones only) | MEDIUM | Stage 6 risk data not consumed. Stage 13 deliverable types not consumed (since they don't exist). |
| 18 | PROMPT_QUALITY | LLM prompt should request `security`, `dataEntities`, `additionalLayers` | Prompt requests only layers, integration_points, constraints | MEDIUM | Analysis step prompt does not ask for security, data entities, or additional layers. |

### Stage 14 Constant Consistency

| Constant | Template (stage-14.js) | Analysis (stage-14-technical-architecture.js) | Match? |
|----------|----------------------|----------------------------------------------|--------|
| `REQUIRED_LAYERS` | `['frontend', 'backend', 'data', 'infra']` | `['frontend', 'backend', 'data', 'infra']` | Yes (but both wrong vs spec) |
| `MIN_INTEGRATION_POINTS` | 1 | Not defined (hardcoded fallback) | Partial |

---

## Stage 15: Risk Register (CRITICAL SCOPE MISMATCH)

### Gap Table

| # | Finding Type | Spec Field/Feature | Actual | Severity | Notes |
|---|-------------|-------------------|--------|----------|-------|
| 19 | SCOPE_MISMATCH | **Stage 15 = Risk Register** | **Stage 15 = Resource Planning** | CRITICAL | Spec defines Stage 15 as "Risk Register" with risks[], severity, mitigationPlan, contingencyPlan. Actual implements "Resource Planning" with team_members[], skill_gaps[], hiring_plan[]. This is a completely different stage. |
| 20 | MISSING_FEATURE | `risks[]` (title, description, owner, severity, priority, phaseRef, mitigationPlan, contingencyPlan) | Not implemented | CRITICAL | Entire risk register schema absent. Replaced by resource planning. |
| 21 | MISSING_FEATURE | `budgetCoherence` (derived, validates risk costs vs Stage 16 financials) | Not implemented | HIGH | Cross-stage derived validation absent. |
| 22 | CONTRACT_MISSING | "Stages 6, 13-14 -> risk context" | Consumes Stages 1, 13, 14 for resource planning | MEDIUM | Contracts are for different data flow entirely. Stage 6 not consumed. |
| 23 | CONTRACT_MISSING | "-> Stage 16, Stage 17" (risk data feeds financials and sprint planning) | Feeds Stage 16 with team cost data instead of risk data | MEDIUM | Downstream contracts broken; Stage 16 receives team costs rather than risk assessments. |

### Note on Scope Mismatch

The Architecture v1.6 Section 8.4 explicitly defines Stage 15 as "Risk Register" with risk-focused schema. The implementation instead builds a "Resource Planning" stage covering team composition and hiring. This is the single most significant finding in this audit. Resource Planning may belong at a different stage number, or the spec may have been updated after initial implementation. Either way, the implementation and spec are fundamentally misaligned.

---

## Stage 16: Financial Projections (PROMOTION GATE)

### Gap Table

| # | Finding Type | Spec Field/Feature | Actual | Severity | Notes |
|---|-------------|-------------------|--------|----------|-------|
| 24 | SCHEMA_MISMATCH | `phases[]` (one per roadmap phase: phaseName, duration, costs{personnel/infra/marketing/other}, revenue per pricing model) | `revenue_projections[]` (month, revenue, costs as flat number) | HIGH | Spec wants phase-aligned financial projections with structured cost breakdown. Actual uses flat monthly projections with a single `costs` number. |
| 25 | MISSING_FEATURE | `pnl` object (Revenue, COGS, Gross Margin, OpEx, EBITDA, Net Income) | Missing | MEDIUM | No P&L statement structure. Only aggregate totals computed. |
| 26 | MISSING_FEATURE | `cashBalanceEnd` (derived running cash position) | Missing | MEDIUM | No running cash balance tracking. Only runway_months computed. |
| 27 | MISSING_FEATURE | `viabilityWarnings[]` (cash < 3mo runway, burn exceeds plan, margins below Stage 5) | Missing | MEDIUM | No automated viability warning system. Promotion gate checks are simpler (capital > 0, projections exist). |

### Promotion Gate Logic Comparison

| Spec Requirement | Actual Check | Gap? |
|-----------------|-------------|------|
| Positive cash trajectory | `initial_capital > 0` | YES - checks static capital, not trajectory |
| Manageable burn | `revenue_projections.length >= 6` | YES - checks projection count, not burn manageability |
| Margins aligned with Stage 5 | Not checked | YES - no Stage 5 margin comparison |
| Stage 13 milestones | `milestones.length >= 3 && decision !== 'kill'` | Partial - checks count and kill gate, but not "now" priority |
| Stage 14 layers | `all 4 layers defined` | Partial - checks 4 layers but spec requires 5 |
| Stage 15 resources | `team_members >= 2, roles >= 2` | N/A - checks resource plan (wrong stage scope) |

### Stage 16 Constant Consistency

| Constant | Template (stage-16.js) | Analysis (stage-16-financial-projections.js) | Match? |
|----------|----------------------|----------------------------------------------|--------|
| `MIN_PROJECTION_MONTHS` | 6 | 6 | Yes |

---

## Cross-Stage Findings

### 1. Data Flow / Contract Analysis

```
Spec Contract Chain:
  Stage 13 (roadmap) -> Stage 14 (architecture) -> Stage 15 (risk register) -> Stage 16 (financials)

Actual Data Flow:
  Stage 13 (roadmap) -> Stage 14 (architecture) -> Stage 15 (RESOURCE PLANNING) -> Stage 16 (financials)
                                                     ^^ WRONG STAGE ^^
```

The Stage 15 scope mismatch breaks the entire downstream contract chain. Stage 16's promotion gate validates against Resource Planning data instead of Risk Register data.

### 2. Shared Constant Consistency

| Constant | Defined In | Used In | Consistent? |
|----------|-----------|---------|-------------|
| `MIN_MILESTONES` | stage-13.js (3), analysis (3) | stage-16.js (imported) | Yes |
| `REQUIRED_LAYERS` | stage-14.js (4 layers), analysis (4 layers) | stage-16.js (imported) | Yes (but wrong vs spec) |
| `MIN_TEAM_MEMBERS` | stage-15.js (2), analysis (2) | stage-16.js (imported) | Yes |
| `MIN_ROLES` | stage-15.js (2), analysis (2) | stage-16.js (imported) | Yes |
| `MIN_PROJECTION_MONTHS` | stage-16.js (6), analysis (6) | - | Yes |

All constants are consistent between template and analysis step pairs. The cross-file imports in stage-16.js correctly reference the source constants. However, the `REQUIRED_LAYERS` value is consistently wrong vs. spec (4 layers instead of 5, wrong names).

### 3. parseJSON() Duplication

All 4 analysis steps contain an identical `parseJSON()` helper function. This matches the "parseJSON duplicated 25 times" finding in the README preliminary findings.

### 4. Naming Convention Drift (Template vs Analysis Step)

| Concept | Template Field Name | Analysis Return Key | Match? |
|---------|-------------------|-------------------|--------|
| Milestone count | `milestone_count` | `totalMilestones` | NO |
| Layer count | `layer_count` | `layerCount` | NO (casing) |
| Total components | `total_components` | `totalComponents` | NO (casing) |
| All layers defined | `all_layers_defined` | `allLayersDefined` | NO (casing) |
| Total headcount | `total_headcount` | `totalHeadcount` | NO (casing) |
| Monthly cost | `total_monthly_cost` | `totalMonthlyCost` | NO (casing) |
| Unique roles | `unique_roles` | `uniqueRoles` | NO (casing) |
| Avg allocation | `avg_allocation` | `avgAllocation` | NO (casing) |
| Projected revenue | `total_projected_revenue` | `totalProjectedRevenue` | NO (casing) |
| Projected costs | `total_projected_costs` | `totalProjectedCosts` | NO (casing) |

Templates use `snake_case` for derived fields; analysis steps return `camelCase`. This means the analysis step output does NOT directly populate the template's derived fields. There must be a mapping layer, or the derived fields are recomputed via `computeDerived()` and the analysis return keys are ignored.

---

## Remediation Priority

### P0 - CRITICAL (Must fix before Phase 4 is spec-compliant)

1. **Stage 15 Scope**: Implement Risk Register (risks[], severity, mitigationPlan, contingencyPlan, budgetCoherence). Decide whether Resource Planning moves to a different stage or is absorbed into existing stages.
2. **Stage 13 Kill Gate**: Add "at least one now-priority milestone" check. Add `priority` field to template schema.

### P1 - HIGH (Significant spec divergence)

3. **Stage 13 Schema**: Add `description`, `outcomes[]` to milestones. Convert `deliverables` from string[] to object[] with `name`, `description`, `type` enum.
4. **Stage 14 Layers**: Expand from 4 to 5 layers (presentation, api, business_logic, data, infrastructure). Add `security` object and `dataEntities[]`.
5. **Stage 14 Constraints**: Add `category` enum to constraints.
6. **Stage 16 Schema**: Restructure from flat monthly projections to phase-aligned projections with structured cost breakdown. Add `pnl` object.
7. **Stage 16 Promotion Gate**: Add positive cash trajectory check, burn manageability check, and Stage 5 margin alignment check.

### P2 - MEDIUM (Spec enrichments and contract gaps)

8. Fix naming mismatches (title/name, targetDate/date) for spec alignment.
9. Add `additionalLayers[]` to Stage 14.
10. Add `viabilityWarnings[]` and `cashBalanceEnd` to Stage 16.
11. Expand Stage 13 analysis to consume all Stages 1-12 per contract.
12. Fix snake_case/camelCase drift between templates and analysis steps.
13. Add `pnl` (P&L statement) structure to Stage 16.

### P3 - LOW (Cosmetic / minor)

14. Standardize milestone dependency references to use milestone IDs.
15. Extract `parseJSON()` to shared utility.

---

## Database Insert Status

The `eva_audit_findings` table does not exist in the database. Findings are recorded in this markdown document only. When the table is created (likely by the INFRA or DBSCHEMA audit child), findings should be inserted with the following structure per finding:

- `audit_sd_key`: `SD-EVA-QA-AUDIT-BLUEPRINT-001`
- `stage_number`: 13-16
- `finding_type`: One of SCHEMA_MISMATCH, NAMING_MISMATCH, GATE_LOGIC_GAP, MISSING_FEATURE, SCOPE_MISMATCH, PROMPT_QUALITY, CONSTANT_DRIFT, CONTRACT_MISSING
- `severity`: CRITICAL, HIGH, MEDIUM, LOW
- `spec_field`: The field/feature from gold standard
- `actual_field`: What exists in code (or "Missing")
- `description`: Detailed finding description
- `remediation`: Suggested fix

---

## Appendix: File Line References

| Finding # | File | Lines |
|-----------|------|-------|
| 1-3 | stage-13.js | 29-36 (schema), 82-88 (validate) |
| 4 | stage-13.js | schema (missing), analysis step L14, L110 |
| 5-6 | stage-13.js | L35, analysis L106-108 |
| 7 | stage-13.js / analysis | Not present |
| 8 | stage-13.js | L162-201 (evaluateKillGate) |
| 10 | stage-13.js | L18 vs spec |
| 11 | analysis step 13 | L60 (function signature) |
| 12 | stage-14.js | L15 (REQUIRED_LAYERS) |
| 14 | stage-14.js | L46-49 (constraints schema) |
| 15-16 | stage-14.js | Not present in schema |
| 19-20 | stage-15.js | Entire file (wrong scope) |
| 24 | stage-16.js | L34-42 (revenue_projections schema) |
| 25-27 | stage-16.js | Not present in schema |
