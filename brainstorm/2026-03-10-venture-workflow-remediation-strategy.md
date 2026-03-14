# Brainstorm: 25-Stage Venture Workflow Remediation Strategy

## Metadata
- **Date**: 2026-03-10
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: EHG Venture Factory (venture workflow GUI)

---

## Problem Statement

The 25-stage venture workflow scores 6.0/10 overall after a rigorous 3-phase triangulation audit by 3 independent AIs (OpenAI, Gemini, Claude). The concept is strong (8/10 Logic & Flow) but implementation suffers from execution debt: a broken kill gate at Stage 23, 14+ naming mismatches, 8 incompatible gate nomenclatures, phantom gates that render UI without enforcement, a scoring bug in Stage 11, currency formatting divergence (6 copies, 3 behaviors), zero accessibility, and abandoned shared components. Vision vs. Reality score: 62-65/100.

Two competing remediation plans exist:
1. **GUI Remediation SD** (from prior brainstorm): ~3,450 LOC, builds 25 new stage renderers with shared SDK
2. **Triangulation 3-Sprint Plan**: ~1,100 LOC, fixes existing code incrementally

These overlap on naming fixes and gate rendering but diverge fundamentally on approach (rebuild vs. fix).

## Discovery Summary

### Tradeoff Analysis: Fix vs. Rebuild vs. Hybrid

Three options were evaluated across 5 weighted dimensions:

| Dimension | Weight | Fix-First | Rebuild | Hybrid |
|-----------|--------|-----------|---------|--------|
| Complexity | 20% | 9 | 4 | 7 |
| Maintainability | 25% | 5 | 9 | 7 |
| Performance | 20% | 8 | 6 | 8 |
| Migration effort | 15% | 9 | 3 | 6 |
| Future flexibility | 20% | 4 | 9 | 7 |
| **Weighted Score** | | **6.8** | **6.5** | **7.05** |

**Decision**: Hybrid approach — fix critical bugs immediately, build SDK foundation alongside gate unification, then migrate stages incrementally.

### Key Constraints
- Stages 13-25 have zero production data — cannot verify rewrites
- `fn_advance_venture_stage` must be checked before promoting phantom gates
- 25 stages each with ~200-500 LOC — regression risk is real for bulk changes
- Existing GUI Remediation SD must be reconciled (not duplicated)

### Reversibility Assessment
- Fix-First: Highly reversible (small patches)
- Rebuild: Low reversibility (25 new components)
- Hybrid: Medium reversibility (fixes + new SDK, stages migrate one-at-a-time)

## Analysis

### Arguments For (Hybrid Approach)
- **Best of both worlds**: Fixes trust-breaking bugs immediately while building the SDK foundation
- **Reconciles competing plans**: Absorbs triangulation Sprint 1-2 into immediate fixes, absorbs GUI Remediation SDK vision into Sprint 2-3
- **Incremental migration**: Stages migrate to SDK one-at-a-time, each testable independently
- **Validated priorities**: 3 AIs independently converged on the same critical bugs and ordering

### Arguments Against
- **More complex sequencing**: Requires careful coordination between fix-first SDs and SDK-building SDs
- **SDK may not be needed yet**: If the 25-stage count is stable, fixing existing code may be sufficient
- **Scope creep risk**: "Build SDK + fix bugs + migrate stages" could expand beyond the original ~1,800 LOC estimate
- **Two plan reconciliation overhead**: Must update/supersede the existing GUI Remediation SD

## Team Perspectives

### Challenger
- **Blind Spots**: Two competing plans not reconciled — executing both creates redundant work. Gate promotion has backend behavioral implications in `fn_advance_venture_stage` that neither plan addresses. Sprint sequencing creates intermediate states where "correctly enforced gates have wrong labels."
- **Assumptions at Risk**: Assumption that 25 stages is the final count (venture factory may need 30+). Assumption that shared components from Stages 1-2 can scale to all 25 stages.
- **Worst Case**: Both plans partially execute, leaving some stages on old renderers, some on SDK, with inconsistent gate behavior — worse than the current state.

### Visionary
- **Opportunities**: Stage Renderer SDK creates a parameterized component system usable across ventures. Epistemic dashboard (cross-stage Golden Nuggets visibility) surfaces venture health. Lifecycle-to-LEO bridge connects venture progression to SD workflow.
- **Synergies**: Remediation builds the display layer for the venture factory shared service platform. Unified gate model enables programmatic stage advancement.
- **Upside Scenario**: A venture factory where new ventures get fully functional 25-stage workflows out of the box, with each stage renderer being a configuration of the SDK.

### Pragmatist
- **Feasibility**: 5/10 (for full scope) — improves to 8/10 if phased correctly
- **Resource Requirements**: 12-15 SDs, ~400 LOC average. Estimated 3-4 weeks of focused work.
- **Constraints**: No production data for stages 13-25. formatCurrency has 6 divergent copies. Gate backend needs verification.
- **Recommended Path**: Start with ~55 LOC of zero-risk quick wins (Stage 23 gate, Stage 11 math, currency sign fix), then phase the rest.

### Synthesis
- **Consensus Points**: Quick wins first (all 3 agree). Plans must be reconciled (Challenger + Pragmatist). Backend gate check needed (Challenger + Pragmatist).
- **Tension Points**: Fix-existing vs. rebuild-with-SDK (Pragmatist vs. Visionary). Scope ambition (Visionary wants cross-stage dashboards; Pragmatist rates feasibility 5/10).
- **Composite Risk**: Medium-High (plan collision + no test data for half the stages + feasibility concerns)

## Tradeoff Matrix (Architecture Domain)

| Dimension | Weight | Option A: Fix-First | Option B: Rebuild | Option C: Hybrid |
|-----------|--------|---------------------|-------------------|------------------|
| Complexity | 20% | 9/10 | 4/10 | 7/10 |
| Maintainability | 25% | 5/10 | 9/10 | 7/10 |
| Performance | 20% | 8/10 | 6/10 | 8/10 |
| Migration effort | 15% | 9/10 | 3/10 (critical weakness) | 6/10 |
| Future flexibility | 20% | 4/10 | 9/10 | 7/10 |
| **Weighted Total** | | **6.8** | **6.5** | **7.05** |

**Decision**: Option C (Hybrid) — highest weighted score, no critical weaknesses.

## Open Questions
- Should the existing GUI Remediation SD be superseded or modified to align with the hybrid approach?
- What is the actual behavior of `fn_advance_venture_stage` when phantom gates are promoted to real gates?
- Is there a way to generate test data for stages 13-25 to enable verification?
- Should accessibility (Sprint 3, ~600+ LOC) be a separate SD or bundled with the stage migration work?

## Suggested Next Steps
1. **Supersede/update the existing GUI Remediation SD** to align with hybrid approach
2. **Create Sprint 1 SD**: Quick wins (~95 LOC) — Stage 23 gate, Stage 11 math, formatCurrency, naming fixes
3. **Create Sprint 2 SD**: Gate unification + SDK foundation (~500 LOC) — universal GateDecision enum, phantom gate resolution, shared renderer primitives
4. **Create Sprint 3 SD**: Stage migration + accessibility (~800+ LOC) — migrate stages to SDK, extract shared components, a11y sweep
5. **Verify backend**: Check `fn_advance_venture_stage` gate enforcement behavior before Sprint 2
