<!-- Archived from: brainstorm/2026-02-21-model-library-venture-ideation-macro-frameworks.md -->
<!-- SD Key: SD-LEO-FIX-BRAINSTORM-MODEL-LIBRARY-001 -->
<!-- Archived at: 2026-02-22T01:37:40.645Z -->

# Brainstorm: Model Library for Venture Ideation — Macro Analytical Frameworks

## Metadata
- **Date**: 2026-02-21
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (cross-cutting model improvement)
- **Related Brainstorms**:
  - "Narrative Risk model for venture ideation" (2026-02-21, Ready for SD)
  - "Research Department as Internal EHG Service" (2026-02-21, needs_triage)
  - "Building deep domain expertise into EHG venture ideation" (2026-02-21, needs_triage)
- **Source Material**: YouTube playlist "Models" — 92 curated videos representing macro intellectual frameworks

---

## Problem Statement

EHG's venture ideation pipeline evaluates ventures on 10 internal dimensions (moat, archetype, virality, build cost, portfolio fit, time horizon, design, etc.) plus horizontal financial forecasting (TAM/SAM/SOM, revenue projections, unit economics). All 10 synthesis components and the forecasting module evaluate the venture *from the inside out* — capabilities, economics, execution.

**What's entirely absent is the outside-in perspective.** No component evaluates the macro forces acting *on* the venture: economic cycles, technology trajectory curves, societal dynamics, or strategic positioning within civilizational-scale shifts. Ventures are evaluated in a vacuum where the world is static.

The Chairman intuitively applies these macro frameworks during review — drawing on mental models from Dalio (economic machine), Kurzweil (accelerating returns), Hagens (superorganism/energy), Leyden (great progression), and others. But this knowledge is tacit, inconsistent, and not scalable. The proposal is to codify these frameworks as **active synthesis components** — named models that automatically reason with macro intellectual frameworks during venture evaluation.

## Discovery Summary

### What the Chairman Wants
- **Active models/agents**, not passive reference material
- Models that automatically contribute macro perspective to venture evaluation
- Four model families: Economic Cycles, Technology Trajectories, Societal/Systemic Dynamics, Strategic Thinking
- Coverage across the entire analytical foundation: synthesis components, financial modeling, and mental models broadly

### The Gap (All Four Dimensions)
1. **Macro awareness**: System evaluates ventures in isolation from the forces that will make or break them
2. **Predictive models**: System scores snapshots but can't project how macro forces affect venture trajectories
3. **Worldview diversity**: System uses one implicit worldview; these videos represent alternative mental models
4. **Signal detection**: System doesn't scan for the signals these thinkers discuss (narrative shifts, exponential curves, systemic risk)

### Source Material: 92 Curated Videos
The Chairman's YouTube playlist "Models" contains 92 videos spanning:
- **Economic cycle models**: Ray Dalio (economic machine, debt cycles), Steve Eisman (market themes), Cathie Wood (technology deflation), yield curve analysis, private credit dynamics
- **Technology trajectory models**: Ray Kurzweil (law of accelerating returns, singularity by 2045), Peter Diamandis (AI/robotics milestones), Wes Roth (AI development), Marc Andreessen (AI boom), exponential growth theory
- **Societal/systemic models**: MIT 1972 collapse study ("on schedule"), Nate Hagens (superorganism, quadruple bifurcation), attention economy, Kessler syndrome, demographic shifts, fascism indicators, immigration reshaping M&A
- **Strategic thinking models**: Inversion (thinking backwards), hero's journey, mental models for prompting, Nick Hanauer (capitalism reframe), Simon Sinek (creating change), psychology theories

