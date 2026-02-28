---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# Stage 16 "Financial Projections" -- Claude Response


## Table of Contents

  - [1. Gap Assessment Table](#1-gap-assessment-table)
  - [2. AnalysisStep Design](#2-analysisstep-design)
  - [3. Phase-Variable Burn Rate Decision](#3-phase-variable-burn-rate-decision)
  - [4. P&L Structure Decision](#4-pl-structure-decision)
  - [5. Revenue Model Generation Decision](#5-revenue-model-generation-decision)
  - [6. Scenario Analysis Decision](#6-scenario-analysis-decision)
  - [7. Unit Economics Coherence](#7-unit-economics-coherence)
  - [8. Funding Strategy Enhancement](#8-funding-strategy-enhancement)
  - [9. Promotion Gate Viability](#9-promotion-gate-viability)
  - [10. CLI Superiorities (preserve these)](#10-cli-superiorities-preserve-these)
  - [11. Recommended Stage 16 Schema](#11-recommended-stage-16-schema)
  - [12. Minimum Viable Change (Priority-Ordered)](#12-minimum-viable-change-priority-ordered)
  - [13. Cross-Stage Impact](#13-cross-stage-impact)
  - [14. Dependency Conflicts (with Stages 1-15 decisions)](#14-dependency-conflicts-with-stages-1-15-decisions)
  - [15. Contrarian Take](#15-contrarian-take)

> Independent response to the Stage 16 triangulation prompt.
> Respondent: Claude (Opus 4.6) with codebase access
> Date: 2026-02-11

### 1. Gap Assessment Table

| Gap | GUI Has | CLI Has | Importance (1-5) | Downstream Impact | Verdict | Challenge |
|-----|---------|---------|:-----------------:|-------------------|---------|-----------:|
| Financial model generation from prior stages | N/A | None (all user-provided) | **5 Critical** | Users must manually create projections that could be derived from 10 prior stages of structured data. The analysisStep is the most impactful addition. | CLOSE | The LLM has pricing, unit economics, sales model, funnel conversion rates, team costs by phase -- it can generate a coherent financial model. |
| Phase-variable burn rate | N/A | Single flat monthly_burn_rate | **5 Critical** | Stage 15 consensus adds phase_ref to team_members. Ignoring phase costs means: Foundation burn = Scale burn in projections. Every financial metric (runway, break-even) is wrong. | CLOSE | Challenge: Phase costs are estimates. But even rough phase costs (Foundation: $30K, Growth: $80K) are dramatically better than a flat $55K average. |
| Revenue model from pricing + sales funnel | N/A | None (user enters revenue numbers) | **4 High** | Revenue projections disconnected from pricing (Stage 7) and conversion rates (Stage 12). User can project $1M revenue while pricing × volume × conversion = $100K. | CLOSE | Challenge: Revenue generation is speculative at BLUEPRINT. But generating a "physics-based" baseline from structured inputs, then letting users override, is better than starting from nothing. |
| P&L structure | N/A | Flat month/revenue/costs | **3 Medium** | Stage 17+ needs cost breakdown for budget allocation. "Costs: $80K" doesn't tell you if that's team ($60K) + infrastructure ($10K) + marketing ($10K). | ADD | Challenge: Full P&L is overkill for BLUEPRINT. But cost categories (team, infrastructure, marketing, operations) are useful without being a full income statement. |
| Scenario analysis | N/A | Single projection path | **3 Medium** | No sensitivity visibility. If conversion drops 20%, what happens to runway? Decision-makers need range, not point estimate. | ADD | Challenge: Three full projections triple the complexity. A simpler approach: base case + sensitivity on 2-3 key variables. |
| Unit economics coherence | N/A | None (no Stage 5 connection) | **4 High** | Projections can violate Stage 5 economics. Revenue assumes LTV:CAC of 10:1 while Stage 5 says 3:1. No warning. | ADD | Challenge: Stage 5 economics are themselves estimates. But flagging mathematical inconsistencies between stages is pure upside. |
| Funding strategy enrichment | N/A | Basic (name/amount/date) | **2 Low** | Funding rounds are disconnected from runway and milestones. Nice to have runway trigger. | ADAPT | Challenge: At BLUEPRINT, investors haven't been contacted. Detailed funding strategy is premature. Keep it simple. |
| Promotion gate viability | N/A | Structural checks only | **4 High** | A venture with 1-month runway passes the gate. The gate that decides "ready to build?" doesn't check if you can afford to build. | ENHANCE | Challenge: What's the threshold? Runway >= 12 months? Break-even within projections? Any threshold is arbitrary. But "runway > 0 and projections exist" is too low. |

### 2. AnalysisStep Design

**Input (from prior stages)**:
- **Stage 5**: Unit economics (CAC, LTV, LTV:CAC, churn_rate, payback_months, margins)
- **Stage 7**: Pricing model (pricing_model type, tiers with prices, target market segment)
- **Stage 11**: GTM budget (total_monthly_budget, channel allocations, target_cac)
- **Stage 12**: Sales model (enum), funnel_stages with conversion_rate_estimate, avg_deal_size
- **Stage 13**: Phases with timeline (Foundation months 1-3, Growth months 4-9, Scale months 10+), milestones with dates
- **Stage 14**: Architecture constraints (budget constraints), technology licensing implications
- **Stage 15**: team_members with phase_ref and cost_monthly, hiring_plan with phase_ref and priority, budget_coherence.monthly_burn

**Process (single LLM call)**:
1. **Phase-variable cost model**: Sum team_members.cost_monthly × allocation_pct grouped by phase_ref. Add infrastructure cost estimates from Stage 14 technology choices. Add marketing spend from Stage 11 GTM budget. Result: cost_by_phase[].
2. **Revenue model**: Price point (Stage 7) × target volume × conversion rate (Stage 12 funnel) × growth curve aligned to phases. Foundation = low/zero revenue. Growth = ramp. Scale = steady-state.
3. **Monthly projections**: Merge phase costs + revenue model into month-by-month projections. Cost categories: team, infrastructure, marketing, operations.
4. **Runway calculation**: initial_capital / phase-weighted burn rate. Identify runway exhaustion month.
5. **Break-even analysis**: First month where cumulative (revenue - costs) >= 0. If never, flag and calculate additional capital needed.
6. **Funding triggers**: If runway < coverage of next phase, suggest funding round with amount = next phase costs × buffer.
7. **Coherence checks**: Compare generated projections against Stage 5 unit economics. Flag: LTV:CAC divergence, payback period mismatch, margin inconsistency.
8. **Key assumptions**: List every assumption with source stage reference.

**Output**: Complete Stage 16 data (cost_by_phase[], revenue_projections with cost_categories, funding_rounds with triggers, coherence_checks[], key_assumptions[], confidence score)

### 3. Phase-Variable Burn Rate Decision

**Replace flat `monthly_burn_rate` with phase-based cost structure.**

Current: single number for all months.
Proposed: derive from Stage 15 team costs grouped by phase_ref.

```
Phase: "Foundation" (months 1-3)
  Team: $32K/mo (2.3 FTE)
  Infra: $2K/mo (basic cloud)
  Marketing: $5K/mo (Stage 11 channel spend)
  Total: $39K/mo

Phase: "Growth" (months 4-9)
  Team: $67K/mo (5 FTE)
  Infra: $8K/mo (scaled services)
  Marketing: $15K/mo (channel ramp)
  Total: $90K/mo
```

**Keep `monthly_burn_rate` as a derived average** for backward compatibility and quick reference. Add `cost_by_phase[]` as the detailed view.

Why this matters: A flat $65K/mo burn rate says "18 months runway on $1.2M." Phase-based says "Foundation runway = 30 months, but Growth burns 2.3x faster -- real runway = 14 months after Growth starts." The latter is dramatically more useful for funding decisions.

### 4. P&L Structure Decision

**Add cost categories but NOT a full P&L.**

A full P&L (COGS, gross margin, operating expenses, EBITDA, net income, tax) is overkill at BLUEPRINT. But flat "costs" is too opaque.

Proposed cost breakdown per month:
```
revenue_projections[].costs → revenue_projections[].cost_breakdown: {
  team: number,        // From Stage 15 team_members.cost_monthly
  infrastructure: number,  // From Stage 14 technology hosting/licensing
  marketing: number,   // From Stage 11 GTM budget allocation
  operations: number,  // Overhead: legal, accounting, office, etc.
}
```

The `costs` field becomes the sum of cost_breakdown categories. This gives Stage 17+ enough granularity for budget allocation without requiring accounting expertise at BLUEPRINT.

**Do NOT add**: COGS vs OpEx distinction, depreciation, tax modeling, balance sheet, cash flow statement. These are investor deck artifacts, not BLUEPRINT planning tools.

### 5. Revenue Model Generation Decision

**Generate baseline revenue from pricing + sales model, allow user override.**

The analysisStep has enough structured data to build a "physics-based" revenue model:

```
Revenue = Leads × Conversion Rate × Average Deal Size × Retention

Where:
- Leads: derived from Stage 11 GTM channels (marketing spend / target_cac)
- Conversion Rate: Stage 12 funnel_stages conversion_rate_estimate (compound)
- Average Deal Size: Stage 12 avg_deal_size (or Stage 7 pricing tier midpoint)
- Retention: 1 - Stage 5 churn_rate
```

Phase alignment:
- **Foundation**: Near-zero revenue (building product)
- **Growth**: Revenue ramp (first customers, conversion optimization)
- **Scale**: Steady-state growth (established channels, compounding retention)

This generated baseline is transparent (every number traceable to a prior stage) and overridable. Users can accept, modify, or replace entirely.

### 6. Scenario Analysis Decision

**Add sensitivity variables, NOT full scenario sets.**

Three full projections (base/optimistic/pessimistic) triple complexity and are mostly fiction at BLUEPRINT. Instead:

**Key sensitivity variables** (each with ±range):
- `conversion_rate_sensitivity`: ±30% (biggest uncertainty)
- `churn_rate_sensitivity`: ±20%
- `hiring_pace_sensitivity`: ±2 months (faster/slower than planned)

**Derived ranges**:
- `runway_range`: { optimistic: X, base: Y, pessimistic: Z }
- `break_even_range`: { optimistic: month X, base: month Y, pessimistic: month Z }

This gives decision-makers the range they need ("runway is 12-18 months depending on conversion") without requiring three separate financial models.

### 7. Unit Economics Coherence

**Add coherence checks comparing projections against Stage 5 economics.**

Checks to run:
1. **LTV:CAC validation**: Projected revenue per customer vs Stage 5 LTV. Flag if >2x divergence.
2. **Payback alignment**: Projected months to recover CAC vs Stage 5 payback_months. Flag if divergence > 3 months.
3. **Margin consistency**: Projected gross margin (revenue - direct costs / revenue) vs Stage 5 margins. Flag if >20% divergence.
4. **Growth rate sanity**: Month-over-month revenue growth. Flag if >30% sustained (unrealistic without viral mechanics).
5. **Team cost vs revenue**: Total team cost at Scale vs projected revenue at Scale. Flag if team cost > 70% of revenue (unsustainable for non-platform businesses).

Each check returns: { check_name, expected (from prior stages), projected (from Stage 16), divergence, severity: warning|risk|critical }

### 8. Funding Strategy Enhancement

**Keep basic funding rounds. Add runway trigger and milestone alignment.**

Current: round_name, target_amount, target_date
Proposed additions:
- `runway_trigger_months`: number -- raise when runway drops below this (e.g., 6 months)
- `milestone_ref`: string -- raise after achieving this Stage 13 milestone
- `pre_money_estimate`: number -- optional, derived from revenue multiple or comparable

**Do NOT add**: detailed term sheets, dilution modeling, cap table projections, investor pipeline. Those are fundraising execution, not BLUEPRINT planning.

The analysisStep should suggest funding timing based on: when does runway < trigger threshold? Which milestone is the natural fundraising proof point?

### 9. Promotion Gate Viability

**Add financial viability checks to the promotion gate.**

Current gate: checks data presence (capital > 0, projections >= 6 months).
Proposed addition:

```javascript
// Financial viability checks (warnings, not blockers)
viability_checks: {
  runway_adequate: runway_months >= 6,  // Minimum to reach first milestone
  break_even_visible: break_even_month !== null && break_even_month <= projection_months,
  costs_funded: total_projected_costs <= initial_capital + sum(funding_rounds.target_amount),
  unit_economics_coherent: coherence_checks.every(c => c.severity !== 'critical'),
}
```

**Make viability checks warnings, not blockers.** The promotion gate should:
1. **Hard block**: Missing data (existing behavior -- keep)
2. **Warn**: Viability concerns (new -- add)
3. **Never block on viability alone** -- the user may have context (e.g., signed term sheet) not captured in prior stages

The gate output should include `viability_warnings[]` alongside `blockers[]`.

### 10. CLI Superiorities (preserve these)

- **Clean projection structure**: month/revenue/costs is simple and scannable. Don't lose this simplicity.
- **Runway calculation**: initial_capital / burn_rate is a clean, derived metric.
- **Break-even detection**: Iterating cumulative profit to find break-even month is correct logic.
- **Funding rounds as array**: Supports multiple rounds (seed, series A) naturally.
- **Promotion gate as cross-stage validator**: The only gate in the lifecycle that checks 4 stages simultaneously. Powerful pattern.
- **MIN_PROJECTION_MONTHS = 6**: Forces planning beyond the immediate. Reasonable minimum.

### 11. Recommended Stage 16 Schema

```javascript
const TEMPLATE = {
  id: 'stage-16',
  slug: 'financial-projections',
  title: 'Financial Projections',
  version: '2.0.0',
  schema: {
    // === Existing (unchanged) ===
    initial_capital: { type: 'number', min: 0, required: true },

    // === Updated: phase-based cost structure ===
    cost_by_phase: {
      type: 'array',
      items: {
        phase_ref: { type: 'string', required: true },  // Stage 13 phase name
        team_cost: { type: 'number', min: 0 },           // From Stage 15
        infrastructure_cost: { type: 'number', min: 0 },  // From Stage 14
        marketing_cost: { type: 'number', min: 0 },       // From Stage 11
        operations_cost: { type: 'number', min: 0 },      // Overhead
        total_monthly: { type: 'number', derived: true },  // Sum of above
      },
    },

    // === Updated: revenue_projections with cost categories ===
    revenue_projections: {
      type: 'array', minItems: 6,
      items: {
        month: { type: 'number', min: 1, required: true },
        phase_ref: { type: 'string' },  // NEW: which phase this month falls in
        revenue: { type: 'number', min: 0, required: true },
        cost_breakdown: {              // NEW: replaces flat 'costs'
          team: { type: 'number', min: 0 },
          infrastructure: { type: 'number', min: 0 },
          marketing: { type: 'number', min: 0 },
          operations: { type: 'number', min: 0 },
        },
        costs: { type: 'number', derived: true },  // Sum of cost_breakdown
      },
    },

    // === Updated: funding_rounds with triggers ===
    funding_rounds: {
      type: 'array',
      items: {
        round_name: { type: 'string', required: true },
        target_amount: { type: 'number', min: 0, required: true },
        target_date: { type: 'string' },
        runway_trigger_months: { type: 'number' },  // NEW: raise when runway < this
        milestone_ref: { type: 'string' },           // NEW: Stage 13 milestone
      },
    },

    // === NEW: sensitivity variables ===
    sensitivity: {
      type: 'object',
      properties: {
        conversion_rate_delta: { type: 'number' },  // ±%
        churn_rate_delta: { type: 'number' },        // ±%
        hiring_pace_delta_months: { type: 'number' }, // ±months
      },
    },

    // === NEW: key assumptions (transparency) ===
    key_assumptions: {
      type: 'array',
      items: {
        assumption: { type: 'string', required: true },
        source_stage: { type: 'number' },  // Which stage this came from
        confidence: { type: 'enum', values: ['high', 'medium', 'low'] },
      },
    },

    // === Existing derived (enhanced) ===
    monthly_burn_rate: { type: 'number', derived: true },  // CHANGED: now derived as weighted average
    runway_months: { type: 'number', derived: true },
    break_even_month: { type: 'number', nullable: true, derived: true },
    total_projected_revenue: { type: 'number', derived: true },
    total_projected_costs: { type: 'number', derived: true },

    // === NEW: derived ranges from sensitivity ===
    runway_range: {
      type: 'object', derived: true,
      properties: {
        optimistic: { type: 'number' },
        base: { type: 'number' },
        pessimistic: { type: 'number' },
      },
    },
    break_even_range: {
      type: 'object', derived: true, nullable: true,
      properties: {
        optimistic: { type: 'number' },
        base: { type: 'number' },
        pessimistic: { type: 'number' },
      },
    },

    // === NEW: coherence checks ===
    coherence_checks: {
      type: 'array', derived: true,
      items: {
        check_name: { type: 'string' },
        expected: { type: 'string' },  // From prior stages
        projected: { type: 'string' },  // From Stage 16 data
        divergence: { type: 'string' },
        severity: { type: 'enum', values: ['ok', 'warning', 'risk', 'critical'] },
      },
    },

    // === Updated: promotion_gate with viability ===
    promotion_gate: {
      type: 'object', derived: true,
      properties: {
        pass: { type: 'boolean' },
        rationale: { type: 'string' },
        blockers: { type: 'array' },            // Structural (hard block)
        viability_warnings: { type: 'array' },   // NEW: financial viability
        required_next_actions: { type: 'array' },
      },
    },

    // === NEW ===
    provenance: { type: 'object', derived: true },
  },
};
```

### 12. Minimum Viable Change (Priority-Ordered)

1. **P0: Add `analysisStep` for financial model generation**. Single LLM call consuming Stages 5/7/11/12/13/14/15. Generates phase-based costs from Stage 15 team data, revenue model from pricing × conversion, coherence checks against unit economics.

2. **P0: Replace flat `monthly_burn_rate` with `cost_by_phase[]`**. Derive from Stage 15 team_members grouped by phase_ref + Stage 14 infra costs + Stage 11 marketing spend. Keep monthly_burn_rate as derived weighted average.

3. **P1: Add cost categories to revenue_projections**. Replace flat `costs` with `cost_breakdown` (team, infrastructure, marketing, operations). Enables Stage 17+ budget allocation.

4. **P1: Add `coherence_checks[]`**. Validate projections against Stage 5 unit economics. LTV:CAC divergence, payback mismatch, margin consistency, growth rate sanity.

5. **P1: Add `key_assumptions[]`**. Every generated number references its source stage. Transparency for decision-makers and downstream stages.

6. **P2: Add sensitivity variables + derived ranges**. ±ranges on conversion, churn, hiring pace. Produces runway_range and break_even_range.

7. **P2: Add viability warnings to promotion gate**. Check runway adequacy, break-even visibility, costs funded, unit economics coherence. Warnings, not blockers.

8. **P2: Add milestone triggers to funding_rounds**. runway_trigger_months and milestone_ref. Connects funding to roadmap.

9. **P3: Do NOT add full P&L structure** (COGS, gross margin, EBITDA). Cost categories are sufficient for BLUEPRINT.
10. **P3: Do NOT add scenario modeling** (three full projection sets). Sensitivity ranges achieve the goal with 1/3 the complexity.
11. **P3: Do NOT add cap table / dilution modeling**. Fundraising execution detail, not BLUEPRINT.
12. **P3: Do NOT add cash flow statement**. Monthly projections already capture the essential cash flow information.

### 13. Cross-Stage Impact

| Change | Stage 17 (Pre-Build Checklist) | Stage 18+ (BUILD LOOP) | Promotion Gate |
|--------|-------------------------------|----------------------|----------------|
| Phase-based costs | Budget per build phase known. Foundation budget = X, Growth budget = Y. | Sprint budget allocation grounded in phase costs | Viability check uses real phase costs, not flat estimate |
| Revenue model from prior stages | Revenue targets per phase. Measurable build milestones. | Revenue milestones drive feature prioritization | Break-even visibility based on structured model |
| Cost categories | Budget allocation by category (team: 60%, infra: 10%, marketing: 25%, ops: 5%) | Cost tracking against categories during build | Total cost validation per category |
| Coherence checks | Build starts with validated financial assumptions | Red flags visible before spending begins | Gate catches internal contradictions |
| Key assumptions | Build team knows which assumptions to validate first | Assumption tracking throughout build lifecycle | Transparency in gate decision rationale |

### 14. Dependency Conflicts (with Stages 1-15 decisions)

**No blocking dependency conflicts.**

| Dependency | Status | Notes |
|-----------|--------|-------|
| Stage 5 → 16 (unit economics → coherence checks) | **OK** | CAC, LTV, payback, margins all available as structured data. |
| Stage 7 → 16 (pricing → revenue model) | **OK** | Pricing model and tiers with price points available. |
| Stage 11 → 16 (GTM budget → marketing costs) | **OK** | total_monthly_budget and channel allocations available. |
| Stage 12 → 16 (sales model + funnel → revenue model) | **OK** | conversion_rate_estimate on funnel_stages and avg_deal_size available per consensus. |
| Stage 13 → 16 (phases → cost phasing) | **OK** | Phase names and timelines available. Phase_ref established in Stage 15 consensus. |
| Stage 14 → 16 (architecture → infra costs) | **OK** | Technology selections per layer. Budget constraints categorized. |
| Stage 15 → 16 (team costs → burn rate) | **OK** | team_members with phase_ref and cost_monthly. budget_coherence.monthly_burn available. |

**Potential soft issue**: If Stage 13 phases have vague timelines (no month ranges), phase-based costing degrades to rough estimates. However, even rough phase boundaries are better than flat.

### 15. Contrarian Take

**Arguing AGAINST the revenue model generation:**

1. **Revenue projections are aspirational, not calculable.** Pricing × volume × conversion = revenue assumes you know volume. At BLUEPRINT, you don't know volume. You don't know your actual conversion rate. You have Stage 5 estimates based on market research, not customer data. Generating revenue from these inputs creates a false sense of precision -- "the AI calculated $84K/month in revenue by month 6" sounds authoritative but is built on stacked assumptions.

2. **Phase-based costs may create planning paralysis.** When the model shows Foundation costs of $39K/mo but Growth costs of $90K/mo, founders may obsess over cost control instead of focusing on product-market fit. The whole point of Foundation is speed and learning, not cost optimization.

3. **Coherence checks could be counterproductive.** Flagging "your projections diverge from Stage 5 unit economics" assumes Stage 5 is correct. But Stage 5 was itself an estimate. Now you have two estimates disagreeing, and the system flags it as a problem when really it's just two uncertain guesses not matching.

4. **What could go wrong**: Ventures spend hours tweaking financial models to make all coherence checks pass, producing beautiful projections that are still fiction. The time would be better spent on customer development. BLUEPRINT financial planning is not accounting -- it's "order of magnitude, can we afford this?"

**Counter-argument**: Without the analysisStep, users enter financial data with zero connection to 15 stages of structured analysis. Without phase-based costs, every financial metric is systematically wrong. Without coherence checks, projections can violate their own prior stage assumptions. Even approximate, derived projections are dramatically better than disconnected user guesses. The key is labeling everything as "estimates based on assumptions" and making the assumptions transparent.

**Verdict**: Keep all changes but emphasize in the analysisStep output that these are "model-derived estimates, not forecasts." The key_assumptions array is the most important addition -- it forces transparency about what's speculative. And make the generated projections easily overridable by the user.
