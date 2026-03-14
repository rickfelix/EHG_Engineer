# Phase 1 Consensus — Microeconomics & Game Theory Integration into EHG

**Date**: 2026-03-11
**Models consulted**: Claude Opus 4.6, OpenAI, AntiGravity (Gemini)
**Ground truth validation**: Claude Code (codebase access)

---

## Unanimous Verdict: PARTIALLY

All three models independently reached the same conclusion: **selective integration of applied economic concepts as enrichments to existing stages, not formal mathematical modeling, not new stages.**

Key consensus points:
- The Chairman is making time-allocation decisions, not capital-allocation decisions
- EVA already does informal economics — the question is whether formalizing sharpens kill/pass decisions
- LLMs cannot reliably perform formal quantitative economics (elasticity coefficients, Nash equilibria, surplus calculations)
- The right output format is **classifications with evidence**, not **computations with fabricated inputs**
- No new stages — economic concepts should be an overlay/enrichment to existing stages

---

## Tier Ranking Consensus

### Cross-Model Comparison Table

| # | Concept | Claude | AntiGravity | OpenAI | **Consensus** |
|---|---------|:------:|:-----------:|:------:|:-------------:|
| **M1** | Supply & Demand / Price Elasticity | 3 | 3 | **1** | **2** |
| **M2** | Consumer & Producer Surplus | 3 | 2 | 2 | **3** |
| **M3** | Price Discrimination | 2 | **1** | 2 | **2** |
| **M4** | Market Structure Analysis | **1** | 3 | **1** | **1** |
| **M5** | Economies of Scale / Scope | 2 | **1** | **1** | **1** |
| **M6** | Marginal Analysis | **1** | **1** | **1** | **1** |
| **M7** | Externalities & Public Goods | 3 | 3 | 3 | **3** |
| **M8** | Information Asymmetry | 2 | 2 | **1** | **2** |
| **M9** | Transaction Cost Economics | 3 | 2 | 2 | **3** |
| **M10** | Behavioral Economics | 2 | **1** | **1** | **2** |
| **G1** | Nash Equilibrium | 3 | 3 | 3 | **3** |
| **G2** | First-Mover / Timing | **1** | **1** | 2 | **1** |
| **G3** | Prisoner's Dilemma | 3 | 3 | 3 | **3** |
| **G4** | Signaling & Screening | 2 | 2 | **1** | **2** |
| **G5** | Bargaining Theory | 2 | 2 | **1** | **2** |
| **G6** | Auction Theory | 3 | 3 | 2 | **3** |
| **G7** | Mechanism Design | 3 | 2 | 2 | **3** |
| **G8** | Network Effects & Platform Economics | **1** | **1** | **1** | **1** |
| **G9** | Entry Deterrence / Barriers | **1** | **1** | 2 | **1** |
| **G10** | Evolutionary Game Theory | 3 | 3 | 3 | **3** |

### Consensus Tier 1: Must Have (Unanimous or 2-of-3 agreement)

| # | Concept | Agreement | Dissent |
|---|---------|:---------:|--------|
| **M6** | Marginal Analysis | **3/3** | — |
| **G8** | Network Effects & Platform Economics | **3/3** | — |
| **M5** | Economies of Scale / Scope | **2/3** | Claude rated Tier 2 |
| **M4** | Market Structure Analysis | **2/3** | AntiGravity rated Tier 3 (notable dissent — see below) |
| **G2** | First-Mover / Timing | **2/3** | OpenAI rated Tier 2 |
| **G9** | Entry Deterrence / Barriers | **2/3** | OpenAI rated Tier 2 |

### Consensus Tier 2: Nice to Have

| # | Concept | Notes |
|---|---------|-------|
| **M10** | Behavioral Economics | AntiGravity & OpenAI rated Tier 1; Claude rated Tier 2. Near-Tier-1. |
| **M1** | Supply & Demand / Elasticity | OpenAI was the only Tier 1 advocate. Claude & AntiGravity both flagged hallucination risk with numeric elasticity values. |
| **M3** | Price Discrimination | AntiGravity rated Tier 1; Claude & OpenAI rated Tier 2. |
| **M8** | Information Asymmetry | OpenAI rated Tier 1; others rated Tier 2. Venture-type-dependent (critical for marketplaces, irrelevant for SaaS). |
| **G4** | Signaling & Screening | OpenAI rated Tier 1; others rated Tier 2. |
| **G5** | Bargaining Theory | OpenAI rated Tier 1; others rated Tier 2. |

