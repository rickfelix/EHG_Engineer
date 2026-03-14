# Brainstorm: Unified Strategic Intelligence Pipeline

## Metadata
- **Date**: 2026-03-10
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (ListingLens AI, MindStack AI)

---

## Problem Statement

The LEO protocol's execution infrastructure — baselines, roadmapping, tracks, and coordination — operates as a collection of disconnected, manually-triggered subsystems with no strategic layer above them. Strategic Directives are created ad-hoc from brainstorms, intake items, and manual creation, but nothing in the system answers "are we on strategy?" or "what should we build to achieve our mission?"

The missing hierarchy is: **Mission → Vision → Strategy → OKRs → Roadmap → SDs → Capabilities → Management Review → Strategy Adjustment**. Today, the pipeline starts at SDs and works down. The top-down strategic chain that should drive everything doesn't exist.

Additionally, every step in the existing pipeline requires manual CLI triggers. New SDs get `sequence_rank=9999` and sit outside the baseline. The roadmap clusters by theme, not by strategic objective. Tracks assign statically at creation time. The coordinator manages fleet claims but doesn't orchestrate the pipeline. The capability graph tracks what's delivered but doesn't drive what's needed.

## Discovery Summary

### Core Insight: Strategy Sits Above SDs
A company has a mission and vision, and a company strategy that helps achieve them. You may not have any SDs developed yet — it's all strategy first. SDs are transient (they complete), capabilities are permanent (they accumulate). The strategy layer defines which capabilities are *needed*, the capability graph shows what you *have*, and the delta drives the entire pipeline.

### The Closed Loop
```
Market Intelligence (Forecast Models)
        ↓
Company Strategy (Mission → Vision → Strategic Objectives)
        ↓
OKRs (Monthly measurable targets — bridge between strategy and execution)
        ↓
Roadmap (time-horizon-aware: Now/Next/Later/Eventually)
        ↓
SD Generation (auto-generated from capability gaps)
        ↓
Baseline (intelligent insertion + cascade reordering, versioned)
        ↓
Tracks (auto-rebalancing, strategy-aligned)
        ↓
Execution (coordinator orchestrates fleet)
        ↓
Capability Delivery (registered in graph)
        ↓
Management Review (EVA-led, weekly Friday 9am EST)
  → Baseline vs Actual scorecard
  → Capability gap analysis
  → Strategy health indicators
  → OKR progress tracking
  → Risk forecast review
  → Documented as performance artifact
        ↓
Strategy Adjustment (chairman decides, EVA executes)
        ↓
(back to top)
```

### Nine Subsystems

| # | Subsystem | Current State | Target State |
|---|-----------|--------------|-------------|
| 1 | **Strategy Layer** | Does not exist | Mission → Vision → Strategic Objectives defined in DB, driving all downstream work |
| 2 | **OKRs** | Exist as side-input to sd:next boost scoring | Monthly cycle, primary input for baseline sequencing and track assignment |
| 3 | **Forecast Models** | Stage 0 financial projections, Stage 5 profitability kill gates, risk forecasting schema (unpopulated) | All three active, feeding market intelligence into strategy layer |
| 4 | **Roadmap** | Flat wave clusters, manual trigger, theme-based | Time-horizon-aware (Now/Next/Later/Eventually), strategy-driven sequencing |
| 5 | **Baseline** | AI-assisted but manual trigger, new SDs get rank 9999, no versioning | Event-driven intelligent insertion with cascade, versioned, EVA-managed |
| 6 | **Tracks** | Static rule-based from sd_type/category | Full auto-rebalancing aligned to strategic objectives and OKRs |
| 7 | **Coordinator** | Fleet management (claims, sweeps, health) | Full pipeline orchestrator for the entire strategic loop |
| 8 | **Capability Graph** | Tracks delivered capabilities (read-only) | Closed loop: strategy defines needed → graph shows delivered → gap drives SD generation |
| 9 | **Management Review** | Does not exist | EVA-led interactive session, weekly Friday 9am EST, baseline comparison, strategy decisions |

### Key Design Decisions

**Capacity is unlimited.** AI agents, not humans. The constraint isn't "how many SDs can we run" but "what's the right strategic sequence." This simplifies tracks from a capacity-balancing problem to a pure prioritization problem.

**Monthly OKR cycles.** At AI-agent velocity, quarterly is too slow. OKRs are set monthly, measured continuously, surfaced at weekly management review, adjusted monthly if EVA's review shows a KR is unreachable or already achieved.

**EVA as strategic operating partner.** The management review isn't a report — it's an interactive session:
1. EVA presents: baseline vs actual, capability gaps, pipeline health, risk forecasts, OKR progress
2. Chairman reviews and makes decisions: adjust strategy, reprioritize, kill/double-down
3. EVA acts on decisions: creates new baselines, modifies roadmap, generates SDs, updates strategy

