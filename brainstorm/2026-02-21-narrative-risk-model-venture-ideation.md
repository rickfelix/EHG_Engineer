# Brainstorm: Narrative Risk Model for Venture Ideation

## Metadata
- **Date**: 2026-02-21
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (cross-cutting model improvement)
- **Related Brainstorms**:
  - "Research Department as Internal EHG Service" (2026-02-21, needs_triage)
  - "Building deep domain expertise into EHG venture ideation" (2026-02-21, needs_triage)

---

## Problem Statement

EHG's venture ideation pipeline (10-component synthesis engine, financial kill gates, portfolio scoring) evaluates ventures on capability, financials, market fit, and timing — but has no mechanism to assess whether the *perceived demand* driving a venture concept is organic or narrative-manufactured. Ventures built on hype cycles, panic narratives, or manufactured urgency face structural risks that financial models alone cannot detect: inflated TAM, temporary demand spikes, and assumption fragility.

The proposal is to add **Narrative Risk (NR)** as a new dimension in the venture evaluation process — starting as an 11th synthesis component at Stage 0, using LLM reasoning over the venture brief itself.

## Discovery Summary

### User's Core Insight
Treat this as "Narrative Risk & Signal Intelligence" — a way to distinguish real demand from manufactured perception. The business value is:
- Fewer hype-chasing ventures (higher survival rate)
- Better market timing (enter after narrative distortion subsides)
- Calmer product design (avoid urgency-inflated specs)
- Cleaner demand attribution (separate organic from narrative-amplified inbound)
- Portfolio-wide early warning (which ventures are exposed to the same narrative?)

### Narrative Risk (NR) KPI Definition
**Composite score: 0-100** derived from 4 sub-dimensions:

| Component | Original Weight | Recommended Weight* | Measures |
|-----------|:--------------:|:-------------------:|----------|
| Influence Exposure (IE) | 35% | 15% | Presence of coordinated/amplified narratives |
| Demand Distortion (DD) | 30% | 30% | Would customers still want this without the narrative? |
| Hype-Persistence (HP) | 20% | 20% | Does attention decay faster than problem relevance? |
| Decision Sensitivity (DS) | 15% | 35% | How badly would this venture suffer if sentiment flipped? |

*Weights rebalanced per Challenger critique: vulnerability matters more than exposure.

### NR Governance Bands
| NR Score | Band | Interpretation |
|----------|------|----------------|
| 0-24 | NR-Low | Structural, durable demand |
| 25-49 | NR-Moderate | Watch assumptions |
| 50-69 | NR-High | Timing & scope risk |
| 70-100 | NR-Critical | Narrative-fragile |

### NR Volatility (NR-V) — Future KPI
Measures rate and amplitude of NR change over time. Requires time-series data (multiple NR evaluations per venture). Not included in MVP but designed for Research Department integration.

### Data Source Strategy
- **Phase 1 (MVP)**: LLM reasoning over the venture brief using model training knowledge only
- **Phase 2**: Research Department domain knowledge enrichment
- **Phase 3**: External data feeds (news APIs, social monitoring, trend databases)

---

## Analysis

### Arguments For
1. **Unique competitive position** — No venture studio systematically asks "is this demand real?" before committing capital
2. **Near-zero implementation cost** — One crew config file (~80-120 LOC) following existing synthesis patterns
3. **Natural Research Department first instrument** — Gives the planned department a measurable, continuous output from day one
4. **Plugs a real gap in kill gates** — Stage 5 is purely financial; NR adds exogenous demand risk
5. **Portfolio-level risk visibility** — Even as advisory, NR across 8-12 ventures reveals correlated narrative exposure

### Arguments Against
1. **No ground truth, ever** — NR can never be empirically validated against an objective baseline; it's LLM opinion about epistemology
2. **Bias-reproducing detector** — LLMs trained on internet narratives may systematically over/under-score based on training data density, not actual risk
3. **False precision risk** — Governance bands and hard gates create appearance of rigor around uncalibrated scores
4. **Weight dilution** — Adding NR to weighted composite reduces influence of empirically-grounded components

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. NR has no ground truth and never will — scores are unfalsifiable
  2. Conflates narrative exposure (market is noisy) with narrative vulnerability (this venture breaks if narrative shifts)
  3. LLM training data biases reproduce the very narrative distortion NR claims to detect
