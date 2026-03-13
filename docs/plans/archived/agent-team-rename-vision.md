# Vision: Agent Team Rename & Ghost System Activation

## Executive Summary
The EHG app's EVA agent dispatch system has a "ghost system" problem: ~80% of the infrastructure for dispatching specialized AI teams to venture stages is built (registry, parser, router, dispatch API, SSE streams, insights endpoint), but the core database table (`crew_assignments`) was never created. This produces 404 errors across 7 files with 16 queries, silently degrades the chairman dashboard, and blocks the venture detail "Team" tab.

Compounding this, the "crew" terminology creates confusion with the purged CrewAI framework (PR #212, -18,290 lines). This vision defines a two-phase approach: Phase 1 renames "crew" to "agent team" system-wide and creates the missing `team_assignments` table to activate existing infrastructure. Phase 2 (future) evolves the table into a performance ledger with denormalized metrics.

The goal is not to build new features — it is to make existing, already-built features work.

## Problem Statement
The Chairman dashboard shows degraded data because 3 independent systems (insights service, dashboard hook, SSE streams) query a table that doesn't exist. The dispatch endpoint writes to a table that doesn't exist. The venture detail "Team" tab is a placeholder because there's no data source. Meanwhile, the "crew" naming confuses stakeholders who know CrewAI was purged. This is a ghost system — code that references infrastructure that was never deployed, producing silent failures that look like "no data available" rather than "system broken."

**Who is affected**: Rick (Chairman) — sees incomplete dashboard data, missing agent activity insights, and a non-functional Team tab on every venture detail page.

**Current impact**: Every page load of the chairman dashboard triggers 2-3 failed queries that are silently caught. The insights endpoint's AgentActivity generator always returns empty. The dispatch system cannot function at all.

## Personas
- **Rick (Chairman)**: Needs to see which agent teams are working on which ventures, their progress, token consumption, and any blocking issues. Currently sees "No pipeline data available" and empty agent activity sections.
- **EVA (Orchestrator)**: Needs to dispatch teams to venture stages, track their status, and synthesize their outputs into briefings. Currently cannot dispatch because the target table doesn't exist.

## Information Architecture
### Routes (existing, affected by rename)
- `POST /api/v2/crews/dispatch` → `POST /api/v2/teams/dispatch` — dispatch a team to a venture stage
- `GET /api/v2/chairman/insights` — already exists, AgentActivity generator activates when table exists
- `GET /api/v2/chairman/briefing` — already exists, `active_agents` section queries team_assignments
- `GET /api/v2/stream/global` — SSE stream, `crew_update` → `team_update` event
- `GET /api/v2/stream/venture/[id]` — venture-specific SSE stream
- `GET /api/v2/ventures/[id]` — venture detail API includes team assignments per stage

### Data Sources
- `team_assignments` (NEW — migration required)
- `agent_task_contracts` (EXISTS — dispatch.ts has wrong table name, needs fix)
- `agent_registry` (EXISTS — LTREE hierarchy)
- `ventures` (EXISTS — FK target)

### Navigation
- Chairman Dashboard → Portfolio metrics card shows team capacity (active/queued counts)
- Venture Detail → "Team" tab (currently placeholder) → team assignments for this venture
- Chairman Briefing → `active_agents` section → currently empty due to missing table

## Key Decision Points
1. **Rename scope**: All 14+ files touching "crew" terminology in types, services, APIs, SSE events, and database references
2. **Table design**: Minimal status tracker (Phase 1) vs performance ledger with denormalized metrics (Phase 2)
3. **SSE backward compatibility**: Emit both old and new event names for one release, or hard cutover
4. **Data migration**: Update `CREW_` prefix to `TEAM_` in existing `agent_task_contracts.target_agent` rows
5. **RLS policy pattern**: Follow existing venture-scoped RLS from `eva_orchestration_layer` migration

## Integration Patterns
- **Supabase RLS**: `team_assignments` follows the three-policy pattern (select, insert, update) tied to `company_id` via ventures FK join
- **SSE Streams**: Both global and venture-specific streams poll `team_assignments` for status changes
- **Insights Service**: `evaInsightService.generateAgentActivityInsights()` queries `team_assignments` for long-running team detection and idle team identification
- **Dashboard Hook**: `useChairmanDashboardData` aggregates team capacity (active/queued/total) from `team_assignments`
- **Dispatch Flow**: `POST /api/v2/teams/dispatch` → validates venture → checks existing assignments → creates task contract → creates team assignment → logs audit trail

## Evolution Plan
- **Phase 1 (this SD)**: Create `team_assignments` table, rename crew→team across codebase, fix dispatch.ts bug, activate existing infrastructure
- **Phase 2 (future SD)**: Add `performance_snapshot` JSONB column with Postgres trigger for denormalized metrics; eliminate redundant polling across 3 consumers
- **Phase 3 (future SD)**: Implement venture detail "Team" tab UI consuming team_assignments + insights endpoint with venture_id scoping
- **Phase 4 (future SD)**: Token budget enforcement per team, predictive resource allocation recommendations

## Out of Scope
- Building the venture detail "Team" tab UI (Phase 3)
- Performance ledger denormalization (Phase 2)
- Token budget enforcement per team (Phase 4)
- Reconciling agent_registry (9) vs TEAM_REGISTRY (11) count mismatch
- Agent Platform service implementation
- New API endpoints beyond what already exists

## UI/UX Wireframes
N/A for Phase 1 — this is infrastructure/rename work. The only visible change is:
- Dashboard "team capacity" metric populates with real data instead of showing defaults
- Insights endpoint returns AgentActivity insights instead of empty
- Console 404 errors eliminated

Phase 3 (future) will add the Team tab wireframes.

## Success Criteria
1. Zero 404 errors from `crew_assignments` / `team_assignments` queries in browser console
2. `POST /api/v2/teams/dispatch` successfully creates a team assignment record
3. `GET /api/v2/chairman/insights?format=simple` returns AgentActivity insights (not empty)
4. Chairman briefing `active_agents` section populates from `team_assignments`
5. SSE streams emit `team_update` events when team status changes
6. No remaining references to "crew_assignments" or "CREW_REGISTRY" in codebase (except git history)
7. TypeScript compilation passes with zero errors after rename
8. All existing tests pass (no regressions from rename)
9. RLS policies enforce venture-scoped access on `team_assignments`
10. `agent_task_contracts.target_agent` data migrated from `CREW_` to `TEAM_` prefix
