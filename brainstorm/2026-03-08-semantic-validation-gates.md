# Brainstorm: Semantic Validation Gates — Closing the Ceremony-vs-Substance Gap

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

LEO Protocol has 23 structural validation gates that verify process steps happened (field exists, format valid, handoff count correct) but zero semantic gates that verify the right thing was built. This gap was discovered when orchestrator SD-LEO-FEAT-EVA-INTAKE-REDESIGN-003 completed all 4 children, but the core user-facing feature (interactive classification loop) was never assigned to any child. The vision was fully designed, the foundation code was built, but nobody asked "do the children actually deliver the full vision?"

Root cause: orchestrator auto-completion checks structural completeness (all children status=completed) but not semantic completeness (children collectively satisfy parent scope). This is a systemic gap — the protocol validates that ceremonies were performed, not that promises were kept.

## Discovery Summary

### The 10 Missing Semantic Gates

A comprehensive exploration of the codebase identified 10 semantic validations that don't exist:

1. **SCOPE_AUDIT** — Does final implementation match approved scope?
2. **DELIVERABLES_COMPLETENESS** — Were all promised deliverables actually delivered?
3. **CHILD_SCOPE_COVERAGE** — Do children collectively satisfy parent scope? (orchestrators)
4. **VISION_DIMENSION_COMPLETENESS** — Is vision alignment enforced, not just advisory?
5. **SMOKE_TEST_VALIDATION** — Is the 30-second demo actually executable?
6. **SCOPE_REDUCTION_VERIFICATION** — Was Q8's >10% reduction actually enforced?
7. **ARCHITECTURE_REQUIREMENT_TRACEABILITY** — Were architecture constraints satisfied?
8. **USER_STORY_COVERAGE** — Were all user stories addressed?
9. **SD_TYPE_COMPATIBILITY** — Are parent/child SD types compatible?
10. **OVERLAPPING_SCOPE_DETECTION** — Are parallel SDs duplicating work?

### Existing Infrastructure (reusable)

- `ValidationOrchestrator.js` — Gate runner with schema validation, weighted scoring, batch mode
- `sd-type-applicability-policy.js` — SD-type-aware gate skipping (7 categories × 18 types)
- `gate-result-schema.js` — Normalized result shape ({passed, score, maxScore})
- `gate-policy-resolver.js` — Database-driven gate enable/disable per SD type
- `validation_gate_registry` table — Runtime gate configuration
- `gate-failure-predictor.js` — Historical failure probability models
- `extract-deliverables-from-prd.js` — PRD → structured deliverables list
- `vision-completion-score.js` — Advisory vision alignment scoring (0-100)
- `story-auto-validation.js` — User story existence validation
- `orchestrator-preflight.js` — Parent/child detection and type profiles
- `sd_scope_deliverables` table — Per-SD deliverables with completion status

### User Design Decisions

- **Scope**: Full semantic gate suite (all 10)
- **Enforcement**: Always blocking, but SD-type-aware (intelligent per type)
- **Injection points**: Brainstormed by team analysis

## Analysis

### Arguments For
1. Closes the "ceremony vs. substance" gap — the protocol's largest blind spot
2. Enables autonomous trust escalation — semantic gates are the missing feedback loop for safely expanding AI autonomy
3. 7 of 10 gates reuse existing code (vision-completion-score.js, extract-deliverables-from-prd.js, etc.)
4. Creates a "Semantic Fidelity Score" — quantifiable measure feeding into venture scoring and retrospectives

### Arguments Against
1. "Always blocking" has historically inflated bypass limits (3→10→2000 already)
2. 3 gates need new infrastructure (runner, audit trail, similarity function)
3. Policy matrix explosion (180 new applicability decisions)
4. Auto-fix guardian circumvention risk (auto-generated artifacts that pass structurally)

### Friction/Value/Risk Analysis (Protocol Domain)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Friction Reduction | 8/10 | Eliminates the most expensive class of failures — building the wrong thing and discovering it after completion |
| Value Addition | 9/10 | Creates verifiable quality certification, enables trust escalation, feeds cross-system learning |
| Risk Profile | 5/10 | Policy matrix complexity, false positive risk, auto-fix circumvention, execution time increase |
| **Decision** | **(Friction + Value) = 17 > Risk × 2 = 10 → IMPLEMENT** |

## Team Perspectives

### Challenger
- **Blind Spots**: (1) "Who judges semantics?" — LLM-based = non-deterministic; heuristic = not truly semantic. (2) Auto-fix guardian creates artifacts that structurally pass new gates. (3) Gate ordering — short-circuit in validateGates() means first failure hides 9 others.
- **Assumptions at Risk**: (1) "Always blocking" is sustainable — bypass limits already inflated. (2) SD-type-aware gating will meaningfully reduce friction — scope gates are inherently universal. (3) Vision/architecture docs are machine-parseable enough for traceability.
- **Worst Case**: Velocity collapse (10 new gates × 5 handoffs × 4 children = multiplicative), bypass inflation spiral, trust erosion if gates produce inconsistent results.

