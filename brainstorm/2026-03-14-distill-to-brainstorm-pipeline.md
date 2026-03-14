# Brainstorm: Distill-to-Brainstorm Pipeline — Eliminating the Research SD Middleman

## Metadata
- **Date**: 2026-03-14
- **Domain**: Protocol
- **Phase**: Discovery
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (infrastructure improvement)
- **Chairman Review**: 3 items reviewed, 3 accepted

---

## Problem Statement

The current distill-to-SD pipeline requires 6 discrete commands across 4 separate sessions with 4 manual handoffs. `/distill promote` creates Research SDs as intermediaries that sit in the `sd:next` queue unused — the first thing anyone does with them is brainstorm, which should have happened directly. Additionally, the pipeline drops the chairman into manual command territory at every transition (dumping text like "run `/distill approve --roadmap-id ...`") instead of maintaining a continuous guided interactive experience.

The chairman (a solo entrepreneur running 3 parallel Claude Code sessions) spends time on protocol mechanics instead of strategic judgment.

## Discovery Summary

### Friction Points Identified
1. **Research SD middleman**: `/distill promote` creates lightweight Research SDs (`sd_type='documentation'`, `category='research'`) that need a full LEAD pass before becoming real SDs. This adds an unnecessary protocol layer.
2. **Broken interaction chain**: After each pipeline phase, the system dumps CLI commands instead of presenting AskUserQuestion-driven choices with recommendations. The chairman must copy-paste commands and re-orient.
3. **Context loss at handoffs**: Each stage (distill → refine → approve → promote → brainstorm → vision → arch → SD) discards context and rebuilds from database breadcrumbs and temp files.

### Chairman Design Decisions
- **Flow model**: Selective chain — chairman cherry-picks which wave items to brainstorm, the rest stay in the wave
- **Trigger**: On item selection (chairman picks specific items from an approved wave)
- **Interaction**: Interactive per item — full brainstorm experience with discovery questions, then auto-chain to vision+arch+SD
- **Deferred items**: Stay in wave with tracked progress (no placeholder SDs, new disposition column needed)
- **Continuity**: Track progress — `/distill promote` shows remaining items when resumed
- **Loop model**: Continuous guided loop — pipeline keeps presenting next actions via AskUserQuestion until chairman explicitly chooses "Done"
- **UX pattern**: Every transition uses AskUserQuestion with AI-recommended defaults — no copy-paste commands, no manual invocations

## Analysis

### Arguments For
1. **Compress 6 commands / 4 sessions into 1 guided session.** Chairman time spent on judgment (which items, what direction) instead of protocol mechanics (copying wave IDs, running commands).
2. **Context accumulates instead of being rebuilt.** The session IS the context — chairman intent, brainstorm insights, vision decisions all flow forward without lossy handoffs.
3. **Every SD enters the system with full traceability.** No more thin Research SDs. Every SD has brainstorm session, vision doc, and architecture plan from birth.
4. **Time-to-first-code drops from days to hours.** Monday capture → Monday distill session → Monday afternoon a worker claims a LEAD-ready SD.
5. **1M context window eliminates the binding constraint.** A 5-item brainstorm loop at ~400K tokens is well within budget with 600K to spare.

### Arguments Against
1. **Two promotion codepaths must be merged.** `refine-promote.js` and `roadmap-promote.js` are parallel paths that will diverge if not explicitly reconciled.
2. **Interactive fatigue for large batches.** The selective cherry-pick model limits this (chairman picks 3-5 from a wave), but for 20+ items batch processing may be faster.
3. **Loss of audit trail.** Research SDs were trackable via `sd:next`, claims, handoffs, retrospectives. Replacement: brainstorm session records + wave item disposition must be equally visible.