- **Assumptions at Risk**:
  1. "NR ≤ 50 for two cycles" assumes scores are stable, but Research Department corpus changes will cause drift
  2. Adding unvalidated signal to weighted score may reduce decision quality
  3. Governance bands assume NR is continuous and meaningful across its range — no calibration data exists
- **Worst Case**: NR blocks good ventures in well-known domains (over-scrutinized by LLM) while providing false assurance in obscure ones (under-represented in training data). Synthesis engine credibility degrades.

### Visionary
- **Opportunities**:
  1. Epistemic immune system — NR tracks what the market is being told to believe, complementing Golden Nuggets which track what the team believes
  2. Kill gate prediction gains exogenous demand risk input — "will this venture's demand survive narrative decay?"
  3. Research Department's first live instrument — creates the proactive scanning operating model
- **Synergies**:
  - Evaluation profiles: NR slots into existing weights JSONB as a new key
  - Venture archetypes: NR benchmarks will vary by archetype (AI wrapper vs compliance automation) — archetype-specific calibration
  - Venture briefs: NR becomes sibling to existing chairman_constraint_scores
  - Portfolio risk: Flags correlated narrative exposure across multiple ventures
  - Golden Nuggets: Assumptions can be tagged "narrative-sensitive" for enhanced validation
- **Upside Scenario**: By venture #10, Research Department has accumulated NR history across domains. New ventures get scored against proprietary empirical data on narrative behavior in specific markets. NR becomes a reusable cognitive primitive — any decision influenced by market narratives benefits.

### Pragmatist
- **Feasibility**: 3/10 (low difficulty — clean extension point)
- **Resource Requirements**: 1-2 sessions, ~80-120 LOC, no new DB tables, no external APIs
- **Constraints**:
  1. Prompt engineering is the real work — plan 2-3 revision cycles against known ventures
  2. Profile weight system needs investigation for dynamic component addition
  3. NR-V time-series is separate Tier 3 scope
- **Recommended Path**: Ship crew config → calibrate against 3-5 known ventures → iterate prompt → future SDs for NR-V and dashboard

### Synthesis
- **Consensus Points**: Architecture is ready, MVP is small, prompt design is the real work, NR-V is separate scope
- **Tension Points**: Ground truth problem (unfalsifiable scores); LLM bias as detector; hard gates on soft scores
- **Composite Risk**: Medium-Low (engineering near-zero, epistemological risk real but designable)

---

## Design Responses to Key Critiques

### 1. Advisory First, Gating Later
Ship NR as a displayed signal (separate card in DecisionQueuePanel), NOT folded into the weighted composite score initially. The Chairman sees it, reasons about it, but it doesn't mechanically alter the venture score. Hard gates only after calibration against 5-10 ventures with known outcomes.

### 2. Vulnerability Over Exposure
Reweight sub-dimensions: Decision Sensitivity from 15% → 35%, Influence Exposure from 35% → 15%. The question "if the narrative shifts, does THIS venture break?" matters more than "is the market noisy?"

### 3. Bias Disclosure
NR output includes a `confidence_caveat` field acknowledging LLM training data may affect scoring. Ventures in well-represented domains (AI, crypto, sustainability) may receive systematically different scores than niche domains. This prevents false confidence.

### 4. Archetype-Specific Calibration
Different venture archetypes have structurally different NR baselines. An AI wrapper archetype has inherently higher narrative exposure than a compliance automation archetype. Archetype-specific NR benchmarks prevent penalizing ventures for being in well-narrated domains.

---

## Minimum Viable Implementation

### What Ships (Tier 2, ~80-120 LOC)
1. New file: `narrative-risk.ts` following existing crew pattern in `evaTaskContracts.ts`
2. Register in `CREW_REGISTRY` (~10 lines)
3. Wire into `STAGE_CO_EXECUTION_MAP` at Stage 2 (~1 line)
4. LLM prompt scores 4 sub-dimensions, returns `{nr_score, nr_band, component_scores, narrative_flags[], confidence, confidence_caveat}`
5. Output appears in Chairman's `DecisionQueuePanel` as advisory signal
6. No new DB tables — synthesis scores stored as JSONB on existing records