**Baseline versioning.** EVA manages baseline versions. Each management review can produce a new baseline version. Historical snapshots enable planned-vs-actual comparison across time.

**Risk forecasting activated.** The `risk_forecasting_models` and `risk_forecasts` schema exists but isn't populated. Activate it as part of the pipeline so risk intelligence feeds into strategy and management review.

**Hybrid trigger model.** Event-driven for critical paths (SD creation → baseline insertion, phase completion → capability update), scheduled for analytics (burn rate snapshots, management review cron).

**Full autonomy on track rebalancing.** System rebalances tracks and adjusts sequence ranks without asking. Governor gates on auto-SD generation from capability gaps (chairman approval required).

### OKR Integration (Best Practice + AI Adaptation)

The canonical hierarchy (Andy Grove/Intel → John Doerr/Google):
```
Mission       "Why we exist"                    (timeless)
  → Vision    "Where we're going"               (3-5 years)
    → Strategy "Our bets to get there"           (annual)
      → OKRs   "Measurable monthly targets"      (monthly)
        → Roadmap → SDs → Capabilities           (continuous)
```

- **Strategy** says: "Establish 3 revenue-generating ventures and build a shared capability platform"
- **OKR** translates: `O: Accelerate venture throughput` / `KR1: Launch 2 ventures to Stage 10+` / `KR2: Achieve 80% capability reuse` / `KR3: Reduce Stage 0→5 cycle time by 30%`
- **SDs** execute against Key Results. KR boost scoring moves from display modifier to primary baseline sequencing input.
- **Management review** measures KR progress weekly, adjusts monthly.

### Existing Infrastructure (What Already Exists)

| Component | Location | Reuse Potential |
|-----------|----------|----------------|
| AI baseline generation | `scripts/sd-baseline-intelligent.js` | High — needs event trigger, not rewrite |
| Wave clustering | `lib/integrations/wave-clusterer.js` | High — needs strategy-aware assignment |
| Coordinator + sweep | `scripts/fleet-dashboard.cjs`, `stale-session-sweep.cjs` | Medium — needs pipeline orchestration scope |
| OKR boost scoring | `scripts/modules/sd-next/SDNextSelector.js` | High — promote from display to baseline driver |
| Capability graph | `scripts/cross-venture-capability-graph.js` | Medium — needs gap → SD generation loop |
| Corrective SD creator | `scripts/gap-detection/creators/corrective-sd-creator.js` | High — auto-SD pattern exists |
| EVA scheduler | `EvaMasterScheduler` with weekly cadence | High — register management review round |
| Stage 0 forecast | `lib/eva/stage-zero/modeling.js` | High — wire into strategy layer |
| Stage 5 profitability | `stage-05-financial-model.js` | High — wire into management review |
| Risk forecasting schema | `risk_forecasting_models` + `risk_forecasts` (types only) | Medium — needs migration + edge function activation |
| Planning tab | `PlanningTab.tsx` in EHG app | Medium — expand to command center |
| Dependency graph | `scripts/lib/dependency-graph.js` | High — used by intelligent baseline |
| Priority scorer | `scripts/lib/priority-scorer.js` | High — add strategy alignment dimension |

### Planning Tab → Chairman Command Center

The existing Planning tab on `/chairman/vision` shows unscheduled architecture phases (read-only). The target state transforms this into the chairman's primary interface:

- **Strategy health**: Each strategic objective with health indicator, capability coverage %, horizon timeline
- **Baseline vs Actual scorecard**: Planned capabilities/ventures/SDs vs delivered, with variance and trend
- **OKR dashboard**: Monthly KR progress with at-risk indicators
- **Pipeline view**: Intake → Waves → SDs → Baseline → Tracks status
- **Review history**: Archived past management reviews showing trajectory over time
- **Risk forecasts**: Active risk models with mitigation status
- **Action controls**: Approve/reject EVA recommendations, trigger rebaseline, adjust strategy

## Analysis

### Arguments For
- **Most pieces already exist** — forecast models, capability graph, coordinator, wave clustering, AI baseline generation, EVA scheduler, OKR scoring. This is primarily a wiring and integration project.
- **Closes the strategic loop** — transforms LEO from "execute ad-hoc SDs" to "execute strategy through capabilities," fundamentally different leverage model
- **Self-improving** — every execution cycle deposits calibration data that makes gates, baselines, and forecasts more accurate over time
- **Chairman becomes strategist, not project manager** — manage by exception during weekly EVA sessions, not by directing individual SDs
- **Compounds with venture count** — the more ventures in the pipeline, the more valuable the strategic coordination becomes