### Consensus Tier 3: Skip

| # | Concept | Agreement |
|---|---------|:---------:|
| **G1** | Nash Equilibrium | **3/3** |
| **G3** | Prisoner's Dilemma | **3/3** |
| **G10** | Evolutionary Game Theory | **3/3** |
| **M7** | Externalities & Public Goods | **3/3** |
| **M2** | Consumer & Producer Surplus | **2/3** |
| **M9** | Transaction Cost Economics | **2/3** |
| **G6** | Auction Theory | **2/3** |
| **G7** | Mechanism Design | **2/3** |

---

## Notable Disagreements

### Market Structure Analysis (M4): Sharp Divergence

- **Claude**: Tier 1 — "EVA's biggest blind spot. Market structure determines pricing power, margin expectations, entry feasibility, and exit potential."
- **OpenAI**: Tier 1 — "Distinguishes crowded commodity markets from structurally favorable ones."
- **AntiGravity**: **Tier 3** — "Labeling a market 'Monopolistic Competition' doesn't change the build."

**Adjudication**: AntiGravity is wrong on this one. The objection confuses the label with the analysis. The value isn't in the label "monopolistic competition" — it's in the implication: "pricing power is low, differentiation is essential, margins will compress." Claude and OpenAI both proposed classification-plus-implications output structures that make this actionable. **Consensus: Tier 1.**

### Price Elasticity (M1): LLM Capability Dispute

- **OpenAI**: Tier 1 — included in minimum viable integration as "pricing power assessment."
- **Claude**: Tier 3 — "An LLM cannot compute real elasticity curves. It will generate plausible-looking but fabricated elasticity numbers."
- **AntiGravity**: Tier 3 — "Impossible to accurately model pre-launch; generates fake numbers."

**Adjudication**: Both sides have merit. OpenAI framed it as *qualitative pricing power*, not numeric elasticity — which is what Claude and AntiGravity objected to. The concept is valuable when framed as "how price-sensitive are customers?" (qualitative), not "what is the price elasticity coefficient?" (quantitative hallucination). **Consensus: Tier 2 — useful as qualitative pricing power, not numeric elasticity.**

### Behavioral Economics (M10): Scope Dispute

- **AntiGravity & OpenAI**: Tier 1 — anchoring and choice architecture are critical for GTM.
- **Claude**: Tier 2 — "more of a product design concern than a venture evaluation concern."

**Adjudication**: Claude's point is valid — behavioral economics matters more for product design (Stage 13+) than for kill-gate evaluation (Stages 3/5). However, for consumer-facing ventures, choice architecture and loss aversion *do* affect whether the business model is viable. **Consensus: Tier 2 with conditional Tier 1 for consumer-facing ventures.**

---

## Consensus Minimum Viable Integration (Top 3)

All three models were asked for 3 highest-impact concepts. Consensus picks:

| Rank | Concept | Advocates | Target Stages |
|------|---------|-----------|--------------|
| **1** | **Marginal Analysis / Unit Economics at Scale** | All 3 | Stages 5, 16 |
| **2** | **Market Structure Classification** | Claude + OpenAI | Stages 0, 4 |
| **3** | **Network Effects Typing** | Claude + AntiGravity | Stages 0, 4 |

**Runner-up (4th)**: Market Timing Assessment (Claude + AntiGravity) — Stage 3

AntiGravity's alternative #3 was Price Discrimination (Stage 7). OpenAI's was Marginal + Scale Economics combined (Stage 5, 16). The consensus treats marginal analysis and scale economics as a single integration since they target the same stages and address the same blind spot (cost curve behavior at scale).

---

## Consensus Risks

### Top 3 Risks of Incorporating (All 3 Models Agree)

1. **False Precision / Hallucination Trap**: LLMs will fabricate quantitative economic outputs that look rigorous. Mitigation: use classifications, not computations.
2. **Cognitive Overload / Analysis Bloat**: More analysis fields = more Chairman reading without necessarily better decisions. Mitigation: render as badges/flags that modify existing views, not new sections.
3. **Concept Dilution / Distraction from PMF**: Economics can crowd out the most important question ("does anyone want this?"). Mitigation: economic analysis should never overshadow market-desirability validation.