### Visionary
- **Opportunities**: (1) Close the checkmark-vs-substance gap. (2) Enable autonomous trust escalation via verifiable quality. (3) Convert advisory systems (vision scoring) into enforceable contracts.
- **Synergies**: Gate policy resolver enables phased rollout via DB config. Gate failure predictor gains semantic signals for predictive quality routing. EVA event bus distributes semantic gate signals cross-venture.
- **Upside Scenario**: "Semantic Fidelity Score" per SD becomes a Chairman dashboard metric, EVA input, and training signal — enabling "review by exception" (5-10x throughput).

### Pragmatist
- **Feasibility**: 5/10 (infrastructure mature, but data availability varies per gate)
- **Resource Requirements**: 15-20 SD-sized work items, ~30 new files, ~14 modified files, 0 new tables for 7 gates
- **Constraints**: (1) 30-second gate timeout for cross-SD queries. (2) Policy matrix expansion (180 new cells). (3) Context window pressure from cumulative gate count.
- **Recommended Path**: 3 phases — Phase 1 (4 gates, high reuse), Phase 2 (3 gates, moderate), Phase 3 (3 gates, new infrastructure)

### Synthesis
- **Consensus Points**: Infrastructure is ready; CHILD_SCOPE_COVERAGE + DELIVERABLES_COMPLETENESS are highest value; phased rollout essential
- **Tension Points**: Blocking vs. advisory (resolved by SD-type-aware enforcement); semantic judgment mechanism (resolved by structured data where possible)
- **Composite Risk**: Medium

## Proposed Injection Points

| # | Gate | Injection Point(s) | SD Types | Rationale |
|---|------|-------------------|----------|-----------|
| 1 | SCOPE_AUDIT | PLAN→LEAD | feature, bugfix, security, database | Final check: delivered scope = approved scope |
| 2 | DELIVERABLES_COMPLETENESS | EXEC→PLAN | ALL except documentation | "I'm done" verification |
| 3 | CHILD_SCOPE_COVERAGE | Orchestrator auto-completion + PLAN→LEAD | orchestrator only | Prevent the EVA gap pattern |
| 4 | VISION_DIMENSION_COMPLETENESS | PLAN→EXEC | feature, enhancement, database | Cheapest fix point before code is written |
| 5 | SMOKE_TEST_VALIDATION | EXEC→PLAN | feature, bugfix, security | Verify test steps reference real files |
| 6 | SCOPE_REDUCTION_VERIFICATION | LEAD→PLAN | ALL except documentation, enhancement | Enforce Q8 at approval moment |
| 7 | ARCHITECTURE_REQUIREMENT_TRACEABILITY | PLAN→EXEC | feature, infrastructure, database, security | PRD addresses architecture constraints |
| 8 | USER_STORY_COVERAGE | EXEC→PLAN + PLAN→LEAD | feature, bugfix, enhancement | Acceptance criteria met, double-checked at verification |
| 9 | SD_TYPE_COMPATIBILITY | LEAD→PLAN (child creation) | orchestrator children only | Type compatibility at creation time |
| 10 | OVERLAPPING_SCOPE_DETECTION | SD creation + LEAD→PLAN | ALL | Catch duplicates before investing time |

## Out of Scope
- Rewriting existing 23 structural gates
- Changing the ValidationOrchestrator architecture itself
- Adding new database tables for gate results (existing `sd_phase_handoffs` suffices)
- LLM-based gate scoring (use structured data first; LLM is a future enhancement)
- Retroactive application to already-completed SDs

## Open Questions
1. Should the auto-fix guardian (OrchestratorCompletionGuardian) be modified to respect semantic gates, or should semantic gates detect auto-generated artifacts?
2. What's the right gate threshold per SD type for semantic gates? Same as existing (60-90%) or tighter?
3. Should OVERLAPPING_SCOPE_DETECTION use keyword matching or embedding similarity?
4. How should the "Semantic Fidelity Score" be surfaced to the Chairman — gate-level detail or composite number?

## Suggested Next Steps
1. Create vision document with full gate lifecycle design
2. Create architecture plan with implementation phases
3. Create orchestrator SD with children per phase
4. Begin Phase 1: DELIVERABLES_COMPLETENESS, USER_STORY_COVERAGE, VISION_DIMENSION_COMPLETENESS, SD_TYPE_COMPATIBILITY
