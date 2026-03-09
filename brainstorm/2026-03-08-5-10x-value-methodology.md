# Brainstorm: 5-10X Value vs Competition Methodology

## Metadata
- **Date**: 2026-03-08
- **Domain**: Integration
- **Phase**: MVP (formalizing value multiplier assessment into existing opportunity/portfolio pipeline)
- **Mode**: Conversational (autonomous — chairman asleep, EVA proceeding)
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: EHG_Engineer (opportunity scoring, portfolio optimization, stage gates)
- **Source**: Chairman final cut — item retained from SD-RESEARCH-VENTURE_ECONOMICS-20260309-003

---

## Problem Statement
EHG's venture factory evaluates opportunities across 6 weighted dimensions (market opportunity, competitive advantage, feasibility, evidence strength, time-to-value, risk-adjusted) and classifies them into Green/Yellow/Red execution boxes. Stage gates enforce kill decisions at stages 3, 5, 13, and 23. Portfolio optimization balances resource allocation. But nowhere in this pipeline does the system formally quantify *how much more value* an EHG venture delivers compared to the competition. The "5-10X" claim — that EHG ventures should deliver 5-10X the value of incumbent solutions — exists as a strategic narrative but not as a measurable, enforceable dimension. Ventures pass scoring gates without proving they deliver disproportionate value. The gap-analyzer identifies competitive gaps but doesn't translate those gaps into a value multiplier. Financial contracts track unit economics but don't anchor them against competitor baselines.

## Discovery Summary

### Existing Infrastructure (Key Finding)
The Pragmatist's exploration revealed substantial existing infrastructure that the value methodology can extend:

**Opportunity Scoring Pipeline:**
- **Gap Analyzer** (`lib/discovery/gap-analyzer.js`, 343 LOC): 6 dimensions (features, pricing, segments, experience, integrations, quality) with epistemic classification (FACT/ASSUMPTION/SIMULATION/UNKNOWN). Calculates gap scores with impact/timing bonuses and difficulty penalties.
- **Opportunity Scorer** (`lib/discovery/opportunity-scorer.js`, 394 LOC): 6 weighted dimensions — market_opportunity (0.25), competitive_advantage (0.20), feasibility (0.15), evidence_strength (0.20), time_to_value (0.10), risk_adjusted (0.10). Three-box classification (Green/Yellow/Red). Auto-approval at 85%+ confidence.

**Venture Lifecycle Infrastructure:**
- **Moat Architecture** (`lib/eva/stage-zero/synthesis/moat-architecture.js`, 109 LOC): 7 moat types — data_moat, automation_speed, vertical_expertise, network_effects, switching_costs, design_moat, agent_consumability. Outputs primary/secondary moats with compounding trajectory and vulnerability analysis.
- **Stage Gates** (`lib/agents/modules/venture-state-machine/stage-gates.js`, 704 LOC): Kill gates at stages 3, 5, 13, 23. Promotion gates at 16, 17, 22. Artifact-based gates for financial viability (5→6), UAT signoff (21→22), deployment health (22→23).
- **Financial Contract** (`lib/eva/contracts/financial-contract.js`, 276 LOC): Tracks capital_required, cac_estimate, ltv_estimate, unit_economics, pricing_model. Consistency thresholds: WARN at >20% deviation, BLOCK at >50%.

**Portfolio Intelligence:**
- **Cross-Venture Learning** (`lib/eva/cross-venture-learning.js`, 612 LOC): Kill-stage frequency analysis, failed assumption patterns, success patterns. Hybrid semantic+keyword search across ventures. Assumption calibration analysis.
- **Portfolio Optimizer** (`lib/eva/portfolio-optimizer.js`, 524 LOC): 5 signal weights (urgency 0.30, roi 0.25, financial 0.20, market 0.15, health 0.10). Contention detection/resolution, provider boost for platform ventures, portfolio balance enforcement (40% cap).

**Existing Value References (unstructured):**
- "10x cheaper than" narrative in seed models (pricing anchoring)
- "10x cost reduction" in bull case scenarios
- "5.76x performance advantages" in AI agent orchestration
- Sensitivity multiplier (1x-10x) in listening radar
- These references are narrative, not structural — no formal scoring dimension