### Current Architecture (for context)
- **10-component synthesis engine** (`lib/eva/stage-zero/synthesis/index.js`): cross-reference, portfolio evaluation, problem reframing, moat architecture, chairman constraints, time horizon, archetypes, build cost, virality, design evaluation
- **Horizontal forecasting** (`lib/eva/stage-zero/modeling.js`): LLM-driven TAM/SAM/SOM, revenue projections, unit economics
- **Evaluation profiles**: Weighted scoring across components via `profile-service.js`
- **Component pattern**: `export async function analyzeX(pathOutput, deps) → { component, scores, summary }`
- **In-flight additions**: Narrative Risk (11th component, brainstormed), Research Department (intelligence backbone, brainstormed), Domain Intelligence System (SD in planning)

---

## Analysis

### Arguments For
1. **Structural blind spot**: 10 components evaluate the venture internally; zero evaluate the world acting on it. Economic cycles, technology trajectories, and societal forces will make or break ventures regardless of moat or virality scores.
2. **Architecture is ready**: One new JS module per family, following existing synthesis pattern. ~1 day per component, ~1 week total for all 4.
3. **Compounding value via feedback loops**: If model predictions are tracked against venture outcomes, EHG builds proprietary evidence about which frameworks are predictive in which domains. Not replicable.
4. **Connects three in-flight initiatives**: Narrative Risk gets a theoretical backbone, Research Department gets model-directed scanning queries, Domain Intelligence gets macro context injection.
5. **Cognitive commons**: Models become a shared reasoning layer callable from brainstorm sessions, kill gates, portfolio reviews — not just Stage 0.
6. **Technology moment**: LLMs are uniquely suited to synthesizing macro frameworks. This was impossible 3 years ago, feasible today at near-zero marginal cost.

### Arguments Against
1. **Preference laundering**: The 92 videos are one person's intellectual comfort zone. Without counterweight frameworks (degrowth, skeptics of technological solutionism), the system amplifies the Chairman's existing biases rather than challenging them.
2. **Framework conflict is unresolved**: Dalio (cyclical reversion) directly contradicts Kurzweil (exponential escape). Running both simultaneously produces either averaged mush or arbitrary dominance. No arbitration mechanism proposed.
3. **False rigor**: LLM-powered "Dalio analysis" is a prompt rubric inspired by Dalio, not Dalio's framework actually analyzing the venture. The label implies more depth than the implementation delivers.
4. **Marginal signal questionable at early stage**: Macro positioning matters less than execution risk and unit economics for ventures that haven't yet validated demand.
5. **Model staleness**: Many frameworks are time-bound claims calibrated on past eras. Encoding them as active models embeds implicit assumptions about what era those worldviews were formed in.

---

## Four-Plane Evaluation Matrix

### Plane 1: Capability Graph Impact — 21/25

| Dimension | Score | Rationale |
|-----------|:-----:|-----------|
| New Capability Node | 5/5 | Entirely new — "macro-contextual reasoning." No existing component evaluates external forces. |
| Capability Reuse Potential | 5/5 | Callable from brainstorm sessions, kill gates, portfolio reviews, Research Department, Narrative Risk. 5+ consumers. |
| Graph Centrality Gain | 4/5 | Thickens core: synthesis engine, Research Department, evaluation profiles all gain connections. |
| Maturity Lift | 3/5 | Forces calibration rigor (tracking predictions vs outcomes), lifting evaluation system maturity. |
| Extraction Clarity | 4/5 | Clean JS module per model family, standard interface. Extractable as standalone API. |

### Plane 2: External Vector Alignment — +16/25

| Vector | Direction | Strength | Rationale |
|--------|-----------|:--------:|-----------|
| Market Demand Gradient | Tailwind | 4/5 | Post-2022 rate shock, post-AI disruption — macro awareness in high demand across investment landscape. |
| Technology Cost Curve | Tailwind | 5/5 | LLMs make macro framework synthesis feasible at pennies per evaluation. The enabling moment is now. |
| Regulatory Trajectory | Neutral | 0/5 | Internal tooling, no compliance implications. |
| Competitive Density | Tailwind | 3/5 | No venture studio has systematized named macro model reasoning. Novel intersection. |
| Timing Window | Tailwind | 4/5 | 2024-2026 = highest macro uncertainty + first tools capable of reasoning about it. |

