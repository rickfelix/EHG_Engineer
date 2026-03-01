
## Table of Contents

- [Context](#context)
- [Pipeline Context](#pipeline-context)
- [CLI Stage 5 Implementation (Ground Truth)](#cli-stage-5-implementation-ground-truth)
- [GUI Stage 5 Implementation (Ground Truth)](#gui-stage-5-implementation-ground-truth)
- [Key Differences Summary](#key-differences-summary)
- [Your Task](#your-task)
- [Gap Importance Rubric](#gap-importance-rubric)
- [Output Format](#output-format)
  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. ROI Threshold Recommendation](#2-roi-threshold-recommendation)
  - [3. Unit Economics Decision](#3-unit-economics-decision)
  - [4. Financial Model Generation](#4-financial-model-generation)
  - [5. Kill Behavior Recommendation](#5-kill-behavior-recommendation)
  - [6. Stage 4 -> Stage 5 Pipeline](#6-stage-4---stage-5-pipeline)
  - [7. CLI Superiorities (preserve these)](#7-cli-superiorities-preserve-these)
  - [8. Recommended Stage 5 Schema](#8-recommended-stage-5-schema)
  - [9. Minimum Viable Change](#9-minimum-viable-change)
  - [10. Cross-Stage Impact](#10-cross-stage-impact)

---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 5 "Profitability" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated (may persist as read-only dashboard). We need to identify what the CLI is missing relative to the GUI, what the CLI does better, and what minimum changes would make the CLI self-sufficient.

This is Stage 5 of a 25-stage venture lifecycle -- the SECOND KILL GATE.
- **Stages 1-5**: THE TRUTH (Foundation/Validation)
- **Stages 6-10**: BLUEPRINT (Planning/Design)
- **Stages 11-15**: BUILD (Development)
- **Stages 16-20**: LAUNCH
- **Stages 21-25**: GROWTH

## Pipeline Context

**What comes BEFORE Stage 5** -- Stage 4 (Competitive Intel, information-gathering):
- CLI: Array of competitor cards with name, position, threat (H/M/L), strengths, weaknesses, full SWOT.
- GUI: Active AI agent discovers competitors + manual entry + feature comparison matrix + differentiation scoring.
- **Stage 4 triangulation consensus**: CLI will add `analysisStep` for competitor enrichment, `pricingModel` per competitor, `pricingTiers`, `url`, `confidence`, `competitiveIntensity` (0-100) derived metric, `stage5Handoff` artifact with pricing summary and competitive pressure signals, Blue Ocean handling (`minItems: 0`), and provenance tracking. No feature comparison matrix. No differentiation score (Stage 3's `competitiveBarrier` handles it).

**What Stage 5 does** -- Profitability Kill Gate:
- This IS a kill gate. The second of four (3, 5, 13, 23).
- Its purpose: determine whether the venture is financially viable based on projected profitability.
- It should consume Stage 4's competitive intelligence to ground financial assumptions in reality.
- Devil's Advocate (`devils-advocate.js`) reviews at gate stages, including Stage 5.

**What comes AFTER Stage 5** -- Stage 6 (Business Model Canvas, first Blueprint stage):
- Stage 6 designs the full business model: revenue streams, cost structure, key resources, channels, partnerships.
- Stage 6 needs: validated financial viability (Stage 5 pass), competitive pricing context, market size estimates, unit economics.
- Stage 6 does NOT need: raw financial projections (it builds its own model). But it needs confidence that the venture is financially viable.

## CLI Stage 5 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-05.js` -- Active computation (first stage with real `computeDerived()`)

**Input Schema**: 10 fields:
- `initialInvestment` (number, min: 0.01)
- `year1.revenue`, `year1.cogs`, `year1.opex` (numbers, min: 0)
- `year2.revenue`, `year2.cogs`, `year2.opex` (numbers, min: 0)
- `year3.revenue`, `year3.cogs`, `year3.opex` (numbers, min: 0)

**Derived calculations**:
- `grossProfitY1-3` = revenue - cogs
- `netProfitY1-3` = grossProfit - opex
- `roi3y` = (totalNetProfit - initialInvestment) / initialInvestment
- `breakEvenMonth` = ceil(initialInvestment / (netProfitY1 / 12)), null if Y1 net <= 0

**Kill Gate Logic** (pure function `evaluateKillGate()`):
- Kill if `roi3y < 0.5` (50% threshold)
- Kill if `breakEvenMonth === null` (non-profitable Y1)
- Kill if `breakEvenMonth > 24`
- Produces structured kill reasons with type, message, threshold, actual
- `blockProgression: true` when killed

**Key properties**:
- No `analysisSteps` -- the 10 input numbers must be provided externally
- No unit economics (no CAC, LTV, churn, payback period)
- No scenario analysis -- single projection only
- No AI involvement -- purely mathematical
- No connection to Stage 4 output -- no consumption of competitive pricing
- Strong testable kill gate with exported pure function

**Source files**:
- `lib/eva/stage-templates/stage-05.js` -- Template with kill gate
- `lib/eva/eva-orchestrator.js` -- processStage() flow

## GUI Stage 5 Implementation (Ground Truth)

**Components**: `src/components/stages/Stage5ProfitabilityForecasting.tsx` (v1), `src/components/stages/v2/Stage05ProfitabilityForecasting.tsx` (v2)
**Hook**: `src/hooks/useProfitabilityForecasting.ts`
**Kill Gate**: `src/services/recursionEngine.ts`, `src/components/ventures/Stage5ROIValidator.tsx`
**AI**: Supabase edge function `profitability-forecasting` with local fallback

**Revenue Assumptions** (granular input):
- Pricing model, monthly price, market size, target penetration
- Growth rate (monthly %), churn rate (monthly %), conversion rate

**Cost Structure** (granular input):
- Fixed costs, variable cost per unit, marketing budget
- Development costs, operational costs, CAC

**Computed Metrics**:
- CAC, LTV (price / churn rate), LTV:CAC ratio, payback period, monthly churn
- Projected ROI, gross margin, break-even month
- 36-month projection with S-curve customer adoption

**Profitability Score** (0-100 weighted):
- LTV:CAC ratio (40%): >=3: 40pts, >=2: 30pts, >=1.5: 20pts, else 10pts
- Payback period (30%): <=6mo: 30pts, <=12mo: 25pts, <=18mo: 15pts, else 5pts
- Gross margin (20%): >=80%: 20pts, >=60%: 15pts, >=40%: 10pts, else 5pts
- Break-even timing (10%): 10pts default

**Kill Gate**: ROI >= 15% to pass
- FIN-001 recursion: ROI < 15% → routes back to Stage 3 for re-evaluation
- Auto-executed (no Chairman approval needed)
- 3+ recursions → Chairman escalation (loop prevention)
- Chairman override allowed with justification

**Scenario Analysis**: Optimistic (1.5x rev, 0.85x cost) / Realistic / Pessimistic (0.7x rev, 1.2x cost)

**Validation warnings**: Churn >20%, CAC > pricing × 24 months

**Source files**:
- `EHG/src/components/stages/Stage5ProfitabilityForecasting.tsx`
- `EHG/src/hooks/useProfitabilityForecasting.ts`
- `EHG/src/services/recursionEngine.ts`
- `EHG/src/components/ventures/Stage5ROIValidator.tsx`

## Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Input model | 10 annual aggregates | Granular assumptions (pricing, growth, churn, CAC, market) |
| Projection horizon | 3 years (annual) | 36 months (monthly) |
| Unit economics | None | CAC, LTV, LTV:CAC, payback, churn |
| ROI threshold | 50% (3-year cumulative) | 15% (projected) |
| Break-even threshold | 24 months max | No explicit threshold |
| Scenario analysis | None | 3 scenarios |
| Scoring | Binary pass/kill | Weighted profitability score (0-100) |
| Kill behavior | Hard block | Recursion to Stage 3 |
| Override | None | Chairman override |
| AI | None | Edge function + local fallback |
| Data generation | None (passive input) | AI + S-curve model |

## Your Task

Analyze the gap between CLI and GUI for Stage 5, considering:

1. **ROI threshold discrepancy**: The CLI requires 50% 3-year ROI, the GUI requires only 15%. These are dramatically different thresholds. Which is appropriate for an early-stage venture kill gate? What's the right threshold and formula?

2. **Unit economics gap**: The CLI has no concept of CAC, LTV, churn, or payback period. The GUI uses these as primary health indicators (40% weight on LTV:CAC alone). Does Stage 5 need unit economics, or is the simplified annual model sufficient?

3. **Financial model generation**: The CLI's biggest gap is that it has no `analysisStep` to generate the 10 input numbers. Where should these come from? The Stage 4 consensus says competitive pricing data will be available. Can an LLM build a credible 3-year financial model from venture description + Stage 4 competitive intel?

4. **Scenario analysis**: The GUI projects optimistic/realistic/pessimistic scenarios. Is this necessary for the kill gate, or is a single realistic projection sufficient? Does scenario analysis change the kill decision?

5. **Kill behavior**: The CLI hard-blocks progression. The GUI uses recursion (routes back to Stage 3 for re-evaluation with loop prevention). Which is better for an autonomous pipeline?

6. **Monthly vs annual projections**: The GUI projects monthly for 36 months with S-curve adoption. The CLI uses annual aggregates. What level of granularity does the kill gate actually need?

7. **Stage 4 -> Stage 5 pipeline**: Per Stage 4 consensus, Stage 4 will produce a `stage5Handoff` artifact with pricing summary and competitive pressure. How should Stage 5 consume this to build its financial model?

8. **Profitability score**: The GUI's weighted profitability score (0-100) is interesting but the kill gate is binary (pass/kill). Should Stage 5 produce a composite score alongside the kill decision?

9. **Minimum viable change**: What's the smallest set of changes to make Stage 5 produce a reliable profitability kill gate that consumes Stage 4's competitive intelligence?

## Gap Importance Rubric

**For each gap identified, score its closure importance using this rubric:**

| Score | Label | Criteria |
|-------|-------|----------|
| 5 | **Critical** | Without closing this gap, the stage cannot function or produces incorrect downstream decisions |
| 4 | **High** | Significantly degrades downstream stage quality |
| 3 | **Medium** | Improves quality but the stage can function without it |
| 2 | **Low** | Nice to have; minimal impact on pipeline correctness |
| 1 | **Cosmetic** | UX or presentation concern with no analytical impact |

**For each gap, also challenge**: Does this gap truly need to be closed, or does the CLI's existing infrastructure (kill gate logic, Devil's Advocate, Decision Filter Engine) already address it differently?

## Output Format

Please structure your response as:

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact (Stage 6 & Blueprint Phase) | Verdict (CLOSE / ADAPT / ELIMINATE) | Challenge |

### 2. ROI Threshold Recommendation
- Which threshold is correct and why
- Formula recommendation

### 3. Unit Economics Decision
- Whether CLI needs CAC/LTV/churn
- What level of unit economics serves the kill gate

### 4. Financial Model Generation
- How CLI should generate the 10 input numbers
- How to consume Stage 4 competitive intel

### 5. Kill Behavior Recommendation
- Hard block vs recursion
- Override mechanism

### 6. Stage 4 -> Stage 5 Pipeline
- How to consume Stage 4's `stage5Handoff` artifact
- What additional data Stage 5 needs

### 7. CLI Superiorities (preserve these)
- List with brief justification

### 8. Recommended Stage 5 Schema
- The ideal Stage 5 schema for a CLI-native workflow

### 9. Minimum Viable Change
- Specific, actionable changes ranked by priority

### 10. Cross-Stage Impact
- How these changes affect Stage 6 (Business Model Canvas) and the broader Blueprint phase