### What Must Be Built
- **Value multiplier scoring dimension** in OpportunityScorer (7th dimension)
- **Competitive value comparator service** anchoring EHG venture value against competitor baselines
- **5-10X gate** in stage-gates.js (enforce at key stages: post-discovery, pre-build, pre-launch)
- **Value decay monitoring** detecting when competitive advantage erodes over time
- **Portfolio value dashboard** surfacing value multiplier across all active ventures

## Analysis

### Arguments For
- Extensive infrastructure already exists — gap analysis, opportunity scoring, moat architecture, stage gates all built and production-ready
- Missing piece is surgical: add value_multiplier as 7th dimension in OpportunityScorer and wire it to stage gates
- Forces disciplined thinking about competitive differentiation early in venture lifecycle
- Portfolio-level visibility into which ventures deliver disproportionate value vs which are incrementally better
- Financial contract infrastructure already tracks unit economics — anchoring against competitors is a natural extension
- Cross-venture learning can identify which value multiplier strategies actually worked (calibration feedback loop)

### Arguments Against
- **"5-10X" is unmeasurable before building**: Value is emergent — you can't score what doesn't exist yet. Multiplier frameworks create false precision around inherently uncertain predictions
- **Survivorship bias in the 10X narrative**: Successful companies are described as "10X" retroactively. Using this as a forward-looking gate kills ideas that don't "look 10X" on paper but become 10X through iteration
- **The denominator problem**: Competitor value delivery is unknowable with precision. You're dividing by an estimate, multiplying the uncertainty
- **Selection bias toward hype over substance**: Framework rewards ventures that claim large multipliers (AI-powered, platform effects) over boring-but-profitable businesses (better execution, niche focus)
- **Framework could kill promising ideas**: Ventures in their infancy often look "1.5X better" — the 10X emerges after product-market fit through compounding effects. Early-stage gates would kill them
- **Opportunity cost of measurement**: Time spent estimating value multipliers is time not spent building. For a venture factory, velocity matters more than precision

## Integration: Data Quality/Coverage Analysis

| Dimension | Score |
|-----------|-------|
| Data Quality | 7/10 (Strong quantitative infrastructure: 6-dim gap scoring, 6-dim opportunity scoring, financial contracts with deviation thresholds) |
| Coverage | 6/10 (Good scoring pipeline but no competitive baseline anchoring, no value multiplier dimension) |
| Edge Cases | 4 identified |

**Edge Cases**:
1. **No competitor data available** (Common) — New market categories where there are no direct competitors. Value multiplier against what baseline? Need fallback to "improvement over status quo" scoring.
2. **Value multiplier varies by segment** (Moderate) — A venture might be 10X for SMBs but 1.5X for enterprise. Which segment's multiplier is the score?
3. **Temporal value decay** (Common) — Competitors copy features, AI commoditizes capabilities. A 10X advantage at launch becomes 2X within 18 months. Snapshot scoring misses the trajectory.
4. **Intangible value components** (Moderate) — Design quality, brand trust, community — real value that resists quantification. Framework might systematically undervalue these.

## Team Perspectives

### Challenger
- **Blind Spots**: (1) "5-10X" is unmeasurable before building — value is emergent from customer interaction, not predictable from spreadsheets; framework creates false precision around inherently uncertain predictions (2) Survivorship bias — successful companies are described as "10X" retroactively, using this forward-looking kills ideas that iterate into greatness (3) The denominator problem — competitor value is unknowable with precision, dividing by an estimate multiplies uncertainty (4) Selection bias toward hype — rewards AI/platform narrative over boring-but-profitable execution plays
- **Assumptions at Risk**: (1) "Value is measurable pre-build" — only post-launch customer behavior reveals true value (2) "10X ventures are identifiable early" — research shows most successful products pivoted from their original thesis (3) "Quantifying value prevents bad bets" — it filters for confidence, not for insight (4) "Competitors' value delivery is knowable" — public data captures features, not the full user experience
- **Worst Case**: Framework kills 3 promising ideas that "only" look 2X. One of those would have iterated into a market leader. Meanwhile, the venture that scored 12X on paper fails because its multiplier was based on AI hype assumptions. The framework creates a false sense of rigor while actually reducing the portfolio's optionality. Engineering time building the measurement system would have been better spent building products.