Primary Tailwind: Technology cost curve
Primary Headwind: None significant

### Plane 3: Control & Constraint Exposure — PASS

| Exposure Type | Level | Assessment |
|---------------|:-----:|-----------|
| Spend Risk | Low | Incremental LLM token costs only. |
| Legal / Regulatory Risk | Low | Internal tooling. Public intellectual frameworks. |
| Brand Risk | Low | Internal decision support, caught by Chairman review. |
| Security / Data Risk | Low | No new attack surface. Existing LLM pipeline. |
| Autonomy Risk | Medium | Confidently wrong macro analysis trusted by Chairman. Mitigated: advisory weighting, conflict surfacing, outcome tracking. |

Kill-switch: Components disableable in synthesis/index.js. Profile weights settable to 0.

### Plane 4: Exploration vs Exploitation — Skewed Exploration

| Parameter | Value |
|-----------|-------|
| Review interval | After 5 venture evaluations with first model component |
| Auto-expiry | 90 days from first component ship |
| Graduation criteria | ≥2 of 5 ventures show materially changed synthesis narrative |
| Exploitation trigger | First component graduates → build remaining 3 |

---

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Model staleness — frameworks are time-bound claims, not timeless principles. Dalio's debt cycle model was calibrated on 20th-century credit markets.
  2. Confirmation architecture — 92 videos represent the Chairman's curated worldview, not a balanced epistemological set. System becomes preference laundering.
  3. Framework conflicts are hidden, not resolved — Dalio (cyclical) contradicts Kurzweil (exponential). Simultaneous active models produce contradictory scores with no arbitration.
- **Assumptions at Risk**:
  1. "Active reasoning" vs weighted scoring — realistic implementation is prompt rubrics, not genuine framework application
  2. Macro models may add noise, not signal, at early stage where execution risk dominates
  3. Research Department data quality dependency — if Research ingests bad signals, every model reasons confidently in the wrong direction
- **Worst Case**: System becomes a sophisticated rationalization engine. Produces confidently wrong advice that feels intellectually rigorous, suppresses the Chairman's natural skepticism, and removes the friction that previously caught bad ideas early. The system replaces judgment with the Chairman's own biases reflected back through intellectual authority.

### Visionary
- **Opportunities**:
  1. Civilizational timing layer — external coordinate system for where ventures sit relative to macro forces that amplify or annihilate them
  2. "Model as Lens" architecture — reusable cognitive primitive callable by any EHG system with a macro question (kill gates, portfolio reviews, brainstorms)
  3. Intellectual differentiation as moat — the Chairman's epistemic fingerprint becomes a computable, evidence-accumulating proprietary asset
- **Synergies**:
  - Narrative Risk: attention economy model provides theoretical backbone for NR sub-dimensions
  - Research Department: models become query templates for directed scanning ("scan for Dalio debt cycle signals")
  - Domain Intelligence: macro context injection alongside domain context in brainstorm sessions
  - Kill Gate Prediction: macro stress-test dimension ("how vulnerable is revenue to credit contraction?")
- **Upside Scenario**: By venture #10, eight named models calibrated against prior outcomes. New brainstorm sessions receive automatic macro-contextual analysis (economic cycle headwinds, technology trajectory windows, societal inertia signals). Chairman makes better go/no-go decisions in one session than most studios make after three months of diligence. Feedback loops reveal which frameworks are predictive in which domains — proprietary, non-replicable knowledge.

### Pragmatist
- **Feasibility**: 6/10 (architecture favorable, prompt engineering is the hard part)
- **Resource Requirements**: 1 day per component, 2-3 days total MVP (1 component + calibration), 1 week for all 4
- **Constraints**:
  1. Prompt quality is the entire job — value lives in framework encoding, not code
  2. Sequence after Narrative Risk and Domain Intelligence SDs to avoid pipeline conflicts
  3. Evaluation profile weight redistribution needed — 4 new components dilute existing 10
