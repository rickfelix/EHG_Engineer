# Brainstorm: Exponential Prediction — Frontier AI Capability Trajectory Model

## Metadata
- **Date**: 2026-02-21
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (cross-cutting capability)
- **Related SDs**:
  - `SD-LEO-FEAT-TECHNOLOGY-TRAJECTORY-MODEL-001` (draft) — directly enhanced by this brainstorm
  - `SD-LEO-FIX-BRAINSTORM-NARRATIVE-RISK-001` (draft) — sequencing dependency
- **Related Brainstorms**:
  - "Model Library for Venture Ideation — Macro Analytical Frameworks" (2026-02-21, Ready for SD) — parent concept
  - "Narrative Risk Model for Venture Ideation" (2026-02-21, Ready for SD) — adjacent synthesis component
  - "Dual Strategy — Outbound Venture Positioning + Inbound Capability Building" (2026-02-21, Needs Triage)

---

## Problem Statement

EHG evaluates ventures on 10 internal dimensions plus financial forecasting, but all evaluation is static — assessing where enabling technology IS, not where it WILL BE. Human intuition extrapolates linearly from prior experience. AI progress is exponential. This mismatch means EHG risks building for today's limitations instead of tomorrow's capabilities, and waiting when speed would win.

The core metaphor: "Skate to where the hockey puck will be, not where it is now." EHG needs an organizational capability to project frontier AI model improvements on exponential curves and plan 6 months ahead, informing build-vs-wait decisions, venture timing windows, and internal capability investment.

## Discovery Summary

### Scope Decision
Enhance the existing draft SD (`SD-LEO-FEAT-TECHNOLOGY-TRAJECTORY-MODEL-001`) rather than creating a separate capability. The Technology Trajectory synthesis component already applies Kurzweil/Gartner/S-curve frameworks — the enhancement shifts it from "where is this technology now?" to "where will it be in 6 months, projected on an exponential curve?"

### Capability Axes to Track
All three major frontier AI capability axes together:
1. **Reasoning & Autonomy** — how capable AI agents become at autonomous multi-step tasks (directly affects what EHG can build)
2. **Cost Deflation Curves** — how quickly inference/training costs drop (affects unit economics of every AI venture)
3. **Multimodal Expansion** — vision, audio, video, code generation capabilities expanding (opens new venture categories)

### Decisions Informed
- **Build vs Wait**: Should we build X now, or will AI capabilities in 6 months make it trivial/obsolete?
- **Venture Timing Windows**: Which ventures should we accelerate because their enabling tech is about to cross a capability threshold?
- **Capability Investment**: What EHG internal capabilities should we invest in now to be ready for what's coming?

### Data Source (MVP)
LLM reasoning only — using the model's training knowledge about AI progress trends. No real-time signal pipeline for MVP. This keeps implementation simple and ships faster while still capturing exponential intuition.

### Uncertainty Handling
Bull/base/bear confidence bands for each capability axis. Three scenarios force explicit assumption-stating rather than hiding uncertainty behind a single number.

---

## Analysis

### Arguments For
1. **Structural blind spot is real** — 10 components evaluate the venture from the inside; zero project where enabling technology will be. This is the biggest gap in the synthesis engine.
2. **The hockey-puck metaphor is the right frame** — linear extrapolation of AI capabilities leads to building for today's limitations. Exponential modeling, even imperfect, shifts the conversation to "what will be possible?"
3. **Bull/base/bear bands are honest** — instead of a single prediction, scenario bands force the Chairman to make an explicit judgment about which future he's betting on. Better epistemics than "trust my gut."
4. **MVP is tiny** — ~100-120 LOC, existing synthesis pattern, 1 day of work. Excellent risk/reward ratio.
5. **Feeds three in-flight systems** — Domain Intelligence gets macro context, Narrative Risk gets timing credibility signals, Research Department gets standing research briefs.

