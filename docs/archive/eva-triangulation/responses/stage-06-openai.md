---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 6 "Risk Matrix" -- OpenAI Response

> Independent response to the Stage 6 triangulation prompt.
> Respondent: GPT 5.3 (OpenAI)
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Risk auto-generation | Manual entry + sample starter risks | Manual entry only | **5** | Weak or sparse risk sets will degrade Stage 7 pricing posture and Stage 9 reality checks | **CLOSE** | "Manual is enough" only works for expert operators; autonomous CLI needs deterministic bootstrapping |
| Aggregate risk signal | Overall card + category counts | None | **4** | Later stages cannot consume a compact risk posture signal | **CLOSE** | Could be computed downstream, but centralizing in Stage 6 avoids repeated logic |
| Stage 5 seeding linkage | Implicit/none | None | **5** | Misses obvious financial/operational risks already surfaced in Stage 5 | **CLOSE** | If done naively, can duplicate risks; needs dedupe + confidence tags |
| Scoring standardization for autonomous runs | Simpler 2-factor UI scoring | 3-factor numeric | **4** | Inconsistent LLM scoring can create noisy risk ranking | **ADAPT** | Don't drop to GUI model; fix consistency with rubric + calibration |
| Category model mismatch | 4 categories | 6 categories | **3** | Mapping friction across tools, but richer taxonomy helps actionability | **ADAPT** | More categories can cause thin distribution if minimum risk count is low |
| Residual risk modeling | Not present | Present | **2** | Limited immediate impact in pre-build phase; useful for mitigation planning | **ADAPT** | Keep optional; forcing it early may create fake precision |
| Risk lifecycle fields (owner/status/review date) | Minimal | Strong governance fields | **2** | Not required for scoring, but improves execution readiness later | **ELIMINATE (as gap)** | This is a CLI strength, not a missing feature |
| Risk "name" field | Present | Missing | **2** | Affects readability/searchability more than analytics correctness | **CLOSE** | Could derive from description, but explicit `name` improves artifact usability |
| Artifact versioning | Present | Not explicit in Stage schema | **3** | Harder audit/iteration trail across stage reruns | **ADAPT** | If platform-level artifact versioning already exists, stage schema needn't duplicate it |
| Stage 9 threshold quality guard | Implicit manual quality | Quantity check (>=10) | **4** | Quantity alone can be gamed; low-quality risks can pass gate | **ADAPT** | Keep floor, add quality constraints instead of only raising count |

### 2. Risk Generation Recommendation

- Add a Stage 6 `analysisStep` that **generates a draft risk register**, not final truth.
- Pipeline inputs:
  - Venture description and core assumptions (Stages 1-2 context)
  - Stage 3 viability output (market/signal risks)
  - Stage 4 proposal/strategy output (execution and positioning risks)
  - Stage 5 financial output (unit economics and profitability risks)
- Generation pattern:
  - Seed baseline risks per category (minimum one each for 6 categories)
  - Add threshold-triggered risks (from Stage 5 metrics)
  - Return `source` and `confidence` per risk (`seeded`, `inferred`, `manual`)
- Keep manual edits allowed; final stage artifact should include both `generated` and `operator_adjusted` provenance.

### 3. Scoring Model Decision

- Keep CLI's **3-factor model** (`severity * probability * impact`) because it separates frequency from consequence and gives better mitigation prioritization.
- For autonomous consistency, add a strict scoring rubric:
  - `severity` = business damage magnitude if realized
  - `probability` = likelihood over planning horizon
  - `impact` = operational blast radius across functions/customers
- Enforce normalization:
  - LLM first outputs qualitative labels, then deterministic mapping to 1-5
  - Add calibration rules by category (e.g., legal risk probability cannot be 5 without specific trigger evidence)
- Store both:
  - `raw_llm_rationale`
  - `normalized_score_inputs`
  This makes score drift debuggable.

### 4. Aggregate Metrics Recommendation

Stage 6 should emit compact downstream signals:

- `overall_risk_index` (normalized 0-100 from weighted risk scores)
- `high_risk_count` (e.g., score >= threshold)
- `category_distribution` (counts + weighted share by category)
- `top_risks` (top 3-5 by score)
- `mitigation_coverage_ratio` (open risks with concrete mitigation + owner + review date)
- `residual_exposure_index` (if residual fields available)

These are lightweight, deterministic, and directly consumable by Stage 7/9.

### 5. Stage 5 -> Stage 6 Pipeline

Use Stage 5 metrics as automatic risk detectors with simple rule triggers:

- `churn > 10%` -> seed "retention/churn risk"
- `gross_margin < 40%` -> seed "margin compression risk"
- `LTV:CAC < 3` -> seed "unit economics fragility risk"
- `payback_months > threshold` -> seed "cash cycle risk"
- large pessimistic/optimistic spread -> seed "forecast volatility risk"

**Implementation behavior**:
- Create seeded risks with `source_ref: stage5.metric_name`
- Mark as `status: open` and assign initial owner by category defaults
- Deduplicate against existing manual risks via semantic similarity + category match
- Never hard fail Stage 6 on seeding; seeding is augmentation, not a gate

### 6. CLI Superiorities (preserve these)

- **Residual risk support**: valuable for "after mitigation" planning maturity.
- **Lifecycle governance fields** (`owner`, `status`, `review_date`): enables operational follow-through.
- **Expanded categories (6)**: captures product + legal/compliance blind spots the GUI misses.
- **Structured validation**: tighter schema improves automation safety and data quality.
- **No UI coupling**: better for deterministic, scriptable pipeline orchestration.

### 7. Recommended Stage 6 Schema

Use this CLI-native shape (key additions marked):

- `risks[]`
  - `id` (required)
  - `name` (**new**, required)
  - `category` (6-category enum, required)
  - `description` (required)
  - `severity`, `probability`, `impact` (1-5, required)
  - `score` (derived)
  - `mitigation` (required)
  - `owner`, `status`, `review_date` (required)
  - `residual_severity`, `residual_probability`, `residual_impact`, `residual_score` (optional)
  - `source` (**new**: `seeded|inferred|manual`)
  - `source_ref` (**new**, optional: stage/metric pointer)
  - `confidence` (**new**, 0-1 or low/med/high)
  - `rationale` (**new**, short explanation)
- `summary` (**new**)
  - `overall_risk_index`
  - `high_risk_count`
  - `category_distribution`
  - `top_risks[]`
  - `mitigation_coverage_ratio`

### 8. Minimum Viable Change

1. **Add `analysisStep` risk seeding** from venture + Stages 1-5 context.
2. **Add aggregate summary outputs** (`overall_risk_index`, `high_risk_count`, `top_risks`, distribution).
3. **Add `name`, `source`, `source_ref`, `confidence` fields** to each risk.
4. **Add deterministic scoring rubric + normalization rules** to stabilize LLM output.
5. **Upgrade Stage 9 dependency from count-only** to count + quality checks.

### 9. Cross-Stage Impact

- **Stage 7 (Pricing)**: can directly consume risk posture (e.g., high market/retention risk -> conservative tiers, lower expansion assumptions).
- **Stage 9 (Exit Strategy)**: replace pure `>=10 risks` with:
  - minimum count (keep 10 as floor),
  - category coverage (at least 4 of 6),
  - quality threshold (e.g., `% with owner+mitigation+review_date`),
  - at least N high-confidence risks.
- **Broader pipeline**: improves traceability and consistency between validation (Stages 3/5), planning (6-9), and execution stages by turning risks into reusable machine-readable signals.
