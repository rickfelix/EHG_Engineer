# Brainstorm: Dual Strategy — Outbound Venture Positioning + Inbound Capability Building

## Metadata
- **Date**: 2026-02-21
- **Domain**: Venture
- **Phase**: Ideation
- **Mode**: Conversational
- **Outcome Classification**: Needs Triage
- **Team Analysis**: No (derived from prior team analyses)
- **Related Ventures**: All active ventures (cross-cutting strategic pattern)
- **Related Brainstorms**:
  - "Model Library for Venture Ideation — Macro Analytical Frameworks" (2026-02-21, Ready for SD)
  - "Narrative Risk model for venture ideation" (2026-02-21, Ready for SD)
  - "Research Department as Internal EHG Service" (2026-02-21, Ready for SD)
  - "Building deep domain expertise into EHG venture ideation" (2026-02-21, needs_triage)

---

## Problem Statement

Three consecutive brainstorms (Research Department, Narrative Risk, Model Library) each independently surfaced the same architectural split: EHG needs both an **outbound strategy** (how ventures position themselves in markets using macro intelligence) and an **inbound strategy** (how EHG builds the internal analytical infrastructure that makes all ventures smarter). Neither strategy is explicitly codified. The CEO/Chairman role intuitively bridges both, but the system has no formal separation between "capabilities that help individual ventures compete" and "capabilities that strengthen the EHG platform itself."

Without this distinction, capability-building work (Research Department, Model Library, Domain Intelligence) gets evaluated on the same rubric as venture-facing features — leading to misaligned prioritization, unclear ownership, and no compounding strategy for internal infrastructure.

## Discovery Summary

### The Insight
The Chairman recognized, while reviewing the Model Library brainstorm, that the 92-video playlist and the three prior brainstorms all point to the same structural need: EHG needs a CEO-level dual strategy that governs:

1. **Outbound**: How ventures use macro intelligence for market positioning, timing, and go-to-market
2. **Inbound**: How EHG builds internal capabilities (Research Department, Model Library, Domain Intelligence, Narrative Risk) that compound across all ventures

### Evidence: Three Brainstorms, One Pattern

| Brainstorm | Outbound (Venture-Facing) | Inbound (EHG Platform) |
|------------|--------------------------|----------------------|
| **Research Department** | Continuous market intelligence for active ventures (articles, newsletters, competitive data) | Accumulated domain knowledge improving ideation engine, proactive scanning |
| **Narrative Risk** | Demand durability signal per venture (NR score, NR band) | Portfolio-level narrative exposure detection, correlated risk |
| **Model Library** | Macro positioning for venture go-to-market (economic cycle, tech trajectory, societal forces) | Macro frameworks improving all evaluation, feedback loops calibrating models |

### The Capability Cluster
These aren't three separate initiatives — they form one **Macro Intelligence** capability cluster with two consumers:
- **Individual ventures** (outbound): receive macro context, positioning signals, risk intelligence
- **EHG platform** (inbound): accumulates knowledge, calibrates models, compounds across ventures

### The CEO/Chairman Bridge
The CEO/Chairman role is the strategic bridge:
- Sets which macro models matter (curates the intellectual worldview)
- Decides which ventures to evaluate (portfolio allocation)
- Translates inbound capabilities into outbound positioning guidance
- Owns the feedback loop: "Did our macro models predict correctly?"

---

## Analysis

### Arguments For Formalizing the Dual Strategy

1. **Prevents misaligned prioritization**: Without the outbound/inbound split, internal capability work (Research Department) competes for priority against venture-facing features on the same rubric. They serve different strategic purposes and should be evaluated differently.

2. **Enables compounding**: Inbound capabilities (Model Library, Domain Intelligence) compound across all ventures — every new venture benefits from the accumulated intelligence of prior ventures. This compounding effect is invisible without a formal inbound strategy that tracks it.

3. **Clarifies ownership**: Outbound strategy = per-venture teams and the EVA ideation engine. Inbound strategy = EHG platform team (Research Department, Model Library maintainers). Without this split, nobody owns the platform.

4. **Makes the CEO role explicit**: The Chairman already intuitively bridges both strategies (the 92-video playlist IS the inbound strategy, informally). Formalizing it creates accountability and makes the bridge function visible to the system.

5. **Unifies three in-flight brainstorms**: Research Department, Narrative Risk, and Model Library become coherent parts of one strategy rather than three competing SD proposals.