## Protocol: Friction/Value/Risk Analysis

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Friction Reduction** | **9/10** | |
| Current friction level | 5/5 | 6 commands, 4 handoffs, context rebuilt at each step |
| Friction breadth | 4/5 | Affects every idea entering the system (435+ items) |
| **Value Addition** | **9/10** | |
| Direct value | 5/5 | Same-day time-to-first-code, SD traceability from birth |
| Compound value | 4/5 | Enables predictive recommendations, translation fidelity scoring, reusable guided-loop pattern |
| **Risk Profile** | **4/10** | |
| Breaking change risk | 2/5 | Two promotion codepaths to merge, wave item schema change |
| Regression risk | 2/5 | Context window concern eliminated (1M tokens). Phased rollout mitigates the rest. |
| **Decision** | **(9 + 9) > 4 × 2 = 18 > 8 → Implement** | |

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Continuous guided session ties up 1 of 3 worker sessions for the entire loop — but this is chairman time, not worker time. (2) Two parallel promotion codepaths will silently diverge if not merged. (3) Wave item tracking has no "deferred without SD" state — needs new disposition column.
- **Assumptions at Risk**: (1) AskUserQuestion per-item may be slower than batch-promote for large waves. (2) Vision+arch auto-chain may fail quality gates for thin items. (3) Research SDs serve as audit trail — removing them loses trackability unless replaced.
- **Worst Case**: Half-migrated chimera where old and new promotion paths coexist, wave completion metrics break, and interactive bottleneck slows throughput.

### Visionary
- **Opportunities**: (1) Zero-friction idea-to-execution pipeline. (2) Context accumulation instead of context handoff. (3) Chairman decision compression — one cherry-pick + per-item brainstorm vs three separate interaction points.
- **Synergies**: Strategic Roadmap Process (inbound side of same pipeline), EVA Translation Fidelity Gates (first-class vision linkage from birth), Orchestrator Completion (shared guided-loop pattern), Friday Meeting (session-level metrics).
- **Upside Scenario**: Monday morning 30-minute session processes weekend ideas, produces 4-5 LEAD-ready SDs with full traceability. System develops enough pattern data to begin predicting chairman decisions.

### Pragmatist
- **Feasibility**: 8/10 (upgraded from 6/10 — 1M context window eliminates the binding constraint)
- **Resource Requirements**: ~24 hours across 3 weeks, 1 DB migration, ~200 lines skill changes, ~100 lines new linking script
- **Constraints**: (1) Two promotion paths create migration hazard — phased approach mitigates. (2) Wave items need disposition column. (3) Skill-to-skill nesting is new territory but context window makes it viable.
- **Recommended Path**: Phase 1 (wire brainstorm into distill as optional mode) → Phase 2 (eliminate Research SD middleman) → Phase 3 (make default with continuous guided loop)

### Synthesis
- **Consensus Points**: Two promotion codepaths must be merged. Wave items need disposition tracking. Context window concern is resolved.
- **Tension Points**: Research SDs as waste (Visionary) vs audit trail (Challenger) — resolved by brainstorm session records + wave disposition replacing the audit function.
- **Composite Risk**: Medium → Low (after 1M context window update)

## Out of Scope
- Predictive chairman recommendations (future enhancement, needs pattern data first)
- Bulk auto-brainstorm mode (all items in a wave without interaction)
- Migration of existing Research SDs to the new format
- Changes to the `/brainstorm` skill's internal flow (only changes to how it's invoked from `/distill`)

## Open Questions
- Should the `/distill refine` step (dedup, reconcile, score) run before or after the chairman cherry-picks items for brainstorming?
- What is the exact schema for the `item_disposition` column on `roadmap_wave_items`? (enum: selected, deferred, dropped, brainstormed, promoted?)
- Should the guided loop support "pause and resume next session" even though context window allows single-session completion?

## Suggested Next Steps
1. Create vision and architecture documents (auto-chaining from this brainstorm)
2. Create SD via LEO protocol
3. Phase 1 implementation: wire `/brainstorm` into `/distill` as the default path after chairman review