### Arguments Against
- **9 subsystems touching protocol, DB, and UI** — large blast radius even if individual changes are small
- **Baseline cascade reordering is genuinely hard** — non-deterministic AI generation + event-driven triggers = potential for corrupt snapshots
- **Capability graph has no deletion/correction semantics** — no mechanism to reopen gaps when a delivered capability is wrong or obsolete
- **Auto-SD generation without careful gating could flood the pipeline** — strategy-generated SDs bypass the normal human intake filter

## Team Perspectives

### Challenger
- **Blind Spots**: (1) The handoff system (LEAD→PLAN→EXEC gates) is the real bottleneck — auto-generating SDs will congest the handoff queue, not the execution queue. (2) The capability graph has no deletion semantics — capabilities can't be marked as wrong/obsolete, so gaps may be incorrectly closed. (3) The management review has no escalation path — it's visibility without automated action triggers.
- **Assumptions at Risk**: (1) "Unlimited capacity" masks a real concurrency ceiling at the claim layer. (2) AI baseline generation is not idempotent — same inputs produce different rankings, making scheduled regeneration unreliable for velocity metrics. (3) Strategy-derived SDs will systematically pass LEAD gates because rejecting them means questioning the strategy itself.
- **Worst Case**: SD backlog grows faster than LEAD→PLAN→EXEC can process. Management review permanently reports "40 SDs behind plan" because the strategy layer adds SDs faster than they complete. No circuit breaker exists. The system is technically functioning but permanently behind its own plan.

### Visionary
- **Opportunities**: (1) Self-scheduling protocol — capability gaps trigger EVA intake → auto-SD creation → baseline insertion → coordinator execution. The system generates its own work queue. (2) Predictive gate calibration — historical execution data auto-tunes kill gate thresholds over time. (3) Baseline-as-constraint — the coordinator treats the time-horizon baseline as a scheduling constraint, auto-deferring "Later" work when "Now" is saturated.
- **Synergies**: EVA intake 3D taxonomy maps naturally onto capability dimensions. OKR boost scoring becomes derivable baseline sequencing. The LEO stack worker pattern extends to pipeline orchestration. Security sub-agent provides standing gate on auto-generated SDs.
- **Upside Scenario**: By 12 months, the Chairman's interaction changes from "what should we build" to "approve these 3 capability gap SDs and review this week's drift report." After 50 ventures, the pipeline has real calibration data. After 100, accurate time estimates without human adjustment. The venture factory becomes literal: strategy is the order book, the protocol is the factory floor.

### Pragmatist
- **Feasibility**: 6.5/10 overall. Management review (8/10) and forecast wiring (9/10) are easy. Strategy layer (4/10) and baseline cascade (5/10) are hard and everything depends on them.
- **Resource Requirements**: 8-12 child SDs under 1-2 orchestrators. No new tools needed — EVA scheduler, capability graph, corrective SD creator all exist.
- **Constraints**: (1) Baseline insertion is a prerequisite blocker — management review produces garbage without it. (2) Auto-SD generation needs a governor gate from day one. (3) Strategy layer must be backward-compatible with existing sd:next output contract.
- **Recommended Path**: Start bottom-up, not top-down. Phase 1: Management review + tracks upgrade. Phase 2: Baseline fix. Phase 3: Capability graph close-loop. Phase 4: Strategy layer. Phase 5: Command center UI.

### Synthesis
- **Consensus Points**: Baseline fix is a prerequisite; auto-SD generation needs a governor; management review is the cheapest quick win
- **Tension Points**: Top-down vs bottom-up build order; unlimited capacity vs claim ceiling; review as display vs review as action
- **Composite Risk**: Medium — architecture is sound, most subsystems exist, risk concentrates in baseline cascade and auto-SD governance

## Open Questions
- What schema should the strategy layer use? (New table? Extension of existing `strategic_vision`?)
- How does baseline versioning interact with the existing `sd_execution_baselines` / `sd_baseline_items` model?
- Should the management review output format be structured (JSON artifact) or narrative (markdown report) or both?
- How do we handle capability graph corrections when a delivered capability turns out to be insufficient?
- What's the governor gate threshold for auto-SD generation? (Max N per week? Chairman approval per batch?)
- Should the risk forecasting edge function be activated as-is or redesigned for the pipeline context?

## Suggested Next Steps
1. Generate vision and architecture documents (proceeding now)
2. Register in EVA for HEAL tracking
3. Create orchestrator SD with phased child SDs following Pragmatist's recommended path
4. Phase 1 quick wins: Management review cron + baseline event-driven insertion
5. Phase 2: Strategy layer schema + OKR promotion + capability gap loop
6. Phase 3: Command center UI in EHG app
