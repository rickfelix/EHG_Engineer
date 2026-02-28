---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 7 "Pricing" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. Pricing Model Recommendation](#2-pricing-model-recommendation)
  - [3. Tier Structure Decision](#3-tier-structure-decision)
  - [4. Competitor Pricing Consumption](#4-competitor-pricing-consumption)
  - [5. Unit Economics Reconciliation (Stage 5 vs Stage 7)](#5-unit-economics-reconciliation-stage-5-vs-stage-7)
  - [6. Pricing Generation Recommendation](#6-pricing-generation-recommendation)
  - [7. CLI Superiorities (preserve these)](#7-cli-superiorities-preserve-these)
  - [8. Recommended Stage 7 Schema](#8-recommended-stage-7-schema)
  - [9. Minimum Viable Change](#9-minimum-viable-change)
  - [10. Cross-Stage Impact](#10-cross-stage-impact)

> Independent response to the Stage 7 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------|
| Pricing generation | Manual entry with AI hooks | Nothing -- passive container | **5 Critical** | Without generated pricing, Stage 7 is empty. Stage 8 BMC has no Revenue Streams or Cost Structure data to build from. | CLOSE | Challenge: Stage 4 provides competitor pricing, Stage 5 provides financial projections. An `analysisStep` can synthesize these into a pricing strategy. |
| Pricing model selection | 7 explicit models with rationale | None -- just tiers | **4 High** | The pricing model (freemium vs subscription vs usage-based) fundamentally shapes Stage 8's business model canvas. Without it, the BMC's revenue streams are ambiguous. | CLOSE | Challenge: The pricing model can be inferred from tier structure (e.g., a $0 tier = freemium), but explicit selection forces a deliberate strategic decision. |
| Competitor pricing consumption | Per-competitor benchmarks in Stage 7 | None | **3 Medium** | Stage 4 consensus already provides `stage5Handoff` with pricing summary. Stage 7 doesn't need to re-analyze competitors -- it needs to consume the existing data. | ADAPT | Challenge: Don't duplicate Stage 4's work. Stage 7 should read Stage 4's pricing data, not re-research it. The gap is consumption, not analysis. |
| Value metrics | Primary/secondary metrics + price anchor | None | **3 Medium** | Value metrics explain "why customers pay" -- this feeds Stage 8's Value Propositions block. Without it, pricing is just numbers without strategic rationale. | CLOSE | Challenge: Value metrics are lightweight (3 string fields). Low cost to add, moderate benefit for BMC. |
| Tier richness (features, limits) | features[], limits{}, isPopular, CTA | name, price, billing, units, segment | **2 Low** | Features and limits are implementation details. Stage 8 needs pricing tiers and strategy, not feature lists per tier. That's Stage 13+ (BUILD phase) territory. | ELIMINATE | Challenge: Features per tier are product specification, not venture evaluation. The CLI's simple tier structure (name, price, segment) is sufficient for the BLUEPRINT phase. |
| Discount policies | 4 types with conditions | None | **1 Cosmetic** | Discounts are tactical pricing implementation. At venture evaluation, the question is "what will we charge?" not "what promotional mechanics will we use?" | ELIMINATE | Challenge: Discounts belong in the BUILD phase when the product is being launched, not during BLUEPRINT evaluation. |
| Recommendations engine | 9 auto-generated recommendations | 1 warning (high churn) | **3 Medium** | Recommendations catch common pricing mistakes (no free tier for freemium, price too far from market). Useful guardrails for LLM-generated pricing. | ADAPT | Challenge: If Stage 7 gets an `analysisStep`, the LLM should produce sensible pricing. But validation warnings can catch edge cases the LLM misses. |
| Stage 4-6 consumption | Props from stages 4, 5, 6 | None | **5 Critical** | Pricing in a vacuum is guesswork. Stage 4 has competitor pricing, Stage 5 has financial projections, Stage 6 has risk profile. Disconnected pricing defeats the purpose of the pipeline. | CLOSE | No challenge. This is the entire point of sequential stages. |
| Chairman overrides | Override table with rationale | None | **1 Cosmetic** | The CLI's existing governance (DFE, Chairman Preference Store) handles overrides at a different layer. Stage-specific override tables add storage complexity for a rare edge case. | ELIMINATE | Same pattern as Stage 5: if the system is well-calibrated, overrides should be rare. |
| Unit economics overlap | Projections (ACV, ARPU, conversion, churn) | LTV, CAC:LTV, payback | **3 Medium** | Stage 5 and Stage 7 both calculate unit economics. Duplication risks inconsistency. Need clear ownership. | ADAPT | Challenge: Stage 5's unit economics are *projections* (will this venture be profitable?). Stage 7's unit economics are *pricing-derived* (given this pricing, what are the economics?). They serve different purposes. |

### 2. Pricing Model Recommendation

**Add explicit pricing model selection (enum) with rationale.**

The GUI's 7 models cover the standard pricing taxonomy. For the CLI, use a slightly simplified set:

```
pricingModel: enum [
  'freemium',           // Free tier + paid upgrades
  'subscription',       // Flat or tiered subscription
  'usage_based',        // Pay per use
  'per_seat',           // Per user pricing
  'transaction_fee',    // % of transactions
  'hybrid'              // Combination
]
```

**Why 6 instead of 7**: Merge `subscription_flat` and `subscription_tiered` into `subscription`. Whether it's flat or tiered is evident from the tier array (1 tier = flat, 2+ tiers = tiered). No need for separate enum values.

**Rationale field**: Required string explaining why this model was chosen. For LLM generation: "Based on competitor analysis showing 4/5 competitors use subscription pricing and the venture's B2B SaaS positioning, tiered subscription maximizes revenue capture across segments."

### 3. Tier Structure Decision

**Keep CLI's simple tier structure. Do NOT add features[], limits{}, isPopular, CTA.**

The CLI's 5 fields per tier (name, price, billing_period, included_units, target_segment) are the right level for BLUEPRINT evaluation:
- `name`: identifies the tier ("Starter", "Pro", "Enterprise")
- `price`: the number that matters for financial modeling
- `billing_period`: annual vs monthly affects revenue recognition
- `included_units`: what you get (e.g., "5 seats", "10K API calls")
- `target_segment`: who this tier targets

Features per tier, usage limits, "popular" badges, and CTA text are product management and marketing concerns. They belong in Stage 13+ (BUILD phase) when the product is being built and the marketing site designed.

### 4. Competitor Pricing Consumption

**Stage 7 should READ Stage 4's competitor pricing, not RE-ANALYZE it.**

Stage 4 consensus produces:
- Per-competitor: `pricingModel`, `pricingTiers`, `marketShareRange`
- Aggregate: `pricingSummary` (dominant model, price range, avg count)
- `competitiveIntensity` (0-100)

Stage 7 should consume this to:
1. Set the venture's pricing model to align with (or differentiate from) market dominant model
2. Set price points relative to competitor price range
3. Adjust pricing aggressiveness based on competitive intensity (high intensity → competitive pricing, low intensity → premium pricing)

**Do NOT add a separate competitor pricing analysis in Stage 7.** This would duplicate Stage 4.

### 5. Unit Economics Reconciliation (Stage 5 vs Stage 7)

**Stage 5 unit economics are projections. Stage 7 unit economics are pricing-derived. Both are valid.**

| Field | Stage 5 (Projections) | Stage 7 (Pricing-derived) |
|-------|----------------------|--------------------------|
| `cac` | Estimated from competitive landscape | Input (cost to acquire a customer at this price) |
| `ltv` | Estimated from projected churn | Calculated from ARPA and churn at this pricing |
| `churn` | Projected from market analysis | Input (expected churn at this price point) |
| `payback` | Estimated from projected revenue | Calculated from CAC and ARPA at this pricing |

**Stage 5 = "will this venture work?" (general viability)**
**Stage 7 = "will this pricing work?" (specific strategy validation)**

**Reconciliation rule**: Stage 7's unit economics should be >= Stage 5's projections. If Stage 7 pricing produces worse unit economics than Stage 5 projected, something is wrong -- the pricing doesn't support the financial model. Add a validation warning: "Stage 7 LTV:CAC ratio (X) is worse than Stage 5 projection (Y). Pricing may not support financial viability."

### 6. Pricing Generation Recommendation

**Add a single `analysisStep` that generates a complete pricing strategy.**

**Input**:
- Venture description (Stage 1)
- Stage 4: competitor pricing (pricingSummary, per-competitor pricingModel/pricingTiers)
- Stage 5: financial projections (unit economics, revenue assumptions)
- Stage 6: risk profile (overallRiskScore, topRiskCategories)

**Process** (single LLM call):
1. Analyze competitor pricing landscape and identify the dominant model
2. Propose a pricing model and rationale based on competitive positioning
3. Design 2-4 pricing tiers with appropriate price points relative to competitors
4. Set unit economics inputs (churn, ARPA, gross margin, CAC) informed by Stage 5 projections
5. Propose value metrics (what's the primary value driver for pricing?)

**Risk-informed pricing**:
- `overallRiskScore > 70`: Conservative pricing (lower tiers, faster time-to-revenue)
- `topRiskCategories includes 'Market'`: Competitive pricing (can't charge premium in risky market)
- `topRiskCategories includes 'Financial'`: Higher margins to buffer financial risks

**Output**: Complete Stage 7 input data (pricing model, rationale, tiers, unit economics inputs, value metrics)

### 7. CLI Superiorities (preserve these)

- **Clean unit economics formulas**: LTV = (ARPA * margin) / churn, CAC:LTV = CAC / LTV, payback = CAC / monthly_gross_profit. Mathematically correct, well-documented in JSDoc.
- **Zero-churn edge case**: Returns null + warning instead of NaN or Infinity. This is proper defensive programming that the GUI doesn't do.
- **High-churn warning** (>30%): Catches unrealistic churn rates (monthly 30% = 97% annual churn). Simple but valuable guard rail.
- **Billing period flexibility**: quarterly option (GUI only has monthly/yearly/one_time). Quarterly billing is common in B2B.
- **Deterministic computation**: `computeDerived()` is a pure function with no side effects. Testable and reproducible.

### 8. Recommended Stage 7 Schema

```javascript
const TEMPLATE = {
  id: 'stage-07',
  slug: 'pricing',
  title: 'Pricing',
  version: '2.0.0',
  schema: {
    // === NEW: Pricing model selection ===
    pricingModel: { type: 'enum', values: [
      'freemium', 'subscription', 'usage_based',
      'per_seat', 'transaction_fee', 'hybrid'
    ], required: true },
    modelRationale: { type: 'string', minLength: 20, required: true },

    // === Existing: Tiers (unchanged) ===
    currency: { type: 'string', required: true },
    tiers: {
      type: 'array', minItems: 1,
      items: {
        name: { type: 'string', required: true },
        price: { type: 'number', min: 0, required: true },
        billing_period: { type: 'enum', values: ['monthly', 'quarterly', 'annual'], required: true },
        included_units: { type: 'string' },
        target_segment: { type: 'string', required: true },
      },
    },

    // === Existing: Unit economics inputs (unchanged) ===
    gross_margin_pct: { type: 'number', min: 0, max: 100, required: true },
    churn_rate_monthly: { type: 'number', min: 0, max: 100, required: true },
    cac: { type: 'number', min: 0, required: true },
    arpa: { type: 'number', min: 0, required: true },

    // === NEW: Value metrics ===
    valueMetrics: {
      type: 'object',
      properties: {
        primaryMetric: { type: 'string' },    // e.g., "time saved per week"
        priceAnchor: { type: 'string' },       // e.g., "10x ROI on subscription cost"
      },
    },

    // === Existing: Derived (unchanged) ===
    ltv: { type: 'number', nullable: true, derived: true },
    cac_ltv_ratio: { type: 'number', nullable: true, derived: true },
    payback_months: { type: 'number', nullable: true, derived: true },
    warnings: { type: 'array', derived: true },

    // === NEW: Stage cross-reference ===
    stage4PricingContext: {
      type: 'object', derived: true,
      properties: {
        competitorPriceRange: { type: 'string' },
        dominantModel: { type: 'string' },
        competitiveIntensity: { type: 'number' },
      },
    },

    // === NEW: Provenance ===
    provenance: {
      type: 'object', derived: true,
      properties: {
        dataSource: { type: 'string' },
        model: { type: 'string' },
        riskInfluence: { type: 'string' },
      },
    },
  },
};
```

**Key changes from v1.0.0**:
1. Added `pricingModel` enum (6 models) with required `modelRationale`
2. Added `valueMetrics` (primaryMetric, priceAnchor)
3. Added `stage4PricingContext` carry-through for traceability
4. Added `provenance` tracking
5. Preserved all existing fields and formulas unchanged

### 9. Minimum Viable Change

1. **P0: Add `analysisStep` for pricing strategy generation** -- Single LLM call consuming Stages 4-6 data. Produces pricing model, rationale, tiers, unit economics inputs, and value metrics. This is the #1 gap.

2. **P0: Add pricing model selection** -- `pricingModel` enum + `modelRationale` string. Essential for Stage 8 BMC's Revenue Streams block.

3. **P0: Wire Stage 4/5/6 consumption** -- `analysisStep` reads Stage 4 competitive pricing, Stage 5 financial projections, Stage 6 risk profile to inform pricing decisions.

4. **P1: Add value metrics** -- `primaryMetric` and `priceAnchor` fields. Feeds Stage 8 BMC's Value Propositions block.

5. **P1: Add Stage 5 reconciliation warning** -- If Stage 7 unit economics are worse than Stage 5 projections, emit a warning.

6. **P2: Enhance recommendations/warnings** -- Add freemium-without-free-tier check, price-vs-competitor-range check (>30% deviation warning).

7. **P3: Do NOT add discount policies** -- Implementation detail for BUILD phase.
8. **P3: Do NOT add features/limits per tier** -- Product specification for BUILD phase.
9. **P3: Do NOT add chairman override table** -- Existing governance handles this.

### 10. Cross-Stage Impact

| Change | Stage 8 (Business Model Canvas) | Stage 9 (Exit Strategy) | Broader Pipeline |
|--------|--------------------------------|------------------------|-----------------|
| Pricing model selection | **Direct input** -- BMC Revenue Streams block is defined by the pricing model. "Freemium" means ad revenue + premium upsells. "Per-seat subscription" means recurring license revenue. | Exit strategy valuation multipliers differ by pricing model (SaaS recurring > one-time license). | Pricing model is referenced by every subsequent stage that discusses revenue. |
| Value metrics | **Direct input** -- BMC Value Propositions block uses primaryMetric and priceAnchor to articulate why customers pay. | "Why customers pay" directly affects acquirer interest in exit scenarios. | Value metrics propagate through marketing (Stage 10+) and go-to-market. |
| Unit economics (pricing-derived) | BMC Cost Structure and Revenue Streams are grounded in specific pricing-derived economics, not generic projections. | LTV:CAC and payback at actual pricing inform exit valuation (higher LTV:CAC = better multiple). | Stage 7 unit economics validate Stage 5 projections with specific pricing. Mismatches are caught. |
| Risk-informed pricing | BMC inherits a pricing strategy that accounts for market and financial risks. Conservative pricing in risky markets means the BMC is realistic. | Risk-adjusted pricing affects exit valuation and timeline. | Creates a feedback loop: Stage 6 risks → Stage 7 pricing adjustments → more realistic downstream stages. |
