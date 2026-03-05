# Brainstorm: Venture Acquisition-Readiness Architecture

## Metadata
- **Date**: 2026-03-05
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: Synthify Studios, NicheSignal AI, CreatorFlow AI, NicheBrief AI

---

## Problem Statement

EHG is a venture factory that evaluates, builds, launches, and operates ventures through a 25-stage pipeline. The end goal is to sell ventures via acquisition — but the current architecture has no concept of exit readiness. Ventures enter Operations mode (post-Stage 25) and can only be "parked" or "killed." There is no pipeline mode, scoring system, asset registry, or data room capability to support the business's core monetization event: selling ventures to buyers.

The recent pipeline redesign (SD-LEO-ORCH-EVA-STAGE-PIPELINE-001, completed 2026-03-04) introduced 4 operating modes (Evaluation, Build, Launch, Operations) but treated Operations as the terminal state. The gap between "venture is operating" and "venture is sold" is entirely unaddressed in the architecture.

## Discovery Summary

### Exit Model
- **Varies per venture** — not a single model. Must support:
  - Full acquisition (code + data + customers + brand)
  - Licensing / white-label (buyer licenses tech/brand, EHG retains IP)
  - Revenue share / partial sale (buyer purchases revenue stake)
- Acqui-hire explicitly excluded
- Exit model is mutable — may shift as venture matures and acquirer pool becomes clearer

### Timing
- **Acquisition-readiness assessment starts at Stage 0** — baked into the earliest evaluation so ventures are designed for exit from birth
- This doesn't mean the exit model is known at Stage 0 — it means the criteria for separability, data portability, and asset tracking are evaluated continuously

### Infrastructure Strategy
- **Shared infrastructure with documented separation plan** — ventures share EHG's Supabase instance, Express server, and worker scheduler during Build/Launch/Operations, but each venture has a documented path to standalone operation
- Balance between cost efficiency (shared infra) and exit readiness (separation plan)

### Score Impact
- **Informational only** — the acquirability score does not auto-influence pipeline decisions. The Chairman decides manually. However, team analysis identified this as a risk — there should be at least a soft-gate that flags score degradation.

## Analysis

### Arguments For
1. **Exit is EHG's business model** — The pipeline must produce sellable ventures. Currently it produces operating ventures with no exit readiness.
2. **Cost of retrofitting is exponential** — Every month without separation boundaries makes eventual separation harder. Starting at Stage 0 is cheaper.
3. **Competitive differentiation** — 30-day M&A readiness commands premium valuations. This is a structural advantage.
4. **Builds on recent work** — Pipeline redesign just shipped. Infrastructure is fresh and well-understood.

### Arguments Against
1. **Only 4 real ventures** — Risk of over-engineering for hypothetical scale.
2. **Pipeline redesign fatigue** — Modifying stage templates again immediately could introduce regressions.
3. **Legal precedes technical** — Entity structure, IP assignment agreements are prerequisites the system can track but not create.

## Architecture: Tradeoff Matrix

### Option A: Minimal — Add pipeline_mode + asset registry only

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Complexity | 20% | 8 | Low complexity — additive schema changes |
| Maintainability | 25% | 7 | Simple to maintain, but incomplete |
| Performance | 20% | 9 | No runtime overhead |
| Migration effort | 15% | 9 | ALTER TABLE + new tables only |
| Future flexibility | 20% | 4 | No scoring, no dry-runs, no data room |
| **Weighted** | | **7.15** | |

### Option B: Full Exit Pipeline — modes + registry + scoring + dry-runs + data room

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Complexity | 20% | 4 | Significant: new workers, stage modifications, export system |
| Maintainability | 25% | 6 | More surface area but well-structured if following existing patterns |
| Performance | 20% | 7 | New workers add scheduler load but within existing capacity |
| Migration effort | 15% | 5 | Schema changes + stage template mods + new operations workers |
| Future flexibility | 20% | 9 | Complete exit readiness, live data rooms, separation rehearsals |
| **Weighted** | | **6.30** | |

