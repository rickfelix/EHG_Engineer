# Brainstorm: Venture Detail Page Redesign — 25-Stage Lifecycle vs. Operations Mode

## Metadata
- **Date**: 2026-03-06
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD (with phasing)
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: PortraitPro AI

---

## Problem Statement

The Venture Detail page (`VentureDetail.tsx`) currently displays a static 8-tab layout regardless of where a venture is in its lifecycle. It shows "Stage X of 40" due to legacy tier routing (`DEFAULT_STAGE_LIMIT = 40`), when the canonical system has exactly 25 stages across 6 phases. More fundamentally, ventures that have launched and moved to operations mode (`pipeline_mode='operations'`) still see the same building-focused interface — there's no progressive reveal or mode adaptation.

The Chairman's primary need when viewing a single venture is **decision readiness**: "What do I need to decide RIGHT NOW?" The current page doesn't surface gates, approvals, or kill/promote decisions prominently.

The existing Chairman Vision V2 only describes this page as: "Single venture deep view. 25-stage horizontal timeline. Artifacts." — insufficient to guide a redesign that spans 7 pipeline modes.

## Discovery Summary

### Constraints
- **Tech stack**: Keep current Shadcn UI + Tailwind + React Query + Supabase schema — redesign is UI/UX only
- **Canonical source**: `venture-workflow.ts` with `VENTURE_STAGES` (25 stages), `TOTAL_STAGES = 25`
- **Pipeline modes**: building → operations → growth → scaling → exit_prep → divesting → sold (7 total)
- **Gates**: Kill gates at stages 3, 5, 13, 23; Promotion gates at 16, 17, 22
- **Advisory checkpoints**: Validation@3, Profitability Gate@5, Schema Firewall@16

### Design Direction
- **Progressive reveal**: Page content adapts as venture matures — building shows stages, operations adds metrics/health
- **Decision readiness**: Surface what Chairman needs to decide NOW — gates, approvals, kill/promote decisions
- **Post-launch collapse**: 25-stage timeline collapses to a compact "completed journey" summary (expandable), focus shifts to operations dashboard
- **Building view**: Next gate/decision + stage artifacts + blockers & risks + advisory checkpoints

### Key Insight (from user)
> "Once you've had a venture that's launched, there's really no need to go back to those 25 stages. Maybe they collapse or something like that. The focus should really be more on the operations elements."

> "We probably need to redefine a new vision for this level of detail for the venture details."

## Analysis

### Arguments For
1. **Decision readiness is the Chairman's core need** — Current page dumps 8 tabs regardless of context. Progressive reveal aligns with Chairman Vision V2's Layer 0/1/2 philosophy.
2. **Infrastructure already exists** — 25-stage SSOT, pipeline_mode column, Operations dashboard, advisory_checkpoints, gate definitions all in DB.
3. **Eliminates "40-stage" technical debt** — Natural forcing function to migrate ~15+ files from deprecated WORKFLOW_STAGES/DEFAULT_STAGE_LIMIT=40.
4. **Reduces cognitive load** — Each pipeline_mode gets exactly the information density it needs.

### Arguments Against
1. **7 pipeline_modes = 7 UI variations** — Only building and operations have real UI patterns today. Growth through sold are undefined.
2. **New L2 vision adds planning overhead** — Can't start building immediately, but prevents "build first, think later" pattern.
3. **Collapsed timeline UX is novel** — No precedent in the codebase; needs design work for transitions and expanded state.

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Pipeline_modes 3-7 (growth, scaling, exit_prep, divesting, sold) have no UI patterns — designing for them risks premature abstraction. (2) Existing Operations dashboard is a separate page — merging or coordinating creates routing confusion. (3) Advisory checkpoints are DB records without rich UI components.
- **Assumptions at Risk**: (1) "Decision readiness" assumes Chairman visits details reactively, but Briefing page may already surface decisions. (2) pipeline_mode correctness — if ventures get stuck in "building" after launch, the whole UI breaks.
- **Worst Case**: Over-engineering a 7-mode system when only 2 are understood, resulting in a generic container worse than 8 tabs.

### Visionary
- **Opportunities**: (1) Composable "venture context panel" system could become the UI pattern for the entire Chairman experience. (2) Collapsed timeline becomes a reusable "journey visualization" component. (3) Decision readiness creates a natural hook for EVA automated recommendations.
- **Synergies**: Directly enables Chairman Vision V2's Layer 0→1→2 progressive disclosure model for all views.
- **Upside Scenario**: Venture Detail adapts so naturally that Operations dashboard becomes unnecessary — all venture context lives in one mode-aware page.

### Pragmatist
- **Feasibility**: 6/10 — Building mode redesign is straightforward (25 stages + gates + artifacts in DB). Operations integration is harder. Later modes are unknowns.
- **Resource Requirements**: Phase 1 (40→25 fix): 1 SD. Phase 2 (building mode redesign): 2-3 SDs. Phase 3 (operations collapse): 2-3 SDs.
- **Constraints**: (1) Must not break existing Operations dashboard until explicitly replaced. (2) ~15 files with hardcoded "40" need migration. (3) Mobile responsiveness needed.
- **Recommended Path**: 40→25 fix first → L2 vision → building mode → operations mode.

### Synthesis
- **Consensus Points**: Building mode is the starting point; later pipeline_modes shouldn't drive architecture; 40→25 migration should happen first.
- **Tension Points**: Visionary wants to absorb Operations dashboard into Venture Detail; Challenger warns about routing identity crisis; Pragmatist says keep Operations working until replaced.
- **Composite Risk**: Medium — Building mode (low risk), operations integration (medium), pipeline_modes 3-7 (high/undefined).

## Open Questions
- Should the Venture Detail page eventually replace the Operations dashboard, or should they remain separate pages?
- What does the Chairman need to see for pipeline_modes beyond building and operations (growth, scaling, exit_prep, divesting, sold)?
- How should the collapsed timeline interact with the Briefing page's venture summaries?
- Should the progressive reveal system use pipeline_mode exclusively, or also factor in venture tier?

## Suggested Next Steps
1. **Immediate**: Create bugfix SD to migrate all 40-stage references to canonical 25-stage system
2. **Vision**: Create L2 vision document for Venture Detail experience (registered in EVA)
3. **Architecture**: Create architecture plan covering building mode → operations mode transition
4. **Implementation**: Phase SDs from the architecture plan
