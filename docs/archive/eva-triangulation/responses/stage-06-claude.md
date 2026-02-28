---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 6 "Risk Matrix" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. Risk Generation Recommendation](#2-risk-generation-recommendation)
  - [3. Scoring Model Decision](#3-scoring-model-decision)
  - [4. Aggregate Metrics Recommendation](#4-aggregate-metrics-recommendation)
  - [5. Stage 5 -> Stage 6 Pipeline](#5-stage-5---stage-6-pipeline)
  - [6. CLI Superiorities (preserve these)](#6-cli-superiorities-preserve-these)
  - [7. Recommended Stage 6 Schema](#7-recommended-stage-6-schema)
  - [8. Minimum Viable Change](#8-minimum-viable-change)
  - [9. Cross-Stage Impact](#9-cross-stage-impact)

> Independent response to the Stage 6 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Risk generation | Manual entry with 4 sample risks | Nothing -- passive container | **5 Critical** | Without generated risks, Stage 6 is empty. Stage 9's Reality Gate requires >= 10 risks. No risks = no risk context for Stages 7-9. | CLOSE | Challenge: Neither CLI nor GUI *generates* risks autonomously. The GUI pre-populates 4 generic samples. The CLI needs an `analysisStep` that produces venture-specific risks from Stages 1-5 output. |
| Aggregate risk assessment | Overall score badge with category distribution | Nothing -- individual scores only | **3 Medium** | Downstream stages (7-9) benefit from knowing "this is a high-risk venture" vs "this is a low-risk venture" as a signal. Without aggregate, each stage must re-interpret raw risk data. | CLOSE | Challenge: An aggregate risk score is easy to compute deterministically from individual risk scores. The real question is whether downstream stages consume it. Stage 7 (Pricing) should adjust pricing strategy based on overall risk level. |
| Residual risk tracking | None | Yes (post-mitigation re-scoring) | **2 Low** | Residual risk is more relevant during BUILD (Stages 13-15) when mitigations are actually being implemented. At the BLUEPRINT stage, we're identifying risks and planning mitigations, not executing them. | ADAPT | Challenge: The CLI's residual risk fields are structurally sound but premature. Keep them optional in the schema but don't require them or prioritize them in the `analysisStep`. The LLM can estimate residual risk but it's speculative at this stage. |
| Risk lifecycle status | None | Yes (open/mitigated/accepted/closed) | **2 Low** | At Stage 6, all risks are "open" by definition -- nothing has been mitigated yet. The status lifecycle is useful for later stages when risks are actively managed. | ADAPT | Challenge: Keep the field but default all to "open" during generation. The status lifecycle becomes valuable in Stages 13+ when the venture is being built and risks are actively addressed. |
| Risk name field | Yes (separate name + description) | No (description only) | **1 Cosmetic** | A name field makes risk display cleaner but has no analytical impact. The description field carries all meaningful content. | ELIMINATE | Pure UI concern. The CLI's description field is sufficient. |
| Mitigation owner | None | Yes (required field) | **3 Medium** | Owner assignment is governance infrastructure. In an autonomous CLI pipeline, the "owner" is typically the venture itself or a team role, not a named person. Useful for tracking but not critical at evaluation stage. | ADAPT | Challenge: Keep the field but make it optional or default to a role name. The LLM can assign generic owners (e.g., "CTO", "Marketing Lead") but forcing specific owners at Stage 6 is premature. |
| Review date | None | Yes (required field) | **1 Cosmetic** | Review dates are operational -- they matter during BUILD, not during BLUEPRINT evaluation. | ADAPT | Keep in schema but make optional. Default to "Stage 9 review" or compute from venture timeline. |
| Risk categories | 4 (market, financial, technical, operational) | 6 (adds Product, Legal/Compliance) | **3 Medium** | 6 categories provide better coverage. Product risk (product-market fit, feature scope) and Legal/Compliance risk (regulatory, IP) are genuine risk categories that 4 categories miss. | Keep CLI's 6 | Challenge: The GUI's 4 categories force product risks into "market" or "technical", losing specificity. Legal/compliance risks have no home. CLI's 6 categories are correct. |
| Scoring granularity | 2-factor (probability × impact, 0-10000) | 3-factor (severity × probability × impact, 1-125) | **2 Low** | Both models rank risks. The 3-factor model distinguishes between "likely but low severity" and "unlikely but catastrophic" better. But for an LLM generating scores, 2-factor is more consistent. | ADAPT | Challenge: The CLI's 3-factor model is technically more expressive. But "severity" and "impact" are highly correlated -- an LLM will often score them identically. Consider merging severity and impact into a single "consequence" factor, giving a 2-factor model with CLI's integer scale. |
| Pre-populated samples | 4 generic sample risks | Nothing | **2 Low** | Samples help human users start. In a CLI with LLM generation, samples are irrelevant -- the LLM generates venture-specific risks. | ELIMINATE | Samples are a GUI UX pattern. The CLI's `analysisStep` replaces samples with actual risk generation. |
| Artifact versioning | Yes (venture_artifacts table) | No | **2 Low** | Versioning is storage infrastructure, not stage logic. The CLI can add versioning to its artifact persistence layer independently. | ELIMINATE (from Stage 6 scope) | This is a storage concern, not a Stage 6 concern. The CLI's database-first architecture can handle artifact versioning at the persistence layer. |

### 2. Risk Generation Recommendation

**Add an `analysisStep` that generates venture-specific risks from Stages 1-5 output.**

**Input** (context for LLM):
- Venture description (Stage 1)
- Key critiques (Stage 2)
- Stage 3 metrics: which metrics scored lowest? Low `competitiveBarrier` → competitive risk. Low `executionFeasibility` → technical/operational risk.
- Stage 4 competitive intel: high `competitiveIntensity` → market risk. Blue Ocean → different risk profile.
- Stage 5 financials: high churn → customer retention risk. Low gross margin → financial risk. Long payback → funding risk.

**Process** (single LLM call):
1. Prompt: "Given this venture and its validation data, identify the top 10-15 risks across all 6 categories. For each risk, provide category, description, severity (1-5), probability (1-5), impact (1-5), and a specific mitigation strategy."
2. LLM generates structured risk cards.
3. Deterministic post-processing: compute scores, validate completeness, ensure all 6 categories are represented (at least 1 risk per category, or explicitly note "no [category] risks identified").

**Why 10-15 risks**: Stage 9's Reality Gate requires >= 10. Generating 10-15 gives buffer for filtering or merging duplicates. Fewer than 10 is insufficient coverage for a venture's risk landscape. More than 15 adds noise.

**Automatic risk seeding from Stage 5 output**:
- If `unitEconomics.monthlyChurn > 0.10`: seed "Customer retention risk (monthly churn exceeds 10%)" under Financial
- If `unitEconomics.grossMargin < 0.40`: seed "Margin pressure risk" under Financial
- If `unitEconomics.ltvCacRatio < 3.0`: seed "Unit economics fragility" under Financial
- If `scenarioSpread.robustness === 'fragile'`: seed "Financial sensitivity risk" under Financial
- If `competitiveIntensity > 70` (from Stage 4): seed "Competitive displacement risk" under Market

These deterministic seeds ensure that quantitative signals from earlier stages are represented in the risk matrix, not just LLM-generated qualitative risks.

### 3. Scoring Model Decision

**ADAPT: Simplify to 2-factor model while keeping CLI's integer scale.**

The CLI's 3-factor model (severity × probability × impact) has a conceptual problem: severity and impact are too correlated. "How severe is this risk?" and "What is the impact of this risk?" produce nearly identical answers from both humans and LLMs.

**Recommended model**: probability (1-5) × consequence (1-5) = score (1-25)
- `probability`: How likely is this risk to materialize? (1=rare, 5=almost certain)
- `consequence`: How bad would it be if it materialized? (1=minor, 5=catastrophic)
- `score`: probability × consequence (1-25)

This gives a cleaner range (1-25 vs 1-125) that's easier to threshold:
- Critical: 15-25 (e.g., probable + severe, or certain + moderate)
- High: 10-14
- Medium: 5-9
- Low: 1-4

**Keep residual risk** but make it optional and use the same 2-factor model. Pre-mitigation vs post-mitigation comparison shows mitigation effectiveness.

### 4. Aggregate Metrics Recommendation

**Produce three aggregate signals for downstream consumption:**

1. **`overallRiskScore`** (0-100): Normalized aggregate of all individual risk scores. Formula: `sum(scores) / (maxPossibleSum) * 100`. Higher = riskier venture.

2. **`riskDistribution`**: Count of risks by severity tier (critical/high/medium/low). Gives Stage 7 a quick view: "3 critical, 4 high, 5 medium, 3 low" vs "0 critical, 2 high, 8 medium, 5 low" -- very different risk profiles.

3. **`topRiskCategories`**: The 1-2 categories with the highest aggregate scores. Tells Stage 7 "this venture's biggest risks are Market and Financial" -- directly informs pricing strategy and business model decisions.

### 5. Stage 5 -> Stage 6 Pipeline

**Stage 5 provides**:
- `unitEconomics` (CAC, LTV, LTV:CAC, churn, payback, gross margin)
- `scenarioSpread.robustness` (fragile/moderate/robust)
- `roi3y`, `breakEvenMonth`
- `reasons` (if kill was considered but venture passed conditionally)
- `provenance.stage4Confidence`

**Stage 6 consumes**:
1. **Financial risk seeding**: Unit economics outside healthy ranges automatically seed specific financial risks (see Section 2 above).
2. **Scenario robustness**: A "fragile" venture should have this explicitly reflected as a risk: "Financial projections are sensitive to assumption changes."
3. **Stage 4 competitive data**: High `competitiveIntensity` seeds market risks. Blue Ocean ventures get a different risk profile (opportunity risk: market may not exist).
4. **Stage 3 metrics**: Low-scoring metrics from Stage 3 seed corresponding risk categories.

**Pipeline pattern**: "Quantitative signals from Stages 1-5 become qualitative risk descriptions in Stage 6." This ensures the risk matrix isn't disconnected from the data gathered in earlier stages.

### 6. CLI Superiorities (preserve these)

- **6 risk categories** (vs GUI's 4): Product and Legal/Compliance are real risk categories that shouldn't be folded into others. Preserve all 6.
- **Quantitative scoring** (integers, not qualitative enums): The CLI's integer-based severity/probability/impact is more computationally useful than "high/medium/low". Enables deterministic score calculation and thresholding.
- **Residual risk tracking**: Even if optional at Stage 6, the schema supports post-mitigation re-assessment. This is forward-looking architecture.
- **Risk lifecycle status**: open/mitigated/accepted/closed is proper risk management. Supports status tracking across stages.
- **Mitigation owner assignment**: Required field ensures every risk has accountability. Even with generic role names, this is stronger than no owner.
- **Review date**: Supports scheduled risk re-evaluation. Useful during BUILD phases.
- **Description length enforcement** (minLength: 10): Prevents "Market risk" as a description. Forces meaningful risk descriptions.

### 7. Recommended Stage 6 Schema

```javascript
const TEMPLATE = {
  id: 'stage-06',
  slug: 'risk-matrix',
  title: 'Risk Matrix',
  version: '2.0.0',
  schema: {
    risks: {
      type: 'array',
      minItems: 10,  // CHANGED: from 1 to 10 (Stage 9 Reality Gate requires it)
      items: {
        id: { type: 'string', required: true },
        category: { type: 'enum', values: [
          'Market', 'Product', 'Technical',
          'Legal/Compliance', 'Financial', 'Operational'
        ], required: true },
        description: { type: 'string', minLength: 10, required: true },
        probability: { type: 'integer', min: 1, max: 5, required: true },
        consequence: { type: 'integer', min: 1, max: 5, required: true },  // RENAMED from impact
        score: { type: 'integer', derived: true },  // probability × consequence (1-25)
        mitigation: { type: 'string', minLength: 10, required: true },
        owner: { type: 'string' },  // CHANGED: optional (default to role)
        status: { type: 'enum', values: ['open', 'mitigated', 'accepted', 'closed'],
                  default: 'open' },
        source: { type: 'enum', values: ['generated', 'seeded', 'manual'] },  // NEW
        // Residual risk (optional, for later stages)
        residual_probability: { type: 'integer', min: 1, max: 5 },
        residual_consequence: { type: 'integer', min: 1, max: 5 },
        residual_score: { type: 'integer', derived: true },
      },
    },
    // === NEW: Aggregate metrics ===
    overallRiskScore: { type: 'number', min: 0, max: 100, derived: true },
    riskDistribution: {
      type: 'object', derived: true,
      properties: {
        critical: { type: 'integer' },  // score 15-25
        high: { type: 'integer' },      // score 10-14
        medium: { type: 'integer' },    // score 5-9
        low: { type: 'integer' },       // score 1-4
      },
    },
    topRiskCategories: { type: 'array', derived: true },  // Top 1-2 categories
    // === NEW: Provenance ===
    provenance: {
      type: 'object', derived: true,
      properties: {
        generatedCount: { type: 'integer' },   // LLM-generated risks
        seededCount: { type: 'integer' },       // Auto-seeded from Stage 5
        manualCount: { type: 'integer' },       // User-added (if any)
        model: { type: 'string' },
      },
    },
  },
};
```

**Key changes from v1.0.0**:
1. `minItems: 10` (aligns with Stage 9 Reality Gate)
2. 2-factor scoring: `probability × consequence` (merged severity+impact into consequence)
3. Score range 1-25 (cleaner than 1-125)
4. Added `source` field per risk (generated/seeded/manual)
5. Added aggregate metrics (overallRiskScore, riskDistribution, topRiskCategories)
6. Made `owner` and `status` optional with defaults
7. Removed `severity` (merged into `consequence`)
8. Removed required `review_date` (premature at BLUEPRINT stage)

### 8. Minimum Viable Change

1. **P0: Add `analysisStep` for risk generation** -- Single LLM call that takes venture context (Stages 1-5 output) and generates 10-15 venture-specific risks across all 6 categories. This is the #1 gap -- both CLI and GUI lack autonomous risk generation.

2. **P0: Add deterministic risk seeding from Stage 5** -- Auto-generate financial risks from unit economics outside healthy ranges (churn >10%, gross margin <40%, LTV:CAC <3). These risks are facts, not opinions.

3. **P1: Add aggregate metrics to `computeDerived()`** -- Calculate `overallRiskScore`, `riskDistribution`, and `topRiskCategories` from individual risk scores. Simple deterministic calculation.

4. **P1: Simplify to 2-factor scoring** -- Merge severity and impact into `consequence`. Reduces LLM scoring complexity and eliminates the severity/impact correlation problem.

5. **P2: Add `source` field for provenance** -- Track whether each risk was LLM-generated, auto-seeded from Stage 5, or manually added. Helps understand risk matrix composition.

6. **P2: Increase `minItems` to 10** -- Align with Stage 9 Reality Gate requirement. Current `minItems: 1` is too low for meaningful risk coverage.

7. **P3: Make owner/status/review_date optional** -- Keep in schema for later stages but don't require at Stage 6. All generated risks default to `status: 'open'`.

8. **P3: Do NOT add artifact versioning at Stage 6** -- This is a storage layer concern, not a stage logic concern.

### 9. Cross-Stage Impact

| Change | Stage 7 (Pricing) | Stage 9 (Exit Strategy) | Broader Pipeline |
|--------|-------------------|-------------------------|-----------------|
| Risk generation `analysisStep` | Stage 7 receives actual risk context instead of empty data. High market risk → conservative pricing. High competitive risk → differentiation pricing. | Stage 9 Reality Gate (>= 10 risks) is automatically satisfied by the generated risk matrix. Exit strategy can reference specific risks. | Every stage from 7-25 has a risk-informed context. Current pipeline has zero risk data. |
| Deterministic risk seeding from Stage 5 | Financial risks derived from Stage 5 unit economics directly inform pricing guard rails. If "margin pressure risk" is seeded, Stage 7 knows to design pricing for healthier margins. | Exit strategy considers financial risk profile. High financial risk → exit earlier. | Creates a quantitative-to-qualitative bridge: Stage 5 numbers become Stage 6 risk descriptions. |
| Aggregate risk metrics | Stage 7 uses `overallRiskScore` and `topRiskCategories` to adjust pricing aggressiveness. A 70+ risk score means conservative pricing. | Exit strategy uses risk distribution to assess whether the venture is investable. Heavy "critical" distribution → harder exit. | A single `overallRiskScore` number propagates through the entire pipeline as a venture health signal. |
| 2-factor scoring simplification | Cleaner risk data for Stage 7 consumption. Less noise, easier to threshold. | Stage 9 Reality Gate evaluates risk count, not scoring model. No impact. | Reduces cognitive load for any stage consuming risk data. Easier for LLMs to generate consistent scores. |
