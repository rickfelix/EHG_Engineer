# Brainstorm: Architecture-to-SD Phase Coverage Gate — Go/No-Go Before Execution

## Metadata
- **Date**: 2026-03-08
- **Domain**: Protocol
- **Phase**: Design
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (internal protocol improvement)

---

## Problem Statement

When an architecture plan defines multiple implementation phases, there is no validation that the Strategic Directives created from that plan collectively cover ALL phases. Today's evidence: the Strategic Roadmap architecture plan defined 3 phases (Schema+Clustering, SD Promotion+OKR, Chairman UI tab). An orchestrator SD was created with children for Phases 1-2 only. Phase 3 — explicitly described as a "separate orchestrator" — was never created as an SD. The backend shipped complete, but the UI deliverable was silently dropped. Nobody noticed because no gate asks "do the SDs cover the full architecture?"

**Root cause**: The process from architecture plan approval to SD creation has zero coverage validation. `create-orchestrator-from-plan.js` can parse phases but the `--auto-children` flag is optional and advisory-only. The `sections` column on `eva_architecture_plans` exists but is always NULL — phases live in raw markdown content with no structured representation. There is no gate that compares "phases in architecture" against "SDs that exist."

## Discovery Summary

### Current State
- Architecture plans stored in `eva_architecture_plans` with full markdown content
- `sections` column exists but is NULL — phases are not parsed into structured data
- `extracted_dimensions` JSONB stores 6-8 dimensions but not phase-level data
- `create-orchestrator-from-plan.js` has `parsePhases()` regex extraction (reusable)
- Zero validation between plan phases and created SDs
- "Separate orchestrator" phases have no formal linkage mechanism to external SDs

### User Design Decisions
1. **Blocking go/no-go gate** — not advisory. Chairman must confirm coverage before execution begins.
2. **Dual injection**: Advisory warning at SD creation time + blocking gate at LEAD-TO-PLAN handoff.
3. **All phases must have SDs** — including "separate orchestrator" phases, which require a linked SD to exist. No exceptions, no deferral mechanism.
4. **Architecture plan is in the database** — the `sections` column should be populated with structured phase data. This is a data quality issue, not a parsing challenge.

### Related Systems
- **Semantic Validation Gates** (brainstormed same day): 10 gates for SD execution quality. This gate is upstream — validates pre-execution completeness, not in-execution quality.
- **CHILD_SCOPE_COVERAGE** (Gate 3): Validates children satisfy parent scope during execution. This gate is its upstream counterpart — validates SDs satisfy architecture scope before execution begins.
- **Orchestrator Planning Completeness Gate** (brainstormed 2026-03-06): Cross-child coherence validation before EXEC. Adjacent but different lifecycle point.

## Analysis

### Arguments For
1. **Prevents an entire class of silent failure** — the gap that dropped Phase 3 has existed since the protocol's inception with no detection mechanism
2. **Low implementation cost** — `parsePhases()` exists, `sections` column exists, handoff system has gate injection points. ~100-150 LOC across 3-4 files
3. **Closes the accountability loop** — transforms architecture plans from passive documents into active contracts with measurable delivery
4. **Database-native** — uses existing `eva_architecture_plans` table rather than inventing new infrastructure
5. **Forces upfront planning** — requiring all phase SDs before LEAD-TO-PLAN ensures the Chairman sees the full commitment before any work begins

### Arguments Against
1. **Gate fatigue risk** — if phase parsing produces false positives (unusual formatting, trivial phases), trust erodes and bypasses increase
2. **Incremental creation conflict** — blocking at LEAD-TO-PLAN before ALL phases have SDs conflicts with the pattern of creating Phase 1 children first, Phase 2 later
3. **Plan mutation problem** — no versioning/locking means adding Phase 4 after SDs are created could retroactively block in-progress work
4. **"Separate orchestrator" linkage is a new concept** — requires a relationship type (plan-phase-to-SD mapping) that doesn't exist today

## Integration: Protocol Friction/Value/Risk Analysis

| Dimension | Score |
|-----------|-------|
| Friction Reduction | 9/10 |
| Value Addition | 9/10 |
| Risk Profile | 4/10 |

**Friction Reduction (9/10):**
- Current friction: 5/5 — When a phase is silently dropped, the Chairman discovers it only through manual review after completion. Recovery requires new SDs, re-entering the pipeline, re-doing work that should have been planned upfront. This is the most expensive failure class: late discovery of missing scope.
- Friction breadth: 4/5 — Affects every orchestrator SD created from a multi-phase architecture plan. Every completed orchestrator has this latent risk.

**Value Addition (9/10):**
- Direct value: 5/5 — Eliminates the "silently dropped phase" failure mode entirely. Forces upfront planning of all deliverables before execution begins.
- Compound value: 4/5 — Structured phase data enables architecture completion tracking, HEAL scoring at plan level, and phase-to-SD traceability. Shifts from SD-centric thinking to architecture-centric thinking.

