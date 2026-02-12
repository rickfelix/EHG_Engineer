# EVA Venture Lifecycle -- Stage 7 "Pricing" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 7 of a 25-stage venture lifecycle -- the second stage of THE ENGINE phase.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- no kill gates, artifact-building
- **Stages 10-12**: THE IDENTITY (Branding/Naming)
- **Stages 13-15**: BUILD -- kill gate at 13

## Pipeline Context

**What comes BEFORE Stage 7** -- Stage 6 (Risk Matrix):
- CLI: Structured risk register with 6 categories, 3-factor scoring, residual risk tracking, mitigation ownership.
- **Stage 6 triangulation consensus**: CLI will add `analysisStep` for LLM risk generation (10-15 risks from Stages 1-5), deterministic risk seeding from Stage 5 unit economics, 2-factor scoring (probability x consequence, 1-25), aggregate metrics (overallRiskScore, riskDistribution, topRiskCategories). CLI's 6 categories and governance fields preserved.

**What Stage 7 does** -- Pricing:
- Design the pricing strategy, tier structure, and unit economics for the venture.
- This is NOT a kill gate. It's an artifact-building stage.
- Pricing decisions are directly informed by competitive intelligence (Stage 4), financial projections (Stage 5), and risk profile (Stage 6).

**What comes AFTER Stage 7** -- Stage 8 (Business Model Canvas):
- CLI: All 9 BMC blocks with required completeness checks.
- Stage 8 needs: pricing strategy, tier structure, and unit economics from Stage 7 to populate Revenue Streams and Cost Structure blocks.

## CLI Stage 7 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-07.js`

**Input**: currency, tiers[] (name, price, billing_period, included_units, target_segment), gross_margin_pct (0-100), churn_rate_monthly (0-100), cac, arpa

**Derived**: LTV = (ARPA * gross_margin_pct/100) / churn_rate_monthly_decimal; CAC:LTV ratio; payback_months

**Key properties**:
- 3 billing periods (monthly/quarterly/annual)
- Zero-churn edge case: returns null LTV with warning (no division by zero)
- High-churn warning at >30%
- No pricing model selection, no competitor analysis, no discounts, no value metrics
- No `analysisSteps` -- passive container
- Clean, correct unit economics formulas

## GUI Stage 7 Implementation (Ground Truth)

**Component**: `src/components/stages/v2/Stage7PricingStrategy.tsx` (1,041 lines)

**7 Pricing Models**: freemium, subscription_flat, subscription_tiered, usage_based, per_seat, transaction_fee, hybrid

**Rich tier structure**: name, description, price, billingCycle, features[], limits{}, isPopular, cta

**Additional features**: discount policies (4 types), competitor pricing analysis, value metrics (primary/secondary/anchor), projections (ACV, ARPU, conversion, churn), 9 auto-generated recommendations, chairman overrides

**Database**: pricing_strategies, pricing_competitive_analysis, chairman_pricing_overrides tables

**Inputs**: Stages 4 (competitive data), 5 (financial model), 6 (risk matrix)

## Key Differences Summary

| Dimension | CLI | GUI |
|-----------|-----|-----|
| Pricing model selection | None | 7 models |
| Tier richness | 5 fields | 8 fields + features/limits |
| Discount policies | None | 4 types |
| Competitor analysis | None | Per-competitor benchmarks |
| Value metrics | None | Primary/secondary/anchor |
| Unit economics | LTV, CAC:LTV, payback | ACV, ARPU, conversion, churn |
| Recommendations | 1 warning (high churn) | 9 auto-generated |
| Prior stage consumption | None | Stages 4-6 |

## Your Task

Analyze the gap between CLI and GUI for Stage 7, considering:

1. **Pricing model selection**: The GUI offers 7 pricing models with rationale. The CLI has none -- just tiers. Does Stage 7 need explicit model selection, or can it be inferred from tier structure?

2. **Tier richness**: The GUI has features[], limits{}, isPopular, CTA per tier. The CLI has name, price, billing, units, segment. What level of tier detail serves Stage 8 (BMC)?

3. **Competitor pricing analysis**: The GUI benchmarks against competitors. The CLI doesn't. Stage 4 already provides competitor pricing data. Should Stage 7 re-analyze competitor pricing, or just consume Stage 4's data?

4. **Discount policies**: The GUI supports percentage/fixed/volume/promotional discounts. Are discounts relevant at the venture evaluation stage, or are they implementation details for later?

5. **Value metrics**: The GUI captures primary value metric, secondary metrics, and price anchor. These inform "why customers will pay." Is this important for Stage 8's Revenue Streams block?

6. **Unit economics overlap**: Stage 5 consensus already adds unit economics (CAC, LTV, churn, payback). Stage 7 CLI also calculates these. How should Stage 5 and Stage 7 unit economics relate?

7. **Pricing generation**: Neither CLI nor GUI generates pricing automatically. Should Stage 7 have an `analysisStep` that proposes pricing based on Stage 4 competitive data + Stage 5 financial model + Stage 6 risk profile?

8. **Stage 6 -> Stage 7 pipeline**: Stage 6 consensus produces aggregate risk metrics (overallRiskScore, topRiskCategories). How should risk profile influence pricing decisions?

9. **Minimum viable change**: What's the smallest set of changes to make Stage 7 produce a useful pricing strategy for Stage 8?

## Gap Importance Rubric

| Score | Label | Criteria |
|-------|-------|----------|
| 5 | **Critical** | Without closing this gap, the stage cannot function or produces incorrect downstream decisions |
| 4 | **High** | Significantly degrades downstream stage quality |
| 3 | **Medium** | Improves quality but the stage can function without it |
| 2 | **Low** | Nice to have; minimal impact on pipeline correctness |
| 1 | **Cosmetic** | UX or presentation concern with no analytical impact |

**For each gap, also challenge**: Does this gap truly need to be closed, or does the CLI's existing infrastructure already address it differently?

## Output Format

### 1. Gap Assessment Table
| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |

### 2. Pricing Model Recommendation
### 3. Tier Structure Decision
### 4. Competitor Pricing Consumption
### 5. Unit Economics Reconciliation (Stage 5 vs Stage 7)
### 6. Pricing Generation Recommendation
### 7. CLI Superiorities (preserve these)
### 8. Recommended Stage 7 Schema
### 9. Minimum Viable Change
### 10. Cross-Stage Impact