### Arguments Against

1. **Premature abstraction**: EHG has 9 active ventures and 0 shipped model library components. Formalizing a dual strategy before any of the underlying capabilities exist may create overhead without payoff.

2. **Strategy documents don't build products**: The risk is spending time codifying strategy when the actual need is shipping the Technology Trajectory MVP, standing up the Research Department, and building Narrative Risk. Execution > strategy.

3. **May overcomplicate SD prioritization**: If every SD must now declare "outbound" or "inbound" alignment, it adds a classification tax to the LEO workflow. Not every piece of work fits cleanly into one category.

4. **The CEO bridge may be a bottleneck**: If the Chairman must arbitrate every outbound/inbound tradeoff, it creates a single point of failure in the strategic loop. At small scale this is fine; at 20+ ventures it doesn't scale.

---

## Implications for EHG Architecture

### EVA's Role
EVA (the venture ideation/evaluation engine) currently handles the **inbound-to-outbound translation** implicitly:
- Inbound: synthesis engine, modeling.js, evaluation profiles accumulate analytical capability
- Outbound: chairman review, venture briefs, kill gates produce venture-specific guidance

Formalizing the dual strategy means EVA explicitly serves both masters:
- **EVA Inbound**: Research Department, Model Library, Domain Intelligence, Narrative Risk — capabilities that improve EVA itself
- **EVA Outbound**: Venture creation, stage progression, kill gates, portfolio management — capabilities that help ventures compete

### The "Macro Intelligence" Capability Cluster
Proposed grouping of related capabilities under one strategic umbrella:

| Capability | Type | Status | Consumer |
|------------|------|--------|----------|
| Technology Trajectory Model | Synthesis component | Ready for SD | Both |
| Economic Cycle Model | Synthesis component | Brainstormed | Both |
| Societal Dynamics Model | Synthesis component | Brainstormed | Both |
| Strategic Positioning Model | Synthesis enhancement | Brainstormed | Both |
| Narrative Risk | Synthesis component | Ready for SD | Both |
| Research Department | Internal service | Ready for SD (pending prerequisites) | Both |
| Domain Intelligence System | Context injection | SD in PLAN phase | Inbound primarily |
| Counterweight Models | Synthesis enhancement | Identified need | Inbound primarily |
| Model Outcome Tracking | Feedback loop | Identified need | Inbound primarily |

### CEO Strategic Artifacts Needed
1. **Outbound positioning framework**: How does EHG decide what macro intelligence each venture needs? (Not every venture needs all 4 model families)
2. **Inbound capability roadmap**: Sequencing of Research Department, Model Library, Domain Intelligence, Narrative Risk — what order maximizes compounding?
3. **Feedback loop design**: How do venture outcomes flow back to improve inbound capabilities? (The Visionary's "proprietary evidence trail")

---

## Open Questions

1. **Should the dual strategy be a formal document or an implicit architectural pattern?** A strategy document risks becoming stale; an architectural pattern risks being invisible.

2. **How does the dual strategy interact with the EHG organizational structure?** The department system (brainstormed separately) assigns agents to departments. Does "Macro Intelligence" become a department? A capability cluster? A tag?

3. **What's the minimum viable outbound strategy?** Is it simply "run all applicable model library components during Stage 0 and present to Chairman"? Or does it need per-venture customization?

4. **Who owns the inbound strategy?** The Chairman curates the intellectual worldview (92 videos), but who ensures the Model Library stays calibrated, the Research Department stays current, and the feedback loops close?

5. **Does this change SD prioritization?** Should "inbound" SDs (Research Department infrastructure, Model Library) receive priority premium because they compound across all ventures?

---

## Suggested Next Steps

1. **Don't formalize yet** — execute the three Ready-for-SD brainstorms (Technology Trajectory MVP, Narrative Risk, Research Department) and observe whether the outbound/inbound pattern holds during implementation
2. **Tag SDs** — when creating these SDs, add metadata indicating whether they're primarily outbound, inbound, or both. This creates evidence for whether the pattern is real.
3. **Revisit after 3 SDs land** — once Technology Trajectory, Narrative Risk, and Research Department are shipped, evaluate: did the dual strategy framing help or hinder? Was the compounding effect visible?
4. **Consider a "Macro Intelligence" orchestrator SD** — if the pattern holds, create an orchestrator SD that sequences all Macro Intelligence capabilities with explicit outbound/inbound alignment