### Option C: Phased — Registry + scoring first, exit pipeline + dry-runs later

| Dimension | Weight | Score | Notes |
|-----------|--------|-------|-------|
| Complexity | 20% | 6 | Moderate: additive first, modifications second |
| Maintainability | 25% | 8 | Clean phase boundaries |
| Performance | 20% | 8 | Gradual scheduler load increase |
| Migration effort | 15% | 7 | Spread across phases |
| Future flexibility | 20% | 8 | Full capability eventually, lower initial risk |
| **Weighted** | | **7.50** | **RECOMMENDED** |

**Recommendation**: Option C (Phased) scores highest. It avoids the pipeline redesign fatigue risk by deferring stage template modifications while still delivering the foundational asset registry and scoring immediately.

## Team Perspectives

### Challenger
- **Blind Spots**: Separation plans are theoretical without rehearsals; asset registry needs provenance/legal chain not just inventory; informational-only score has no correction pressure
- **Assumptions at Risk**: Exit model is unknowable at Stage 0 (treat as mutable); data export ≠ data handoff (need validated migration artifacts); 4 ventures have heterogeneous separation complexity
- **Worst Case**: Due diligence reveals shared infra entanglement that requires 6-8 weeks to resolve in a 30-45 day window. Deal collapses or reprices. All separability scores become suspect.

### Visionary
- **Opportunities**: Separability score as CI-level signal (per-PR delta); data room as live event-sourced product (not point-in-time doc); licensing relationships as proof-of-separability that generate revenue
- **Synergies**: Acquirability criteria dual-purpose existing gate questions; operations dashboard naturally surfaces separability metrics; EHG's process IP (the factory methodology) is itself licensable
- **Upside Scenario**: EHG closes acquisitions in 30 days vs. industry 60-180. Acquirers pay 6-10x multiples. The methodology becomes EHG's most valuable export.

### Pragmatist
- **Feasibility**: 7/10
- **Resource Requirements**: Schema design, new operations workers, stage template criteria additions. Stripe + AARRR (already identified gaps) feed directly into financial diligence.
- **Constraints**: Pipeline just redesigned (avoid destabilizing); small venture sample (avoid over-fitting); legal entity structure is offline business decision
- **Recommended Path**: Start with Asset Registry + `exit_prep` mode (additive), then scoring worker, then stage template mods last

### Synthesis
- **Consensus**: Asset registry is essential (all 3); separation must be validated not just documented; exit model is mutable
- **Tension**: Challenger wants provenance + legal rigor; Visionary wants event-sourcing + CI integration; both valid but different phases
- **Composite Risk**: Medium — feasible but untested separation plans are the critical risk

## Out of Scope
1. Legal entity creation (LLC per venture, IP assignment agreements) — the system tracks these but does not create them
2. Acquirer discovery / M&A matchmaking — this is a business development function, not a pipeline function
3. Post-acquisition integration support — once the venture leaves EHG, the pipeline's job is done
4. Pricing / valuation models — the system provides data for valuation but does not compute a price

## Open Questions
1. Should the asset registry track historical provenance (event-sourced) or current state only? (Visionary recommends event-sourced; Pragmatist says current state first, add history later)
2. What constitutes a "separation rehearsal" in practice? A Docker compose that spins up the venture isolated? A migration script that exports and reimports into a fresh Supabase project?
3. How do we handle ventures where the "product" is an AI model trained on shared EHG data? Is the model itself an asset, or only the fine-tuning?
4. Should the operations dashboard show acquirability metrics alongside health metrics, or in a separate Chairman view?

## Suggested Next Steps
1. Create Vision document (`docs/plans/venture-exit-readiness-vision.md`)
2. Create Architecture plan (`docs/plans/venture-exit-readiness-architecture.md`)
3. Register both in EVA for HEAL scoring
4. Create orchestrator SD with phased children (Phase 1: registry + mode, Phase 2: scoring + workers, Phase 3: stage templates + dry-runs)
