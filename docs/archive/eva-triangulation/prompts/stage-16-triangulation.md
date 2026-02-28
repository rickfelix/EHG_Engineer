---
category: general
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [general, auto-generated]
---
# EVA Venture Lifecycle -- Stage 16 "Financial Projections" -- CLI vs GUI Gap Analysis

## Context

We are replacing a GUI-based venture workflow with a CLI-based workflow. The CLI is the primary engine; the GUI is being deprecated. We need to identify what the CLI is missing, what it does better, and what minimum changes would make it self-sufficient.

This is Stage 16 of a 25-stage venture lifecycle -- the **final stage of THE BLUEPRINT phase**.
- **Stages 1-5**: THE TRUTH (Foundation/Validation) -- kill gates at 3 and 5
- **Stages 6-9**: THE ENGINE (Planning/Design) -- Reality Gate at 9
- **Stages 10-12**: THE IDENTITY (Naming/GTM/Sales) -- Reality Gate at 12
- **Stages 13-16**: THE BLUEPRINT (Product/Architecture/Resources/Financials) -- kill gate at 13, promotion gate at 16
- **Stages 17-22**: THE BUILD LOOP
- **Stages 23-25**: LAUNCH & LEARN

## Cumulative Consensus (Stages 1-15)

These decisions are SETTLED. Do not re-argue them -- build on them.

| Stage | Key Decisions |
|-------|--------------|
| 1-9 | (See prior stage summaries -- Foundation, Engine phases complete) |
| 10 (Naming/Brand) | Add `analysisStep`. Brand genome + name candidates. naming_strategy enum. Decision object with working_title. |
| 11 (Go-To-Market) | Add `analysisStep`. 3 tiers + 8 channels. channel_type enum. persona + pain_points. target_cac. Coherence warnings. |
| 12 (Sales Logic) | Add `analysisStep`. 6-value sales_model enum. Deal/funnel separation. conversion_rate_estimate on funnel_stages. Economy Check in Reality Gate. |
| 13 (Product Roadmap) | Add `analysisStep`. now/next/later priority. Typed deliverables (feature/infrastructure/integration/content). outcomes[]. Enhanced kill gate. |
| 14 (Technical Architecture) | Add `analysisStep`. 4 core layers + additional_layers + security cross-cutting. Schema-Lite data_entities[]. Constraint categories. Deliverable→architecture mapping. |
| 15 (Resource Planning) | Add `analysisStep`. Phase-aware role bundling (generalists→specialists). phase_ref on team_members + hiring_plan. Sales model→team ratios. severity/priority enums. budget_coherence. |

**Established pattern**: Every stage from 2-15 adds an `analysisStep` that consumes prior stages. Stage 16 will follow this pattern.

**Key upstream data available to Stage 16's analysisStep**:
- **Stage 5**: Unit economics (CAC, LTV, LTV:CAC ratio, churn rate, payback period, margins)
- **Stage 7**: Pricing model (pricing_model, tiers, price points)
- **Stage 11**: GTM budget (total_monthly_budget, channel budgets, target_cac)
- **Stage 12**: Sales model (6-value enum), funnel stages with conversion_rate_estimate, avg_deal_size
- **Stage 13**: Roadmap phases (Foundation/Growth/Scale) with milestones and timelines
- **Stage 14**: Architecture constraints (budget constraints, technology licensing)
- **Stage 15**: Team costs by phase (team_members with phase_ref, cost_monthly, allocation_pct), budget_coherence warnings

## Pipeline Context

**What comes BEFORE Stage 16** -- Stage 15 (Resource Planning):
- Per consensus: team_members with phase_ref and cost_monthly, hiring_plan with phase_ref and priority enum, budget_coherence with monthly_burn and warnings. This gives us phase-variable team costs.

**What Stage 16 does** -- Financial Projections:
- Build the financial picture: revenue projections, cost structure, burn rate, runway, break-even, funding needs.
- This is the "CAN YOU AFFORD IT?" and "WHEN DO YOU MAKE MONEY?" stage.
- **This is THE LAST STAGE before the BUILD LOOP.** It's the final sanity check before development begins.