- **Recommended Path**: Build 1 component first (Technology Trajectory — most structured framework). Wire into synthesis with small weight (0.05-0.08). Validate on 2-3 real ventures. Gate: does output change synthesis narrative meaningfully? If yes → build remaining 3.

### Synthesis
- **Consensus Points**: Prompt engineering is the real work. Phased approach essential. Architecture is ready.
- **Tension Points**: "Preference laundering" vs "epistemic fingerprint" (bias vs moat). "Rationalization engine" vs "civilizational timing layer" (worst case vs best case). Signal vs noise at early stage.
- **Composite Risk**: Medium (engineering low, epistemological high, mitigated by design)

---

## Design Responses to Key Critiques

### 1. Preference Laundering → Include Counterweight Models
Don't just encode the Chairman's favored frameworks. Include at least one "counterweight lens" per family — e.g., degrowth economics alongside Kurzweil's acceleration, systemic resilience alongside Dalio's cycles. The most valuable output is when models disagree.

### 2. Framework Conflict → Surface Contradictions as a Feature
When Dalio says headwind and Kurzweil says tailwind, the system should explicitly surface the contradiction: "MACRO TENSION: Economic cycle model flags credit tightening headwind; technology trajectory model flags optimal entry window. Chairman: which force dominates for this venture?" Contradictions are the highest-value signal, not a bug to average away.

### 3. False Rigor → Honest Labels
Output is labeled "framework-informed analysis" not "Dalio's analysis." Each output includes a confidence_caveat: "This analysis applies [framework name] reasoning to the venture brief via LLM interpretation. It is not equivalent to the framework author's direct analysis."

### 4. Advisory First → Low Weight, High Visibility
Ship as advisory signals (separate from weighted composite score) until calibration data exists. Chairman sees macro model outputs but they don't mechanically alter the venture score. Hard weighting only after 5+ ventures show predictive signal.

### 5. Outcome Tracking → Feedback Loops
Track model predictions against venture outcomes. After each venture passes a kill gate (or fails one), retrospectively evaluate: "Did the macro model signals hold?" This builds the proprietary evidence trail the Visionary describes.

---

## Proposed Model Families (MVP Candidates)

### Family 1: Technology Trajectory Model (RECOMMENDED FIRST)
**Frameworks**: Kurzweil's Law of Accelerating Returns, Gartner Hype Cycle, S-curve adoption
**Evaluates**: Is the technology prerequisite for this venture mature, emerging, or speculative? Where on the adoption curve? Is the timing window opening or closing?
**Why first**: Most structured frameworks with measurable indicators. Least contested epistemologically.

### Family 2: Economic Cycle Model
**Frameworks**: Dalio's economic machine (debt cycles, deleveraging), yield curve signals, credit cycle phase
**Evaluates**: Where are we in the economic cycle? How does cycle phase affect this venture's revenue model, fundraising environment, and customer willingness to pay?
**Prompt challenge**: Cycle position assessment without real-time economic data (MVP uses LLM training knowledge).

### Family 3: Societal Dynamics Model
**Frameworks**: MIT 1972 Limits to Growth, Hagens' superorganism, attention economy, demographic shifts
**Evaluates**: Is this venture aligned with or opposed to deep societal currents? Does it depend on behavioral patterns that are under stress? How resilient is the demand signal to societal disruption?
**Prompt challenge**: Most abstract family. Hardest to make actionable without veering into speculation.

### Family 4: Strategic Positioning Model
**Frameworks**: Inversion (thinking backwards from failure), first-principles reasoning, competitive dynamics, network effects theory
**Evaluates**: Has this venture been stress-tested through inversion? What does the pre-mortem look like? Where are the non-obvious competitive dynamics?
**Note**: Overlaps somewhat with existing moat architecture and problem reframing components. May be a synthesis enhancement rather than a new component.

---

## Minimum Viable Implementation

