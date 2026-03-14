# Claude Opinion — Microeconomics & Game Theory Integration into EHG

**Model**: Claude Opus 4.6 (with codebase access)
**Date**: 2026-03-11
**Role**: Independent triangulation opinion (AI #3 of 3)

---

## 1. Verdict

**PARTIALLY — Selective integration of 5-6 concepts as enrichments to existing stages, not as new stages or a formal economic framework.**

The core insight: EVA already does informal economics. The question isn't "should EHG do economics?" — it already does. The question is whether *formalizing the vocabulary and structure* of what it already does would sharpen the Chairman's kill/pass decisions. For a handful of concepts, yes — meaningfully. For most, it would be academic theater that makes the analysis look more rigorous without changing outcomes.

The Chairman is making time-allocation decisions, not capital-allocation decisions. The bar for "this analysis changed my decision" is whether it reveals something the current informal analysis misses — not whether it's theoretically complete. A solo founder doesn't need to compute Nash equilibria. He needs to know "if I enter this market, can the incumbent crush me by dropping prices 30%, and would they?"

That's game theory. But it's game theory expressed as a practical question, not a payoff matrix.

---

## 2. Tier Ranking of All 20 Concepts

### Tier 1 — Must Have (Would Change Kill/Pass Decisions)

| # | Concept | Why It Matters for EHG |
|---|---------|----------------------|
| **M4** | **Market Structure Analysis** | This is EVA's biggest blind spot. Stage 4 does "competitive landscape" but doesn't classify the *type* of market. A venture entering a monopoly market faces fundamentally different dynamics than one entering monopolistic competition. The market structure determines pricing power, margin expectations, entry feasibility, and exit potential. This should be the backbone of Stages 4-5. |
| **M6** | **Marginal Analysis** | Stage 5's P&L forecasting treats revenue and costs as linear projections. Real ventures have non-linear cost curves — the marginal cost of customer #100 vs. customer #10,000 is often dramatically different (especially SaaS vs. physical goods). This would materially improve Stage 5 and Stage 16 financial projections. |
| **G8** | **Network Effects & Platform Economics** | Stage 0's "moat architecture" score gestures at this but doesn't formalize it. For any venture with multi-sided dynamics (marketplaces, platforms, social products), this is the single most important analytical dimension. Whether a venture has direct network effects, indirect network effects, or neither changes the entire growth trajectory and defensibility assessment. Should be explicit in Stages 0, 4, and 7. |
| **G2** | **First-Mover Advantage / Timing Games** | The current pipeline doesn't systematically assess *when* to enter. For many ventures, the timing question ("is this too early, too late, or right on time?") is more important than the idea quality. This maps to Stages 3 and 5 — it should influence kill-gate decisions. |
| **G9** | **Entry Deterrence / Barriers** | Stage 0's "moat architecture" is the defense side. But EVA doesn't assess the *offense side* — what barriers exist that the venture must overcome to enter? Incumbent advantages, switching costs, regulatory capture, distribution lock-in. This is the flip side of moat analysis and it's currently missing. Stages 4 and 6. |

### Tier 2 — Nice to Have (Adds Nuance, Unlikely to Change Kill/Pass)

| # | Concept | Assessment |
|---|---------|-----------|
| **M3** | **Price Discrimination** | Useful for Stage 7 (revenue model). Most SaaS ventures already do tiered pricing, which is 3rd-degree price discrimination. Formalizing it might reveal opportunities (freemium as screening, enterprise as 1st-degree), but the Chairman likely already intuits this. |
| **M5** | **Economies of Scale / Scope** | Relevant for Stage 16 financial projections — understanding whether the cost curve bends favorably at scale. But for early-stage venture evaluation, this is usually speculative. |
| **M8** | **Information Asymmetry** | Theoretically important for marketplace and insurance ventures. In practice, the LLM will produce generic commentary about "adverse selection risks" without venture-specific insight. Better handled as a checklist item in Stage 6 risk assessment. |
| **M10** | **Behavioral Economics** | Relevant for consumer-facing ventures — understanding nudge architecture, default effects, loss aversion in pricing. But it's more of a product design concern than a venture evaluation concern. Better suited for Stage 13 (product roadmap) than kill-gate analysis. |
| **G4** | **Signaling & Screening** | Useful for Stage 9 (exit strategy) — how the venture signals value to acquirers. Also relevant for B2B ventures where the product itself is a signaling mechanism. But this is nuance on top of existing analysis, not a gap. |
| **G5** | **Bargaining Theory** | Stage 9 already does acquisition analysis. Formalizing BATNA and bargaining power would add rigor, but the Chairman isn't negotiating deals through EVA — he's deciding whether to pursue the venture at all. |

### Tier 3 — Skip (Academic Theater)

| # | Concept | Why Skip |
|---|---------|---------|
| **M1** | **Supply & Demand / Price Elasticity** | An LLM cannot compute real elasticity curves. It will generate plausible-looking but fabricated elasticity numbers. The Chairman is better served by the qualitative question "how price-sensitive are your customers?" which Stage 7 already addresses. |
| **M2** | **Consumer & Producer Surplus** | Calculating surplus requires knowing the demand curve, which the LLM doesn't have. This would produce impressive-looking surplus diagrams with made-up numbers. Worse than no analysis because it creates false precision. |
| **M7** | **Externalities & Public Goods** | Rarely relevant for commercial venture evaluation. If a venture produces significant externalities, that's a regulatory/ESG concern — not a kill/pass criterion for a solo founder. |
| **M9** | **Transaction Cost Economics** | Academically fascinating, practically irrelevant at the idea evaluation stage. Make-vs-buy and asset specificity matter for operational ventures, not for "should I pursue this idea?" decisions. |
| **G1** | **Nash Equilibrium** | This is the poster child for academic theater in venture evaluation. An LLM cannot reliably compute Nash equilibria. It will produce payoff matrices with invented numbers and declare equilibria that may not exist. The qualitative insight ("what happens when competitors react?") is already captured in competitive analysis. The formal machinery adds risk without value. |
| **G3** | **Prisoner's Dilemma / Cooperation** | Too abstract for venture-level decisions. Whether competitors cooperate on standards is an industry dynamics question, not an idea evaluation question. |
| **G6** | **Auction Theory** | Only relevant for marketplace or ad-tech ventures. Too narrow to justify pipeline-wide integration. Could be a conditional enrichment for marketplace-type ventures only. |
| **G7** | **Mechanism Design** | Requires formal mathematical reasoning that LLMs approximate poorly. Platform incentive design matters, but the LLM will produce generic advice ("align incentives with platform goals") rather than actual mechanism design. |
| **G10** | **Evolutionary Game Theory** | Interesting for academic papers about market evolution. Not actionable for "should I build this startup?" decisions. |

---

## 3. Integration Map — Tier 1 Concepts

### M4: Market Structure Analysis → Stages 4 and 5

**Current gap**: Stage 4 lists competitors but doesn't classify the market type. Two ventures with identical competitor counts can face radically different dynamics (oligopoly with price leadership vs. monopolistic competition with differentiation).

**Integration approach**: Enhance Stage 4's competitive intelligence template.

**Prompt addition**:
```
Classify this market's structure using the following taxonomy:
- MONOPOLY: Single dominant player with >70% share
- TIGHT_OLIGOPOLY: 2-4 major players control >80% of market
- LOOSE_OLIGOPOLY: 5-10 significant players, moderate concentration
- MONOPOLISTIC_COMPETITION: Many players, differentiated products, low switching costs
- NEAR_PERFECT_COMPETITION: Commoditized, price-driven, low differentiation
- EMERGING: No established players, market still forming
```

**JSONB output structure**:
```json
{
  "market_structure": {
    "classification": "TIGHT_OLIGOPOLY",
    "confidence": 0.8,
    "concentration_estimate": "Top 3 players hold ~75% market share",
    "key_evidence": ["Google and Microsoft dominate with >60% combined share", "..."],
    "implications_for_venture": {
      "pricing_power": "LOW — price-taker in oligopoly",
      "entry_feasibility": "MODERATE — differentiation niche exists",
      "expected_margin_pressure": "HIGH — incumbents can sustain price wars",
      "recommended_strategy": "DIFFERENTIATION — avoid head-to-head on price"
    }
  }
}
```

**UI rendering**: Classification badge (color-coded) + implications summary card. Could sit alongside or within the existing competitive landscape component.

---

### M6: Marginal Analysis → Stages 5 and 16

**Current gap**: Financial projections treat costs as linear or fixed-percentage. Real ventures have step functions (each new server tier, each new hire, each regulatory market).

**Integration approach**: Enhance Stage 5 and Stage 16 financial analysis templates.

**Prompt addition**:
```
For this venture's cost structure, identify:
1. The marginal cost of serving the next customer at current scale
2. The marginal cost at 10x current scale
3. Where cost step-functions occur (e.g., "need dedicated support team at 500 customers")
4. Whether marginal costs are DECREASING (software/digital), CONSTANT (services), or INCREASING (physical goods, regulated markets)
```

**JSONB output structure**:
```json
{
  "marginal_economics": {
    "cost_curve_type": "DECREASING",
    "marginal_cost_current": { "amount": 0.50, "unit": "per user/month", "components": ["hosting", "API calls"] },
    "marginal_cost_at_scale": { "amount": 0.08, "unit": "per user/month", "scale": "100K users" },
    "step_functions": [
      { "trigger": "1000 users", "cost_jump": "Dedicated support hire (~$60K/yr)", "impact": "MODERATE" },
      { "trigger": "10000 users", "cost_jump": "Infrastructure tier upgrade (~$2K/mo)", "impact": "LOW" }
    ],
    "unit_economics_viable": true,
    "breakeven_inflection": "~2000 paying users at $10/mo"
  }
}
```

**UI rendering**: Cost curve visualization showing marginal cost trajectory, with step-function markers highlighted. Integrates into existing financial projection charts.

---

### G8: Network Effects & Platform Economics → Stages 0, 4, and 7

**Current gap**: Stage 0 scores "moat architecture" as a single number. This conflates network effects (which create winner-take-all dynamics) with other moat types (brand, IP, regulatory) that behave completely differently.

**Integration approach**: Decompose the moat architecture score in Stage 0 and add a dedicated network effects assessment.

**Prompt addition**:
```
Assess this venture's network effect profile:
- DIRECT_STRONG: Each new user directly increases value for all users (e.g., messaging apps)
- DIRECT_WEAK: Some user-to-user value but not dominant driver (e.g., productivity tools with sharing)
- INDIRECT_STRONG: Two-sided market where each side attracts the other (e.g., marketplaces, platforms)
- INDIRECT_WEAK: Mild cross-side benefits but not primary value driver
- DATA_NETWORK: More users → more data → better product (e.g., recommendation engines, maps)
- LOCAL_NETWORK: Network effects limited to geography or community (e.g., local marketplaces)
- NONE: Value is independent of user count

If network effects exist, assess:
1. Strength of cold-start problem (how hard is it to reach critical mass?)
2. Multi-homing risk (can users easily use competing platforms simultaneously?)
3. Winner-take-all likelihood (does this market naturally consolidate to 1-2 players?)
```

**JSONB output structure**:
```json
{
  "network_effects": {
    "primary_type": "INDIRECT_STRONG",
    "secondary_type": "DATA_NETWORK",
    "cold_start_severity": "HIGH",
    "cold_start_strategy": "Seed supply side with curated providers, subsidize early demand",
    "multi_homing_risk": "MODERATE — users can list on multiple platforms",
    "winner_take_all": false,
    "winner_take_all_reasoning": "Local service markets tend to support 2-3 players due to geographic fragmentation",
    "network_effect_score": 7,
    "moat_contribution": "PRIMARY — network effects are the dominant defensibility mechanism"
  }
}
```

**UI rendering**: Network effect type badge + cold-start severity indicator + winner-take-all assessment. Could be a sub-section of Stage 0's moat analysis or a standalone card in Stage 4.

---

### G2: First-Mover / Timing Analysis → Stages 3 and 5

**Current gap**: The pipeline evaluates whether an idea is *good* but not whether *now* is the right time. Many good ideas fail because they're 3 years early or 2 years late.

**Integration approach**: Add timing assessment to Stage 3 (comprehensive validation) and factor into Stage 5 kill gate.

**Prompt addition**:
```
Assess market timing for this venture:
- TOO_EARLY: Enabling technology/infrastructure/regulation not yet ready. Customers don't know they need this yet.
- EARLY_BUT_VIABLE: Market is nascent but sufficient infrastructure exists to build. First-mover advantage possible.
- RIGHT_ON_TIME: Market inflection point — demand emerging, technology ready, few established players.
- LATE_BUT_DIFFERENTIATED: Established market but clear differentiation opportunity remains.
- TOO_LATE: Market saturated, incumbents entrenched, differentiation insufficient.

Provide evidence for your timing assessment:
1. What enabling conditions exist today that didn't 2 years ago?
2. What conditions are still missing that would make this easier 2 years from now?
3. Are there failed predecessors? Why did they fail — bad idea or bad timing?
4. Is there a specific catalyst (regulatory change, technology release, cultural shift) creating a window?
```

**JSONB output structure**:
```json
{
  "market_timing": {
    "assessment": "EARLY_BUT_VIABLE",
    "confidence": 0.7,
    "window_status": "OPENING",
    "enabling_conditions_present": [
      "LLM APIs commercially available since 2023",
      "Enterprise AI budget allocation growing 40% YoY"
    ],
    "conditions_still_missing": [
      "Regulatory framework for AI-generated content unclear",
      "Enterprise procurement cycles for AI tools still 6-12 months"
    ],
    "failed_predecessors": [
      { "name": "ExampleCo (2019)", "failure_reason": "TIMING — GPT-2 wasn't reliable enough for production use" }
    ],
    "catalyst": "GPT-4 class models reaching commodity pricing in 2025-2026",
    "first_mover_value": "MODERATE — fast-follower can copy features but not data/network advantages",
    "recommended_timing": "Enter now, iterate fast. 18-month window before large incumbents integrate equivalent features."
  }
}
```

**UI rendering**: Timing badge (color-coded from green "RIGHT_ON_TIME" to red "TOO_LATE") + window status indicator + predecessor analysis. This should appear prominently at Stage 3 kill gate.

---

### G9: Entry Barriers (Offense Side) → Stages 4 and 6

**Current gap**: Stage 0 evaluates "moat architecture" (the venture's *own* defensive barriers) but doesn't assess the barriers the venture must *overcome* to enter. This is the offense-defense asymmetry: a market might be easy to defend once you're in, but incredibly hard to enter.

**Integration approach**: Add entry barrier assessment to Stage 4, feed into Stage 6 risk matrix.

**Prompt addition**:
```
Assess the barriers this venture must overcome to enter this market:

For each barrier, classify severity (LOW / MODERATE / HIGH / PROHIBITIVE):
1. Capital requirements — How much funding to reach minimum viable presence?
2. Regulatory/compliance — Licenses, certifications, legal requirements?
3. Switching costs — How hard is it to move customers from incumbents?
4. Distribution access — Can the venture reach customers, or do incumbents control channels?
5. Technical complexity — Is there a hard technology problem to solve first?
6. Brand/trust requirements — Do customers require established brand/track record?
7. Data/content moat — Do incumbents have proprietary data the venture can't replicate?
8. Talent requirements — Does this require rare specialized expertise?
```

**JSONB output structure**:
```json
{
  "entry_barriers": {
    "overall_difficulty": "MODERATE",
    "barriers": [
      { "type": "switching_costs", "severity": "HIGH", "detail": "Enterprise contracts lock customers for 12-24 months" },
      { "type": "distribution_access", "severity": "MODERATE", "detail": "App store discovery is possible but expensive ($5-8 CPA)" },
      { "type": "capital_requirements", "severity": "LOW", "detail": "MVP buildable with <$50K, cloud-native" },
      { "type": "regulatory", "severity": "LOW", "detail": "No licenses required in target verticals" }
    ],
    "highest_risk_barrier": "switching_costs",
    "mitigation_available": true,
    "mitigation_strategy": "Target companies at contract renewal — build migration tooling as competitive weapon"
  }
}
```

**UI rendering**: Barrier severity heatmap alongside the existing competitive landscape. Each barrier row with severity badge + mitigation status.

---

## 4. Top 3 Risks of Incorporating Formal Economics

### Risk 1: False Precision Poisoning Decision Quality

The most dangerous outcome is not that the analysis is wrong — it's that it *looks right*. When an LLM produces a number labeled "price elasticity: -1.3" or "consumer surplus: $45M," those numbers are fabricated with no empirical basis. But they appear in a structured JSONB field, rendered in a professional UI, alongside real numbers from financial projections. The Chairman cannot distinguish LLM-fabricated economic metrics from data-driven financial projections.

**Mitigation**: Never ask the LLM for specific numeric economic values (elasticity coefficients, surplus amounts, equilibrium prices). Ask for *classifications* and *qualitative assessments* with evidence requirements. The Tier 1 concepts above are all structured as classification tasks (TIGHT_OLIGOPOLY, DECREASING cost curve, EARLY_BUT_VIABLE timing), not numeric computation.

### Risk 2: Concept Dilution and Cognitive Overload

The pipeline already produces substantial analysis at each stage. Adding 5 new analytical dimensions means more content for the Chairman to review at each kill gate. If the economic analysis doesn't clearly surface as "here's the one thing that changes your decision," it becomes noise that makes the existing signal harder to find.

**Mitigation**: Economic insights should be rendered as prominent badges/flags that modify existing analysis, not as separate analysis sections. "Market Structure: TIGHT OLIGOPOLY — pricing power is low" is a flag on the competitive landscape, not a new section. The Chairman should see modified conclusions, not additional reading.

### Risk 3: Implementation Complexity and Maintenance Burden

Each new analytical dimension requires: prompt engineering, JSONB schema design, UI component, testing, and ongoing prompt maintenance as LLM capabilities change. Five Tier 1 concepts = 5x this effort. The engineering cost is real and competes with other pipeline improvements.

**Mitigation**: Implement as enrichments to existing stage templates, not as new components. The JSONB fields nest inside existing stage analysis objects. UI rendering can extend existing components rather than creating new ones. Start with the minimum viable integration (see section 6).

---

## 5. Top 3 Risks of NOT Incorporating Formal Economics

### Risk 1: Market Structure Blindness (Active Blind Spot)

This is the most consequential gap. EVA currently treats all competitive landscapes as equivalent — it lists competitors and assesses relative strengths. But a venture entering a tight oligopoly needs a fundamentally different strategy than one entering a fragmented market. Without market structure classification, EVA might recommend "compete on features" in a market where the only viable strategy is "compete on niche differentiation" or "don't enter at all." This can produce false positives at kill gates — ventures that look viable in a generic competitive analysis but are entering markets with structural dynamics that make success improbable.

### Risk 2: Timing Misjudgment (Silent Killer)

The pipeline evaluates *what* the venture does but not *when* it enters. Timing is the most common posthumous explanation for startup failure ("great idea, wrong time"). Without explicit timing analysis, the pipeline has no mechanism to surface "this idea will work in 3 years but not today" — which is a fundamentally different assessment than "this idea won't work." The Chairman might kill a good idea (bad timing reads as bad idea) or pursue a good idea too early (no signal that enabling conditions aren't yet present).

### Risk 3: Network Effects Misclassification (Moat Mirage)

The current "moat architecture" score blends network effects with other defensibility types. A venture might score 7/10 on moat architecture because it has strong IP and brand potential — but zero network effects. Meanwhile, a different venture scores 7/10 because it has strong network effects but nothing else. These are *radically different* businesses with different growth trajectories, funding requirements, and failure modes. Without decomposing network effects from other moat types, the Chairman is making decisions on a blended score that hides the most important structural question about the business.

---

## 6. Minimum Viable Integration — Top 3 Concepts

If implementing exactly 3 concepts, these have the highest impact-to-complexity ratio:

### 1. Market Structure Classification (M4) → Stage 4

**Why first**: Lowest implementation complexity (it's a classification task — LLMs are good at this), highest decision impact (changes how you interpret everything downstream), and directly addresses the biggest analytical blind spot.

**Implementation sketch**:
- Add market structure classification block to Stage 4 analysis template
- 6-value enum: MONOPOLY, TIGHT_OLIGOPOLY, LOOSE_OLIGOPOLY, MONOPOLISTIC_COMPETITION, NEAR_PERFECT_COMPETITION, EMERGING
- Render as a prominent badge on the competitive landscape page
- Include 3-sentence implication summary ("In a tight oligopoly, new entrants typically need...")
- Estimated effort: ~40 LOC template change, ~30 LOC UI component enhancement

### 2. Network Effects Typing (G8) → Stage 0

**Why second**: Decomposes the most important sub-dimension of moat architecture. Forces the LLM to be specific about *what kind* of defensibility the venture has, which is more actionable than a blended moat score.

**Implementation sketch**:
- Add network effects sub-assessment to Stage 0 scoring template
- 7-value classification + cold-start severity + winner-take-all boolean
- Render as a sub-card within the moat architecture section of Stage 0
- Can also be surfaced at Stage 4 as a cross-reference
- Estimated effort: ~50 LOC template change, ~40 LOC UI component

### 3. Market Timing Assessment (G2) → Stage 3

**Why third**: Addresses the "silent killer" blind spot. Timing is the one dimension that can turn a PASS into a KILL or vice versa — and the pipeline currently has no mechanism to surface it. Also a classification task (LLM-friendly).

**Implementation sketch**:
- Add timing assessment block to Stage 3 comprehensive validation template
- 5-value enum: TOO_EARLY, EARLY_BUT_VIABLE, RIGHT_ON_TIME, LATE_BUT_DIFFERENTIATED, TOO_LATE
- Render as a prominent badge at the Stage 3 kill gate, alongside existing validation scores
- Include predecessor analysis (failed similar ventures and why)
- Estimated effort: ~45 LOC template change, ~35 LOC UI component

**Total estimated effort for all 3**: ~240 LOC across templates and UI — fits within a single SD per concept or a small orchestrator.

---

## 7. A/B Test Design

The experiment engine's Bayesian framework is well-suited to test whether economic analysis improves kill-gate prediction.

### Test Structure

**Control**: Current Stage 0 scoring prompt (no formal economics)
**Treatment**: Stage 0 prompt enhanced with:
- Market structure classification (M4)
- Network effects typing (G8)
- Market timing assessment (G2)

### What to Measure

**Primary metric**: Kill-gate prediction accuracy — does the enhanced Stage 0 score better predict which ventures survive to Stage 5? To Stage 13?

**Secondary metrics**:
- Score discrimination: Does the treatment group produce a wider spread of scores (better separation between good and bad ventures)?
- Decision change rate: In what percentage of cases does the economic analysis produce a *different* recommendation than the control?
- Chairman override rate: Does the Chairman override EVA more or less often when economic analysis is present?

### Design Considerations

**Sample size**: At 5-20 ventures/month, reaching statistical significance will take 3-6 months. The Beta-Binomial model with Monte Carlo simulation is the right approach — it handles small samples better than frequentist methods.

**Assignment**: Random assignment at venture creation — each new venture gets control or treatment Stage 0 prompt.

**Blinding**: The Chairman should NOT know which ventures got the enhanced analysis at Stage 0 when making kill-gate decisions (to avoid bias). The economic insights should be evaluated post-hoc: "ventures that received economic analysis at Stage 0 were killed 20% earlier" or "ventures that survived with economic analysis had 15% higher post-launch viability."

**Confounds to watch for**:
- Venture quality variance (small sample means a few unusually good/bad ventures can skew results)
- Temporal effects (market conditions change over the 3-6 month test period)
- Chairman learning effects (the Chairman may internalize economic thinking and apply it even to control ventures)

**Decision criterion**: Using the existing Bayesian framework, declare the treatment superior if P(treatment > control) > 0.85 after minimum 30 ventures per arm (approximately 3-6 months at current volume).

---

## Summary

EHG should selectively integrate 5 economic concepts as enrichments to existing stages — not as new stages, not as a comprehensive economic framework, and not with fabricated quantitative outputs. The three highest-impact additions (market structure, network effects typing, market timing) are all classification tasks that LLMs handle well, address real analytical blind spots, and can be A/B tested through the existing experiment engine.

The cardinal sin to avoid: producing numbers that look rigorous but aren't. Every economic integration should produce *classifications with evidence*, not *computations with fabricated inputs*. "This is a tight oligopoly" is actionable. "Price elasticity is -1.3" is a hallucination dressed in a lab coat.