### Arguments Against
1. **LLM predicting LLMs is circular** — the model's training data is a lagging indicator by definition. It cannot extrapolate beyond its knowledge cutoff. "Exponential prediction via LLM reasoning" may be confident narrative generation, not actual curve projection.
2. **Punctuated vs smooth progress** — frontier AI capabilities jump at model release events (GPT-5, etc.), not on smooth curves. A 6-month projection will be wrong at exactly the moments that matter most.
3. **Decision-laundering risk** — structured outputs with confidence bands look data-backed. When the projection is wrong, post-mortems will blame execution, not the model. The system fails silently.
4. **Cost and capability are conflated** — GPT-3.5 got 100x cheaper, but that doesn't mean frontier reasoning became available. The model must separate these axes clearly or produce misleading timing recommendations.
5. **Wait-bias on exponential curves** — the model may systematically recommend "wait" (because AI will be better/cheaper in 6 months) in exactly the conditions where first-mover advantage is decisive.

---

## Four-Plane Evaluation Matrix

### Plane 1: Capability Graph Impact — 22/25

| Dimension | Score | Rationale |
|-----------|:-----:|-----------|
| New Capability Node | 5/5 | "Exponential forward projection" is entirely new. No EHG component projects where technology will be. |
| Capability Reuse Potential | 5/5 | Build-vs-wait gate, venture timing queue, capability investment planning, brainstorm sessions, kill gates, Research Department briefs. 6+ consumers. |
| Graph Centrality Gain | 4/5 | Connects synthesis engine → investment planning → Research Department → Domain Intelligence. Thickens core reasoning graph. |
| Maturity Lift | 4/5 | Forces scenario-based thinking across the entire ideation pipeline. Bull/base/bear bands raise analytical rigor everywhere. |
| Extraction Clarity | 4/5 | Clean JS module, standard synthesis interface. 3-axis × 3-scenario output is portable to any consumer. |

### Plane 2: External Vector Alignment — +18/25

| Vector | Direction | Strength | Rationale |
|--------|-----------|:--------:|-----------|
| Market Demand Gradient | Tailwind | 5/5 | Every venture studio, corporate VC, and LP is asking "when will AI do X?" — the question this answers. |
| Technology Cost Curve | Tailwind | 5/5 | LLMs make this feasible at near-zero marginal cost. The technology being predicted enables the prediction. |
| Regulatory Trajectory | Neutral | 0/5 | Internal tooling, no regulatory exposure. |
| Competitive Density | Tailwind | 4/5 | No venture studio has systematized exponential capability projection with calibrated scenario bands. |
| Timing Window | Tailwind | 4/5 | 2024-2026 = maximum AI capability uncertainty. Exponential models are most valuable when linear prediction fails. |

Primary Tailwind: Market demand — universal need for "when will AI be capable of X?"
Primary Headwind: None significant. Epistemological limit (LLM predicting successors) is a design challenge, not market headwind.

### Plane 3: Control & Constraint Exposure — PASS

| Exposure Type | Level | Assessment |
|---------------|:-----:|-----------|
| Spend Risk | Low | Incremental LLM tokens only. Same API pipeline as existing synthesis. |
| Legal / Regulatory Risk | Low | Internal tooling using public frameworks. |
| Brand Risk | Low | Internal decision support, caught by Chairman review. |
| Security / Data Risk | Low | No new attack surface. No external data feeds at MVP. |
| Autonomy Risk | Medium | Key risk: confidently wrong timing projections trusted by Chairman. Mitigated: advisory weight (0.05-0.08), confidence bands, honest labeling, no hard gating. |

Kill-switch: Component disableable in synthesis/index.js. Weight settable to 0.

### Plane 4: Exploration vs Exploitation — Skewed Exploration

| Parameter | Value |
|-----------|-------|
| Dial Position | Skewed Exploration |
| Review Interval | After 5 venture evaluations with exponential projection active |
| Auto-expiry | 90 days from ship date |
| Graduation Criteria | ≥2 of 5 ventures: Chairman reports projection bands influenced timing decision |
| Exploitation Trigger | Graduate → increase weight, add calibration feedback loop, consider real-time signal feeds |

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. **LLM predicting LLM problem**: The system uses an LLM to predict frontier AI trajectories, but LLM training data is a lagging indicator. Predictions are structurally indistinguishable from hallucination — confident-sounding pattern-matched narrative generation, not actual curve projection.
  2. **Decision frame is backwards for exponential curves**: "Build now vs wait 6 months" assumes waiting is safe. On exponential curves, waiting when a competitor moves now means permanent market position loss. The model risks recommending "wait" in exactly the conditions where first-mover advantage is decisive.
  3. **Cost and capability are different signals**: Cost deflation (GPT-3.5 got 100x cheaper) and capability improvement (frontier reasoning) are not the same curve. A venture needing cheap frontier-level capability faces a gap window neither curve alone captures.