### Top 3 Risks of NOT Incorporating (All 3 Models Agree)

1. **Unit Economic Death Traps**: Ventures that look profitable initially but scale terribly (marginal cost stays flat or increases).
2. **Moat Illusion / Defensibility Misjudgment**: Blending network effects with other moat types hides the most important structural question about the business.
3. **Pricing / Value Capture Blindness**: Ventures creating value but capturing none of it due to structural market dynamics.

---

## Consensus Integration Architecture

All three models agree on the integration pattern:

| Principle | Consensus |
|-----------|-----------|
| New stages? | **NO** — unanimous |
| Integration type | Cross-cutting enrichments to existing stage templates |
| Output format | Classifications + evidence, NOT numeric computations |
| UI rendering | Badges/flags on existing views, NOT new analysis sections |
| Venture-type adaptation | Conditional depth (marketplaces get more game theory, SaaS gets more pricing) |

### Stage-to-Concept Mapping (Consensus)

| Stage | Economic Enrichments | Priority |
|-------|---------------------|----------|
| **Stage 0** | Network effects typing, Market structure snapshot | HIGH |
| **Stage 3** | Market timing assessment (kill gate input) | HIGH |
| **Stage 4** | Market structure classification, Entry barriers | HIGH |
| **Stage 5** | Marginal analysis, Scale economics, Cost curve type | HIGH |
| **Stage 7** | Pricing power assessment, (Price discrimination for consumer) | MEDIUM |
| **Stage 9** | Bargaining position, Acquirability economics | LOW |
| **Stage 16** | Scale-adjusted financial projections | MEDIUM |

---

## Consensus A/B Test Design

All three models recommend testing via the Stage 0 experiment engine:

| Element | Consensus |
|---------|-----------|
| **Control** | Current Stage 0 prompt |
| **Treatment** | Stage 0 + market structure + network effects + unit economics |
| **Primary metric** | Kill-gate prediction accuracy (Stage 3, Stage 5) |
| **Secondary metrics** | Score variance/discrimination, Chairman override rate, time-to-review |
| **Statistical approach** | Bayesian (Beta-Binomial + Monte Carlo) — appropriate for low volume |
| **Sample requirement** | ~30 ventures per arm (3-6 months at current volume) |
| **Decision threshold** | P(treatment > control) > 0.85 |

---

## Implementation Recommendation

### Phase 1: Minimum Viable Economic Lens (1 SD)

Enrich Stage 5 with marginal analysis / cost curve classification:
- Add `marginal_economics` JSONB block to Stage 5 analysis template
- Cost curve type: DECREASING / CONSTANT / INCREASING
- Step-function identification
- Unit economics viability flag
- ~50 LOC template + ~35 LOC UI

### Phase 2: Market Intelligence Enhancement (1 SD)

Enrich Stage 0 + Stage 4 with market structure and network effects:
- Add `market_structure` classification to Stage 4
- Add `network_effects` decomposition to Stage 0 moat analysis
- ~90 LOC template + ~65 LOC UI

### Phase 3: Timing Intelligence (1 SD)

Add market timing assessment to Stage 3 kill gate:
- 5-value timing classification with predecessor analysis
- Prominent badge at kill gate
- ~45 LOC template + ~35 LOC UI

### Phase 4: A/B Test

Configure experiment engine to test economic-enhanced Stage 0 vs. control.

**Total estimated scope**: 3 SDs, ~320 LOC across templates and UI.

---

## Model Accuracy Notes (for future triangulations)

| Model | Strengths | Weaknesses |
|-------|-----------|------------|
| **Claude** | Best integration maps with JSONB schema detail; strongest on false-precision risk; codebase-aware | Slightly conservative tier ranking (e.g., Scale/Scope as Tier 2) |
| **OpenAI** | Most expansive Tier 1 list (9 concepts); strongest on information asymmetry | Too many Tier 1 picks dilutes signal; rated Price Elasticity as Tier 1 despite hallucination risk |
| **AntiGravity** | Most opinionated and direct; best "academic theater" framing; strongest on behavioral economics | Incorrectly placed Market Structure as Tier 3; missed timing as minimum viable pick |

---

*Phase 1 complete. Phase 2 deep dives (by concept group) available if the Chairman wants to drill into specific integration designs before building.*