### What Does NOT Ship Initially
- NR in the weighted composite score (advisory only)
- NR as a hard gate (no automatic blocking)
- NR Volatility (NR-V) time-series tracking
- External data feed integration
- Portfolio-level NR dashboard
- The 10-agent pipeline architecture

### Calibration Plan
- Run NR against 3-5 existing ventures with known outcomes
- Adjust prompt rubric based on whether scores match intuitive risk levels
- 2-3 prompt revision cycles expected

---

## Full Vision (Future SDs)

### Phase 2: Research Department Integration
- NR scoring queries Research Department's accumulated domain knowledge
- "Have we seen this narrative pattern before?" enriches scoring
- NR becomes the department's first continuous measurement instrument

### Phase 3: NR Volatility (NR-V)
- Time-series tracking of NR across re-evaluation cycles
- NR-V = rate and amplitude of NR change
- Scaling requires both NR ≤ 50 AND NR-V ≤ 30

### Phase 4: Portfolio Dashboard
- Chairman view: NR vs NR-V scatter, trend lines, heat map
- Automated alerts: NR crosses 50, NR-V spikes, correlated exposure
- Capital rebalancing intelligence

### Phase 5: NR as Gating Threshold
- Hard gates only after calibration against 10+ ventures
- Governance bands become enforceable policy (EHG-POL-NR-001)

### Phase 6: External Data Enrichment
- News APIs, social monitoring, trend databases
- SOURCE_INGESTOR → CORPUS_NORMALIZER pipeline
- 10-agent architecture for full automation

### Phase 7: NR as External Product
- Narrative Risk Intelligence (B2B) for investors, founders, strategy teams
- Decision Hygiene Tools — "Are we reacting to reality or narrative?"
- AI Governance & Trust Products — influence-aware decision engines

---

## Agent Architecture (Full Vision, Phase 6+)

| Agent | Role | EHG Plane |
|-------|------|-----------|
| SOURCE_INGESTOR | Pull content into normalized corpus | EXEC |
| CORPUS_NORMALIZER | Clean, chunk, embed, enrich | EXEC |
| SIGNAL_DETECTOR | Semantic clustering, burst detection, timing entropy | EXEC |
| RUBRIC_SCORER | 10-dimension scoring + AI signals | PLAN |
| ALT_HYPOTHESIS_ANALYST | Pressure-test benign explanations (anti-paranoia circuit) | PLAN |
| GOVERNANCE_CLASSIFIER | F0-F3 flags + restrictions | LEAD |
| MONITOR_AGENT | NR trend, NR-V, drift, re-burst events | EXEC |
| PORTFOLIO_DASHBOARDER | Chairman view across ventures | EXEC |
| GATE_ENFORCER | Policy engine for scaling gates | LEAD |
| AUDIT_LOGGER | Immutable evidence bundles + decision logs | EXEC |
| BASELINE_CALIBRATOR | Domain/platform-specific "normal" baselines | PLAN |
| VENTURE_ASSUMPTION_TAGGER | Inject NR/NR-V into SD/PRD assumptions | PLAN |

---

## Open Questions
1. **What weight should NR receive if/when it enters the composite score?** Start at 0 (advisory) — but what's the threshold for "calibrated enough" to earn weight?
2. **How do we measure NR accuracy retroactively?** Can we track which NR-flagged assumptions actually proved fragile?
3. **Should archetype-specific NR baselines be hand-tuned or learned?** Hand-tuned is faster; learned requires venture outcome data.
4. **Does NR apply to the brainstorm phase itself?** The brainstorm evaluation (Four-Plane Matrix) could incorporate NR before a venture even reaches Stage 0.

## Suggested Next Steps
1. **Create an SD** for the MVP (Tier 2): narrative-risk.ts crew config + prompt + DecisionQueuePanel advisory display
2. **Calibrate prompt** against 3-5 known ventures before shipping
3. **Scope future SDs** for NR-V, dashboard, and Research Department integration as separate work items
