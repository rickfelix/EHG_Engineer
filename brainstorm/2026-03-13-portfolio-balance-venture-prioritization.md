# Brainstorm: Portfolio-Based Venture Prioritization & Balance System

## Metadata
- **Date**: 2026-03-13
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (Shortform Sage, Elysian, MindStack AI, ListingLens AI, CodeShift, LegacyAI, LexiGuard)

---

## Problem Statement
EHG has 7 active ventures but no way to see them as a portfolio. Ventures are evaluated individually, which means the Chairman cannot answer: "Are we balanced across growth strategies? Are capabilities compounding across ventures? Where are the gaps?" The database has portfolio infrastructure (tables, FKs), but nothing is linked — every venture has `portfolio_id = null`, no category, no strategy classification. The Chairman wants a view on the existing `/chairman/vision` route that shows portfolio balance at a glance and helps identify where to focus next.

## Discovery Summary

### Current Priority: Revenue + Capability Compounding
- **Primary goal**: Make money. Find opportunities that compound dollars.
- **Secondary goal**: Compound capabilities — both business (shared customers, distribution, brand trust) and technical (shared models, pipelines, components).
- **Later aspiration**: Civic society, global poverty — real values but not the current optimization target.

### Portfolio Structure: Growth Strategy, Not Industry
- Rejected the industry-vertical model (HealthTech, FinTech, GreenTech — these were demo data).
- Proposed organizing by **growth strategy**:
  - **Cash Engines**: Proven models, fast to revenue, fund everything else
  - **Capability Builders**: May not maximize revenue alone but produce reusable tech/data/models
  - **Moonshots**: Higher risk, higher ceiling, novel market positions
- "Balance" = risk diversification + coverage across strategy types.

### Existing DB Infrastructure
- `companies` table: has `mission`, `vision` columns (mostly null, only EHG parent has values)
- `portfolios` table: has `investment_thesis`, `focus_industries`, `risk_level` — 8 portfolios exist but are demo/generic
- `ventures` table: has `portfolio_id` FK (all null), plus `time_horizon_classification`, `archetype`, `category`, `strategic_focus`, `moat_strategy` — all null
- No join table needed — ventures link directly to portfolios via FK

### EHG Mission Context
- **Current mission**: "Accelerate breakthrough ventures through AI-powered strategic guidance"
- **Current vision**: "Transform venture creation with AI executives that understand and embody company values"
- Both are operational (how EHG works), not purposive (what problems to solve). The portfolio structure would add the purposive layer.

### UI Placement
- `/chairman/vision` route already has 4 tabs: Alignment, Capabilities, Pipeline, Reviews
- Portfolio Balance would be a 5th tab
- Existing `PortfolioSummary` component shows venture stage distribution (could be extended or sibling built)
- Stack: React + Shadcn UI + Tailwind + Recharts

## Analysis

### Arguments For
1. **Capability compounding becomes visible and intentional** — today ventures are evaluated in isolation; a portfolio view shows how Cash Engine capabilities feed Capability Builders feed Moonshots
2. **Low implementation cost** — schema exists, UI pattern exists, ~2-day MVP estimate
3. **Drives better venture creation** — EVA intake can be portfolio-aware: "you have no Moonshots" becomes a prompt, not a surprise
4. **Scaffolds the later civic society aspiration** — when ready, adding mission-driven portfolios is just adding a new strategy type

### Arguments Against
1. **Premature at 7 ventures** — portfolio management overhead may exceed value at this scale
2. **Category-driven discovery can bias toward weak ventures** — "we need a Moonshot" may produce a forced idea
3. **Classification is a business judgment call** — building the UI doesn't solve the hard question of what each venture actually is

## Four-Plane Evaluation Matrix

### Plane 1: Capability Graph Impact (18/25)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| New Capability Node | 4/5 | Portfolio-aware venture evaluation is genuinely new |
| Capability Reuse Potential | 4/5 | Feeds EVA intake, Chairman UI, venture scoring (3+ consumers) |
| Graph Centrality Gain | 4/5 | Connects evaluation, capability tracking, opportunity discovery |
| Maturity Lift | 3/5 | Moderate — hardcodes taxonomy but doesn't improve underlying reliability |
| Extraction Clarity | 3/5 | Clean as API/service but taxonomy needs to stabilize first |

### Plane 2: External Vector Alignment (14/25)