**What comes AFTER Stage 16** -- Phase 4→5 Promotion Gate, then Stage 17 (Pre-Build Checklist):
- The promotion gate decides if BLUEPRINT is complete enough to begin building.
- Stage 17 uses Stage 16 outputs for budget allocation, timeline, and go/no-go criteria.

## CLI Stage 16 Implementation (Ground Truth)

**Template**: `lib/eva/stage-templates/stage-16.js`

**Input**: initial_capital (number), monthly_burn_rate (single number), revenue_projections[] (min 6: month, revenue, costs), funding_rounds[] (optional: round_name, target_amount, target_date)

**Derived**: runway_months (capital/burn), burn_rate (echo), break_even_month (first cumulative profit >= 0), total_projected_revenue, total_projected_costs, promotion_gate (Phase 4→5)

**Key properties**:
- All financial data is user-provided (no analysisStep)
- Flat burn rate (single number, not phase-variable despite Stage 15 having phase-based team costs)
- Simple revenue_projections (month/revenue/costs per row -- no P&L structure)
- Basic funding rounds (name/amount/date -- no dilution, valuation, triggers)
- Simplistic break-even (first month cumulative profit >= 0)
- Promotion gate checks structural completeness, NOT financial viability
- No connection to Stage 5 unit economics, Stage 7 pricing, Stage 12 sales model, or Stage 15 phase-based costs
- MIN_PROJECTION_MONTHS = 6

## GUI Stage 16 Implementation (Ground Truth)

No GUI Stage 16 exists. No financial projection components found in the frontend.

## Your Task

Stage 16 is the culmination of THE BLUEPRINT phase. It must synthesize ALL prior stage data into a coherent financial picture. The current CLI template is disconnected from every prior stage.

1. **What should the analysisStep produce?** The LLM has pricing (Stage 7), unit economics (Stage 5), sales model + funnel conversion rates (Stage 12), roadmap phases with timelines (Stage 13), architecture constraints (Stage 14), and team costs by phase (Stage 15). What financial model should it generate?

2. **Phase-variable burn rate vs flat**: Stage 15 consensus has phase_ref on team_members. Should Stage 16 compute burn rate per phase (Foundation: $30K/mo, Growth: $80K/mo) instead of a single monthly_burn_rate?

3. **P&L structure vs flat projections**: Current revenue_projections is month/revenue/costs. Should this become a structured P&L (revenue, COGS, gross margin, operating expenses broken down by category, EBITDA/operating income)?

4. **Revenue model generation**: Stage 7 has pricing and Stage 12 has sales funnel with conversion rates. Can the analysisStep generate revenue projections from: pricing × volume × conversion rates? Or is this too speculative at BLUEPRINT?

5. **Scenario analysis**: Should the template support base/optimistic/pessimistic scenarios? Or is a single "most likely" projection sufficient at this planning stage?

6. **Unit economics coherence**: Stage 5 has CAC, LTV, payback. Should Stage 16 validate that revenue projections are consistent with these metrics? (e.g., if CAC=$100 and LTV=$300, but projections show 10x revenue in month 3, flag as unrealistic)

7. **Funding strategy alignment**: Funding rounds are basic (name/amount/date). Should they connect to runway (raise needed when runway < N months)? Should they have milestone triggers from Stage 13?

8. **Promotion gate viability**: Currently checks data presence only. Should the promotion gate also check financial viability? (e.g., runway >= 12 months, or break-even within projection window, or funded to next milestone)

## Dependency Conflict Check

**IMPORTANT**: Identify any dependency conflicts with prior stage decisions (1-15).

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

### 2. AnalysisStep Design (inputs, prior stage mapping, outputs)
### 3. Phase-Variable Burn Rate Decision
### 4. P&L Structure Decision
### 5. Revenue Model Generation Decision
### 6. Scenario Analysis Decision
### 7. Unit Economics Coherence
### 8. Funding Strategy Enhancement
### 9. Promotion Gate Viability
### 10. CLI Superiorities (preserve these)
### 11. Recommended Stage 16 Schema
### 12. Minimum Viable Change (priority-ordered)
### 13. Cross-Stage Impact
### 14. Dependency Conflicts (with Stages 1-15 decisions)
### 15. Contrarian Take -- argue AGAINST the most obvious recommendation. What could go wrong? What might we be over-engineering?