### Visionary
- **Opportunities**: (1) value_multiplier as 7th dimension in OpportunityScorer — surgical addition to existing weighted scoring (2) Unfair advantage as computable property: moat_score × market_gap × execution_feasibility → value multiplier estimate with confidence intervals (3) Continuous value erosion monitoring — detect when competitive advantage decays, trigger strategic responses before it's too late (4) Integration with brainstorm pipeline — 10X assessment before full team analysis saves resources on incremental ideas (5) Design quality as measurable component of value multiplier — connects to design-as-competitive-advantage initiative (6) Portfolio value heat map for chairman — color-coded view of which ventures justify continued investment
- **Synergies**: Gap Analyzer (competitive gaps → value multiplier inputs), Moat Architecture (moat strength feeds multiplier durability), Financial Contract (unit economics anchor the economic multiplier), Cross-Venture Learning (calibrate multiplier estimates against actual outcomes), Portfolio Optimizer (value multiplier as additional signal weight), Stage Gates (5-10X gate at critical lifecycle points)
- **Upside Scenario**: Within 6 months — every venture has a quantified value multiplier with confidence intervals, updated monthly. Portfolio optimizer uses value multiplier as highest-weight signal. Two ventures redirected from "2X incrementalism" to genuine 10X opportunities. Chairman dashboard shows portfolio value heat map. Cross-venture learning calibrates estimates against outcomes, improving prediction accuracy over time. Investor narrative: "We don't build products — we build 10X value multipliers, and we can prove it."

### Pragmatist
- **Feasibility**: 7/10 — Strong existing foundation (OpportunityScorer dimensions, gap analysis, moat architecture, stage gates). Missing piece is the value_multiplier dimension and competitive baseline service. Moderate complexity but high infrastructure reuse.
- **Resource Requirements**: 4-phase implementation over ~8 weeks. Phase 1 (value dimension): 2 weeks. Phase 2 (competitive baselines): 2 weeks. Phase 3 (stage gate integration): 2 weeks. Phase 4 (dashboard + monitoring): 2 weeks.
- **Constraints**: (1) Competitive baseline data quality varies wildly — some markets have public pricing/feature data, others don't; (2) Value multiplier confidence degrades rapidly for pre-revenue ventures; (3) OpportunityScorer weights must be rebalanced when adding 7th dimension; (4) Stage gate integration requires careful threshold tuning to avoid killing viable ventures
- **Recommended Path**: Start with value_multiplier as a scoring dimension (Phase 1) — it's additive and non-breaking. Then build competitive baselines (Phase 2). Only after calibrating against real outcomes should you wire it into kill gates (Phase 3). Dashboard last (Phase 4). Use as lens first, gate later.

### Synthesis
- **Consensus Points**: (1) Existing infrastructure is strong — 2,962 LOC across 7 files provides a solid foundation (all 3 agree); (2) value_multiplier should be a scoring dimension, not just a narrative (Pragmatist + Visionary); (3) Must start as a lens/measurement before becoming a gate (Challenger + Pragmatist agree — avoid premature kill decisions)
- **Tension Points**: (1) Challenger argues value is emergent and unmeasurable pre-build vs Visionary sees it as computable from existing signals; (2) Challenger warns about selection bias for hype vs Visionary sees this as addressable via evidence_strength weight; (3) Pragmatist recommends phased approach (dimension → baseline → gate → dashboard) vs Visionary wants full integration immediately
- **Composite Risk**: Medium — strong existing foundation reduces technical risk, but the methodological risk (can you meaningfully estimate value multipliers?) is the strategic wildcard. Pragmatist's phased approach mitigates this by treating early phases as hypothesis validation.

## Open Questions
- Should value multiplier be a kill gate or an advisory signal? (Consensus: start as advisory, graduate to gate after calibration)
- How do you handle ventures in new categories with no direct competitors? (Proposed: "improvement over status quo" fallback)
- What confidence threshold is required before value multiplier affects portfolio allocation?
- Should the multiplier be a point estimate or a range (e.g., 3-7X) with confidence intervals?
- How often should value multiplier be recalculated as the competitive landscape shifts?

## Suggested Next Steps
1. Create SD(s) from this brainstorm with vision-key and arch-key linkage
2. Architecture suggests a single SD — adding value_multiplier dimension is additive to existing infrastructure, not a new system
3. Phase the implementation: scoring dimension first (non-breaking), competitive baselines second, gate integration third (after calibration data exists)
4. Connect to cross-venture learning for outcome calibration (did estimated multipliers match reality?)