| Vector | Direction | Strength | Notes |
|--------|-----------|----------|-------|
| Market Demand | Tailwind | 3/5 | Venture studios are hot; portfolio intelligence differentiates |
| Tech Cost Curve | Tailwind | 4/5 | LLM costs dropping — AI gap discovery gets cheaper |
| Regulatory | Neutral | 0 | No pressure |
| Competitive Density | Tailwind | 3/5 | Few venture factories have AI-driven portfolio balancing |
| Timing Window | Tailwind | 4/5 | Build framework now while venture count allows manual classification |

### Plane 3: Control & Constraint Exposure (PASS)

| Constraint | Exposure | Notes |
|------------|----------|-------|
| Spend Risk | Low | 2-day MVP, no external dependencies |
| Legal/Regulatory | Low | Internal tool |
| Brand Risk | Low | Chairman-only interface |
| Security/Data | Low | Reads existing data |
| Autonomy Risk | Medium | Gap-driven discovery needs human gate (EVA Stage 0 exists) |

### Plane 4: Exploration vs Exploitation (Skewed Exploitation)

Operationalizing an existing mental model, not exploring a new one. Review monthly. No auto-expiry.

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Portfolio categorization premature with only 7 ventures — overhead exceeds value at this scale. (2) "Fill the gaps" discovery inverts good venture selection — chase signal, not slots. (3) No framework for when to kill or reclassify a venture.
- **Assumptions at Risk**: (1) Growth strategy categories may not be stable or mutually exclusive — ventures shift types as they mature. (2) "Balance" metaphor from financial portfolios may be misleading — venture portfolios at EHG's scale are deeply correlated. (3) Existing DB schema may not match actual decision-making needs.
- **Worst Case**: Build a portfolio view nobody uses for actual decisions; create false urgency to fill gaps with weak ventures; add process overhead that slows validation of existing ventures.

### Visionary
- **Opportunities**: (1) Portfolio-as-Strategy-Engine — turn balance gaps into EVA intake signals, making compounding intentional. (2) Capability flow visibility across portfolio boundaries — Cash Engine capabilities feeding Moonshots creates double-ROI investments. (3) Time horizon arbitrage — 2D allocation matrix (strategy type x time horizon) reveals missed windows.
- **Synergies**: Connects to EVA Stage 0 intake, Four-Plane Evaluation Matrix (Plane 4 maps naturally to strategy types), capability gap analyzer, and Chairman vision UI.
- **Upside Scenario**: At 15-20 ventures, the system makes venture recommendations a human portfolio manager would make — but faster, with full capability-graph awareness. Portfolio strategy types become a venture factory protocol.

### Pragmatist
- **Feasibility**: 4/10 difficulty (moderate-low)
- **Resource Requirements**: Schema migration (2-4h), manual classification (1-2h), backend queries (2-4h), UI tab (4-6h). Total ~2 days.
- **Constraints**: (1) Chicken-and-egg: must decide if strategy is a portfolio property or a venture property before coding. (2) 7 ventures too few for "balance" — use gap detection, not optimization. (3) Classification taxonomy must stabilize before building.
- **Recommended Path**: Add `growth_strategy` column to ventures (simpler than restructuring portfolios) → Chairman classifies 7 ventures manually → Build PortfolioBalanceTab on VisionAlignmentPage → Add gap alerts for empty buckets.

### Synthesis
- **Consensus Points**: Classify first, build UI second. Gap detection, not optimization, at this scale. Infrastructure exists, data classification is the bottleneck.
- **Tension Points**: Build now (Visionary, Pragmatist) vs wait for more ventures (Challenger). Gap-driven discovery: powerful signal (Visionary) vs dangerous bias (Challenger).
- **Composite Risk**: Low-Medium. Engineering risk is minimal; strategic risk is that portfolio thinking distracts from individual venture validation.

## Open Questions
1. Should `growth_strategy` live on the `ventures` table (simpler) or on `portfolios` (more structured)?
2. How should the system handle ventures that change strategy type over time (Cash Engine that pivots to Moonshot)?
3. What is the minimum number of ventures per strategy bucket before "gap alerts" make sense?
4. Should EHG's top-level mission/vision be updated to reflect the current "make money + compound capabilities" priority?
5. When portfolio balance is achieved, what triggers the transition to adding civic society / social impact as a portfolio dimension?

## Suggested Next Steps
1. **Create vision and architecture documents** — formalize the portfolio balance system design
2. **Chairman classifies 7 ventures** — business judgment call, can't be automated
3. **Build as SD** — Pragmatist estimates 2-day MVP, fits cleanly in the LEO workflow
4. **Defer gap-driven discovery** — start with visibility (balance tab), add active discovery later once classification stabilizes