### What Ships (Tier 3 SD — Full SD, ~200-300 LOC across 4 files)
1. `lib/eva/stage-zero/synthesis/tech-trajectory.js` — Technology Trajectory Model component
2. Register in `synthesis/index.js` alongside existing 10 components
3. Wire into `Promise.all` with graceful fallback (same pattern as existing components)
4. Evaluation profile update: add `tech_trajectory` weight key (advisory: 0.05-0.08)
5. LLM prompt encodes Kurzweil acceleration, Gartner hype cycle, S-curve positioning
6. Output: `{ component, trajectory_phase, timing_window, adoption_position, confidence, confidence_caveat, contradictions[], summary }`

### What Does NOT Ship Initially
- Economic Cycle, Societal Dynamics, or Strategic Positioning models (wait for first component validation)
- Hard gating based on macro model scores
- Model conflict arbitration engine
- External data feed integration
- Counterweight models (though design should accommodate them)
- "Model Router" or registry abstraction layer — flat Promise.all is correct for this scale

### Sequencing
1. **Wait for**: Narrative Risk SD to land (avoids synthesis pipeline conflicts)
2. **Ship**: Technology Trajectory as 12th synthesis component
3. **Calibrate**: Run against 3-5 known ventures, iterate prompt 2-3 times
4. **Gate**: Does output change synthesis narrative meaningfully in ≥2 of 5 ventures?
5. **Expand**: If gate passes → build Economic Cycle (13th), Societal Dynamics (14th), Strategic Positioning (review as moat/reframing enhancement)

---

## Full Vision (Future SDs)

### Phase 1: Technology Trajectory MVP (this SD)
Single component, advisory weight, prompt calibration against known ventures.

### Phase 2: Economic Cycle Model
Second component. Requires macro indicator awareness (even from LLM training data). May benefit from Research Department domain feeds.

### Phase 3: Societal Dynamics Model
Third component. Most abstract, highest prompt engineering challenge. May integrate with Narrative Risk's attention economy dimension.

### Phase 4: Strategic Positioning Enhancement
Evaluate whether this is a new component or an upgrade to existing moat architecture + problem reframing.

### Phase 5: Counterweight Models
For each model family, add an opposing framework lens. System surfaces contradictions between paired models.

### Phase 6: Model Conflict Surfacing
Explicit "Macro Tensions" output section in synthesis. When models disagree, present the disagreement as the primary signal.

### Phase 7: Outcome Tracking & Calibration
Track model predictions against venture outcomes at each kill gate. Build evidence for which frameworks are predictive in which domains.

### Phase 8: Research Department Integration
Models query Research Department's accumulated intelligence for real-time macro indicators, replacing LLM-training-data-only reasoning.

### Phase 9: Model Library as Product
"Macro-Calibrated Venture Intelligence" — the evidence-accumulating model library becomes an internal competitive advantage and potentially an external B2B product.

---

## Open Questions
1. **How should model contradictions be weighted?** When Dalio says headwind and Kurzweil says tailwind, does the Chairman see both and decide, or does the system have a meta-model for arbitration?
2. **What are the right counterweight frameworks?** Degrowth vs acceleration is obvious. What's the counterweight for Dalio's debt cycles? For attention economy?
3. **Should macro models affect financial forecasting?** Currently modeling.js generates TAM/SAM/SOM independently. Should Economic Cycle Model output adjust revenue projections?
4. **How do we prevent prompt drift?** If prompts are the entire value, how do we version and protect them? Are they stored in code or in the database?
5. **Does Strategic Positioning overlap too much with existing components?** Moat architecture + problem reframing already do some of this. May be a v2 enhancement rather than a new component.

## Suggested Next Steps
1. **Create an SD** for Technology Trajectory MVP (Tier 3): `tech-trajectory.js` synthesis component + prompt + advisory weighting
2. **Sequence after** Narrative Risk SD (avoid synthesis pipeline conflicts)
3. **Calibrate prompt** against 3-5 known ventures before expanding
4. **Design contradiction surfacing** as an architectural decision before building Family 2
5. **Track in portfolio** alongside Narrative Risk and Research Department as the "Macro Intelligence" capability cluster