**Risk Profile (4/10):**
- Breaking change risk: 2/5 — Additive gate at existing handoff point. No existing workflows modified. `sections` column already exists.
- Regression risk: 2/5 — Grandfathering in-progress SDs prevents retroactive breakage. Advisory-first rollout catches parsing issues before blocking enforcement.

**Decision Rule**: (9 + 9) = 18 > (4 × 2) = 8 → **IMPLEMENT**

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Phase granularity mismatch — architecture plans describe phases in prose with varying substance. A trivial "update docs" phase getting blocked creates friction without value. (2) "Separate orchestrator" linkage is a new relationship type that doesn't exist in the data model. (3) Architecture plan mutation after SD creation — adding Phase 4 retroactively could block in-progress work without versioning.
- **Assumptions at Risk**: (1) "All phases must have SDs" assumes architecture plans are always correct and complete — but plans are hypotheses that evolve. (2) Blocking at LEAD-TO-PLAN forces all phase SDs to exist before any phase proceeds, conflicting with incremental creation patterns. (3) Phase parsing from unstructured content is reliable — architecture plans have no enforced template.
- **Worst Case**: Gate fatigue → placeholder SDs created just to satisfy the gate → metrics pollution. Or: circular dependency between two "separate orchestrator" SDs that each need the other to exist → deadlock with AUTO-PROCEED on.

### Visionary
- **Opportunities**: (1) Structured Phase Registry — populating `sections` transforms architecture plans from documents into live planning instruments. (2) Automatic SD scaffolding — system could auto-scaffold SD shells for every phase, eliminating the forgetting problem entirely. (3) Architecture plan completion tracking — answer "is this plan fully delivered?" programmatically.
- **Synergies**: Semantic gates (upstream completeness + downstream quality = complete quality envelope). HEAL scoring at architecture level catches aggregate misalignment. Baseline system rolls up from SD to architecture level. EVA intake pipeline auto-populates phases at plan approval — zero additional user effort.
- **Upside Scenario**: Every architecture plan approval produces a structured phase manifest. SD creation is guided by uncovered phases. Architecture completion dashboards show real-time delivery status. The shift from SD-centric to architecture-centric accountability prevents entire class of partial delivery failures.

### Pragmatist
- **Feasibility**: 4/10 — moderate, mostly glue work. `parsePhases()` exists, `sections` column exists, handoff system is established.
- **Resource Requirements**: 1 standard SD (Tier 3, ~100-150 LOC). 3-4 files modified: `create-orchestrator-from-plan.js` (populate sections), `unified-handoff-system.js` (blocking gate), `leo-create-sd.js` (advisory warning), new `phase-coverage-validator.js` (~60-80 LOC). Backfill script for existing plans. No schema changes needed.
- **Constraints**: (1) `sections` column must be populated going forward AND backfilled. (2) "Separate orchestrator" phases need explicit linkage — recommend `covered-by: SD-KEY` annotation. (3) Rollout must grandfather in-progress SDs already past LEAD-TO-PLAN.
- **Recommended Path**: Phase 1 (foundation): create validator, populate sections, advisory warnings. Phase 2 (enforcement): blocking gate at LEAD-TO-PLAN, separate orchestrator linkage. Advisory-first rollout for 2-3 SD cycles before enabling blocking.

### Synthesis
- **Consensus Points**: Problem is real and worth fixing. `sections` column must be populated with structured data. "Separate orchestrator" linkage needs an explicit mechanism. Feasibility is moderate (~100-150 LOC). Advisory-first rollout before blocking enforcement.
- **Tension Points**: Challenger argues blocking at LEAD-TO-PLAN is premature (forces all SDs to exist before any can proceed); user chose strict enforcement (all phases must have SDs, no deferral). Challenger sees over-engineering risk; Visionary sees architecture delivery system nucleus. Pragmatist mediates with phased rollout.
- **Composite Risk**: Medium — sound concept, ready infrastructure, but edge cases around timing and plan mutation need careful handling.

## Open Questions
- How should architecture plan versioning work when phases are added after SDs exist?
- Should the `sections` column use a standardized schema (e.g., `{phases: [{number, title, sd_key, status}]}`)?
- What is the exact "separate orchestrator" linkage mechanism — `covered-by` annotation in markdown, or a database-level FK?
- Should `create-orchestrator-from-plan.js` auto-populate `--auto-children` by default (opt-out instead of opt-in)?

## Suggested Next Steps
- Create Vision Document and Architecture Plan (Step 9.5 — mandatory)
- Register in EVA for HEAL scoring
- Create SD targeting the LEAD-TO-PLAN gate injection point