- **Assumptions at Risk**:
  1. "Human intuition is linear, so the model adds value over intuition" — only true if model predictions are better calibrated than expert intuition. LLMs' confidence bands are aesthetically reasonable but epistemically arbitrary.
  2. "6 months is the right horizon" — frontier AI shifts are punctuated (model release events), not smooth. Wrong at exactly the moments that matter.
  3. "Output informs without becoming the decision" — structured confidence bands look like data-backed decisions. Decision-laundering: human judgment exits the loop, accountability doesn't follow.
- **Worst Case**: EHG accelerates ventures based on capability projections that are coherent but wrong. Structured outputs suppress internal review. Post-mortems blame execution, not the model. System fails quietly and repeatedly with institutional cover.

### Visionary
- **Opportunities**:
  1. **Timing arbitrage as differentiator**: A calibrated trajectory model gives EHG a systematic timing edge — identifying when capabilities cross from "demo" to "deployable." Reframes EHG's pitch: the studio that times entries with quantified confidence, not intuition.
  2. **Build-vs-wait as productized decision engine**: Bull/base/bear bands are immediately actionable internally, but the logic could become an external "venture timing intelligence" service for other studios and corporate VCs.
  3. **Capability-gated venture intake**: Ventures blocked on capabilities that are 3-6 months from threshold get flagged with estimated unlock dates instead of rejections. The pipeline extends into the future with structured re-entry points.
- **Synergies**:
  - **Narrative Risk**: Trajectory bands feed credibility timing — when the venture's story becomes believable to the market, not just to EHG
  - **Domain Intelligence**: Cross-references domain readiness against capability unlock timing for high-conviction entry signals
  - **Research Department**: Trajectory model creates standing research briefs; Research validates bull vs base scenarios with real-world signals. Self-reinforcing intelligence loop.
- **Upside Scenario**: After 2-3 calibration cycles, EHG holds a proprietary dataset: predicted capability curves vs observed curves, annotated with venture outcomes. This becomes "epistemic infrastructure" — the ability to reason about technology windows with demonstrable precision. Attracts better founders (who want timing intelligence), better LPs (who want quantified risk), and acquisition interest (from platforms wanting to internalize the timing layer). The bull scenario band is EHG's thesis that the market hasn't priced in.

### Pragmatist
- **Feasibility**: 3/10 (straightforward — pattern exists, design decided, ~100-120 LOC)
- **Resource Requirements**: 2-4 hours implementation, 1 engineer, zero incremental cost
- **Constraints**:
  1. Sequencing: must check Narrative Risk SD status — touching synthesis/index.js simultaneously creates merge conflicts
  2. Advisory weight discipline: must stay 0.05-0.08 at MVP regardless of output quality appearance
  3. Stub a data-feed interface: even if unused, the hook point prevents rewrite when upgrading to real-time signals later
- **Recommended Path**: Check sd:next for Narrative Risk status. If clear runway: Day 1 = write crew config + 3-axis projection logic + wire into synthesis/index.js. End of Day 1 = shippable PR. Total: 1 working day.

### Synthesis
- **Consensus Points**: Architecture is ready. Prompt engineering is the real work. Phased approach essential. Advisory weight is critical.
- **Tension Points**: "Epistemic infrastructure" vs "decision laundering" — bias vs moat. "Timing arbitrage" vs "LLM predicting LLM" — alpha vs consensus. Wait-bias vs first-mover urgency on exponential curves.
- **Composite Risk**: Medium (engineering low, epistemological high, mitigated by design)

---

## Design Responses to Challenger Critiques

### 1. LLM Predicting LLM → Honest Framing + Stubbed Upgrade Path
Label outputs as "framework-informed projections" not "predictions." Include confidence_caveat in every output. Stub a data-feed interface so real-time signals (benchmarks, release cadences, pricing) can be injected in Phase 2 without rewrite.

### 2. Wait-Bias → Explicit First-Mover Signal
The prompt must include a "competitive timing" dimension alongside capability projection. Not just "when will X be possible?" but "when will competitors be able to build X?" — if the answer is "also in 6 months," the recommendation flips from wait to accelerate.

