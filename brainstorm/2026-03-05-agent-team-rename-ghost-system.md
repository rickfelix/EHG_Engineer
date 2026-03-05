# Brainstorm: Agent Team Rename & Ghost System Activation

## Metadata
- **Date**: 2026-03-05
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: All active ventures (system-wide infrastructure)

---

## Problem Statement
The EHG app's EVA agent dispatch system references a `crew_assignments` database table that was never created (no migration exists), producing 404 errors across 7 files with 16 queries. Additionally, the "crew" terminology is confusing because CrewAI (the Python agent framework) was purged in PR #212 (71 files, -18,290 lines), but the EVA crew dispatch concept was intentionally kept. The chairman insights endpoint returns 404 because the `AgentActivity` generator depends on this missing table.

## Discovery Summary

### Two Different "Crew" Concepts
1. **CrewAI framework** (Python) — PURGED in PR #212, March 3 2026
2. **EVA crew dispatch** (L4 specialized teams) — KEPT but table never created

### The Ghost System
The vision docs describe a 4-level hierarchical agent architecture:
- L1: Chairman (Rick) — strategic decisions
- L2: EVA — orchestration, dispatch, synthesis
- L3: Venture CEOs + VPs — per-venture autonomous leadership
- L4: Specialized Teams — stateless workers (11 types mapped to 25 stages)

Infrastructure is ~80% built: CREW_REGISTRY (11 team configs), directive parser, directive router, dispatch API, SSE streams, chairman briefing API, insights endpoint. Missing: the database table and the "Team" tab UI.

### Pre-Existing Bugs Discovered
1. `dispatch.ts` references `task_contracts` table but the real table is `agent_task_contracts`
2. `CREW_` prefix stored as DATA in `agent_task_contracts.target_agent` column — needs data migration
3. LTREE `agent_registry` has 9 sub-agents but CREW_REGISTRY has 11 types — count mismatch

### Key Correction
The `/api/v2/chairman/insights` endpoint ALREADY EXISTS at `src/pages/api/v2/chairman/insights.ts`. The 404 is because `evaInsightService.AgentActivity` generator returns empty when `crew_assignments` doesn't exist. Creating the table activates it.

## Analysis

### Arguments For
- Eliminates confusing "crew" terminology that conflicts with CrewAI purge narrative
- Activates existing insights endpoint's AgentActivity generator (already built, just needs data)
- Fixes pre-existing bug in dispatch.ts (`task_contracts` → `agent_task_contracts`)
- Unblocks venture detail "Team" tab placeholder
- Low difficulty (3/10) — mechanical rename + 1 new migration

### Arguments Against
- Dispatch system never tested end-to-end — creating table may expose latent bugs in queries that only "worked" because they always 404'd
- LTREE agent_registry (9 sub-agents) vs CREW_REGISTRY (11 types) count mismatch needs reconciling
- SSE event rename (`crew_update` → `team_update`) could silently break undiscovered listeners
- Performance ledger design would be more architecturally sound but expands scope

## Tradeoff Matrix

| Dimension | Weight | A: Minimal | B: Performance Ledger | C: Two-Phase Split |
|-----------|--------|---|---|---|
| Complexity | 20% | 9/10 | 5/10 | 8/10 |
| Maintainability | 25% | 7/10 | 9/10 | 7/10 |
| Performance | 20% | 5/10 | 9/10 | 5/10 |
| Migration effort | 15% | 9/10 | 4/10 | 8/10 |
| Future flexibility | 20% | 6/10 | 9/10 | 8/10 |
| **Weighted** | | **7.1** | **7.5** | **7.2** |

**Selected**: Option C (Two-Phase Split) — Phase 1 creates table + rename, Phase 2 adds performance ledger.

## Team Perspectives

### Challenger
- **Blind Spots**: Schema designed in vacuum (no production data to validate against); LTREE hierarchy and CREW_REGISTRY are two separate models that will diverge; SSE event rename has no rollback path
- **Assumptions at Risk**: Insights endpoint is not straightforward (depends on two tables); bundling scope maximizes blast radius; code handling "always fails" may not handle "now returns rows"
- **Worst Case**: Dispatch inserts corrupt data, insights surface plausible but incorrect agent activity, SSE rename silently breaks one consumer — Chairman dashboard lies with confidence

### Visionary
- **Opportunities**: `team_assignments` as performance ledger (denormalized token burn); Team tab as missing observability layer; insights endpoint as composable intelligence bus with venture-scoped filtering
- **Synergies**: Token budget enforcement → team visibility → insights loop; SSE stream → Team tab realtime → agent activity insight; agent registry LTREE → team assignment hierarchy → tiered escalation
- **Upside Scenario**: EVA generates venture-specific resource allocation recommendations; predicts token budget ceilings before co-execution stages; transitions from reactive alerting to predictive orchestration

### Pragmatist
- **Feasibility**: 3/10 difficulty (low-to-moderate, mostly mechanical)
- **Resource Requirements**: 1 engineer, 3-4 hours; migration ~150-200 LOC + ~100 LOC rename
- **Constraints**: `CREW_` prefix stored as data in agent_task_contracts needs data migration; SSE event name is public API contract; RLS policies must replicate existing pattern
- **Recommended Path**: Write migration first → fix dispatch.ts bug → mechanical rename → API directory rename. Two PRs cleaner (migration first, then code).

### Synthesis
- **Consensus Points**: Scope is smaller than initially thought; dispatch.ts has pre-existing bug; TypeScript compiler catches missed renames
- **Tension Points**: Challenger wants smaller scope; Visionary wants performance ledger; Pragmatist says just do it mechanically
- **Composite Risk**: Low-Medium

## Out of Scope
- Performance ledger denormalization (Phase 2)
- Venture detail "Team" tab UI implementation (separate SD)
- Token budget enforcement per team (separate SD)
- Reconciling agent_registry vs TEAM_REGISTRY count mismatch (separate investigation)
- Agent Platform service implementation

## Open Questions
- Should SSE emit both old (`crew_update`) and new (`team_update`) event names for one release cycle for backward compatibility?
- Should the migration include seed data for the 11 team types, or are they code-defined in TEAM_REGISTRY only?
- What RLS policy pattern should `team_assignments` follow — venture-scoped or company-scoped?

## Suggested Next Steps
1. Create vision + architecture plan documents
2. Register in EVA for HEAL scoring
3. Create SD via /leo create with Phase 1 scope