### 3. Decision Laundering → Forced Assumption Disclosure
Each scenario band must state its key assumption explicitly: "Bull case assumes: [specific capability milestone] ships by [date]." The Chairman must agree with or reject the assumption, not just consume the scenario number.

### 4. Punctuated Progress → Event-Triggered Re-evaluation
Include a "next expected disruption event" field (e.g., "GPT-5 expected Q3 2026"). When that event occurs, the Research Department triggers a re-run of all active venture projections against the new reality.

### 5. Cost vs Capability Conflation → Separate Axes, Separate Scenarios
The three axes (reasoning/autonomy, cost deflation, multimodal) are explicitly separated with independent bull/base/bear bands. The system surfaces the gap window explicitly: "Frontier reasoning improves (bull) but cost deflation lags (base) → capability available but not economically viable for 12 months."

---

## Enhancement to Existing SD

The following changes should be incorporated into `SD-LEO-FEAT-TECHNOLOGY-TRAJECTORY-MODEL-001`:

### Current SD Scope (unchanged)
- `tech-trajectory.js` synthesis component following existing pattern
- Kurzweil/Gartner/S-curve frameworks
- Advisory weight 0.05-0.08
- Wired into synthesis/index.js

### Enhancements from This Brainstorm
1. **Shift from "where is" to "where will be"** — projection-forward, not assessment-backward
2. **Three explicit capability axes**: reasoning/autonomy, cost deflation, multimodal expansion
3. **Bull/base/bear confidence bands** per axis with explicit assumptions stated
4. **6-month projection horizon** as default (configurable)
5. **Competitive timing dimension** — "when will competitors also be able to build this?"
6. **Forced assumption disclosure** — each scenario states its key assumption for Chairman to accept/reject
7. **Next disruption event field** — identifies the upcoming model release or capability shift that would invalidate projections
8. **Stubbed data-feed interface** — no-op parameter for future real-time signal injection
9. **Separate axes, separate scenarios** — explicitly surfaces capability/cost gap windows

### Output Schema (Enhanced)
```javascript
{
  component: 'tech_trajectory',
  projection_horizon: '6_months',
  axes: {
    reasoning_autonomy: { bull: {...}, base: {...}, bear: {...}, key_assumption: '...' },
    cost_deflation: { bull: {...}, base: {...}, bear: {...}, key_assumption: '...' },
    multimodal: { bull: {...}, base: {...}, bear: {...}, key_assumption: '...' }
  },
  competitive_timing: { window_status: 'opening|closing|contested', first_mover_signal: '...' },
  next_disruption_event: { event: '...', expected_date: '...', impact_if_occurs: '...' },
  gap_windows: ['...'],  // where capability and cost curves diverge
  confidence_caveat: 'Framework-informed projection via LLM reasoning. Not equivalent to empirical forecasting.',
  summary: '...'
}
```

---

## Open Questions
1. **How should the system handle model release events?** Should the Research Department auto-trigger re-evaluation of all active venture projections when a major model release occurs?
2. **What is the right counterweight to exponential optimism?** Kurzweil's acceleration should be paired with S-curve plateau risk and capability ceiling arguments.
3. **Should trajectory projections feed into financial modeling?** Currently modeling.js generates TAM/SAM/SOM independently. Cost deflation projections could adjust revenue model assumptions.
4. **How do we prevent "always wait" bias?** The competitive timing dimension helps, but needs careful prompt engineering to avoid systematic caution.
5. **When should we upgrade to real-time signals?** After how many ventures / how much calibration data should the stubbed data-feed interface become active?

## Suggested Next Steps
1. **Update existing SD** (`SD-LEO-FEAT-TECHNOLOGY-TRAJECTORY-MODEL-001`) with the enhanced scope from this brainstorm — particularly the 3-axis projection, confidence bands, and competitive timing dimension
2. **Check Narrative Risk sequencing** — confirm it's not in active EXEC before starting
3. **Implement MVP** — ~100-120 LOC, 1 working day, advisory weight 0.07
4. **Calibrate on 3-5 known ventures** — do the projection bands change synthesis narrative meaningfully?
5. **Review at 90 days** — did the Chairman use projection bands in timing decisions for ≥2 of 5 ventures?
