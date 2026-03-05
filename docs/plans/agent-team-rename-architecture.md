# Architecture Plan: Agent Team Rename & Ghost System Activation

## Stack & Repository Decisions
- **Repository**: `rickfelix/ehg` (EHG App) — all affected files are in the frontend/API layer
- **Database**: Supabase (PostgreSQL) — new migration for `team_assignments` table
- **Runtime**: Vite + React + TypeScript + Shadcn UI (frontend), Next.js-style API routes (backend)
- **No new dependencies** — uses existing Supabase client, existing SSE infrastructure

## Legacy Deprecation Plan
- **`crew_assignments`**: Never existed as a table, only as code references → rename all references to `team_assignments`
- **`CREW_REGISTRY`**: Rename to `TEAM_REGISTRY` in `evaTaskContracts.ts`
- **`STAGE_CREW_MAP`**: Rename to `STAGE_TEAM_MAP`
- **`STAGE_CO_EXECUTION_MAP`**: Internal values reference crew types → update to team types
- **`CrewAssignment` type**: Rename to `TeamAssignment` in `vision-v2.ts`
- **`CrewDispatchRequest`**: Rename to `TeamDispatchRequest` in `vision-v2.ts` and `vision-v2.zod.ts`
- **`/api/v2/crews/`**: Move to `/api/v2/teams/` (directory rename)
- **`crew_update` SSE event**: Rename to `team_update` in both stream endpoints
- **`DispatchCrewHandler`**: Rename to `DispatchTeamHandler` in `evaDirectiveRouter.ts`
- **Data migration**: `UPDATE agent_task_contracts SET target_agent = REPLACE(target_agent, 'CREW_', 'TEAM_') WHERE target_agent LIKE 'CREW_%'`

## Route & Component Structure

### API Routes (rename)
| Current Path | New Path | File |
|---|---|---|
| `src/pages/api/v2/crews/dispatch.ts` | `src/pages/api/v2/teams/dispatch.ts` | Dispatch endpoint |

### Hooks (update references)
| File | Changes |
|---|---|
| `src/hooks/useChairmanDashboardData.ts` | `.from('crew_assignments')` → `.from('team_assignments')`, variable names |
| `src/hooks/usePipelineData.ts` | No changes (queries admin API, not crew table directly) |

### Services (rename constants + types)
| File | Changes |
|---|---|
| `src/services/evaTaskContracts.ts` | `CREW_REGISTRY` → `TEAM_REGISTRY`, `STAGE_CREW_MAP` → `STAGE_TEAM_MAP`, `crew_type` → `team_type`, `CREW_` prefix → `TEAM_` |
| `src/services/evaDirectiveRouter.ts` | `DispatchCrewHandler` → `DispatchTeamHandler` |
| `src/services/evaDirectiveParser.ts` | `crew` target type → `team` |
| `src/services/evaInsightService.ts` | `.from('crew_assignments')` → `.from('team_assignments')`, variable names |

### Types (rename interfaces)
| File | Changes |
|---|---|
| `src/types/vision-v2.ts` | `CrewAssignment` → `TeamAssignment`, `CrewAssignmentStatus` → `TeamAssignmentStatus`, `CrewDispatchRequest/Response` → `TeamDispatchRequest/Response` |
| `src/validation/vision-v2.zod.ts` | Schema name updates to match |

### API Endpoints (update table references)
| File | Changes |
|---|---|
| `src/pages/api/v2/chairman/briefing.ts` | `.from('crew_assignments')` → `.from('team_assignments')` |
| `src/pages/api/v2/stream/global.ts` | Table name + `crew_update` → `team_update` event |
| `src/pages/api/v2/stream/venture/[id].ts` | Table name + event name |
| `src/pages/api/v2/ventures/[id]/index.ts` | Table name + field names |

### Bug Fix
| File | Change |
|---|---|
| `src/pages/api/v2/teams/dispatch.ts` | `.from('task_contracts')` → `.from('agent_task_contracts')` (pre-existing bug) |

## Data Layer

### New Table: `team_assignments`

```sql
CREATE TABLE public.team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL CHECK (stage_number >= 0 AND stage_number <= 25),
  team_name TEXT NOT NULL,
  team_type TEXT NOT NULL,
  task_contract_id UUID REFERENCES public.agent_task_contracts(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'in_progress', 'completed', 'failed', 'cancelled')),
  tokens_used INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(venture_id, stage_number, team_type, status)
    WHERE status IN ('pending', 'queued', 'in_progress')
);
```

### Indexes
```sql
CREATE INDEX idx_team_assignments_venture ON public.team_assignments(venture_id);
CREATE INDEX idx_team_assignments_status ON public.team_assignments(status);
CREATE INDEX idx_team_assignments_venture_stage ON public.team_assignments(venture_id, stage_number);
```

### RLS Policies (three-policy pattern from eva_orchestration_layer)
```sql
ALTER TABLE public.team_assignments ENABLE ROW LEVEL SECURITY;

-- Chairman full access
CREATE POLICY "chairman_full_access" ON public.team_assignments
  FOR ALL USING (public.fn_is_chairman());

-- Authenticated read access via venture company scope
CREATE POLICY "authenticated_read" ON public.team_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ventures v
      WHERE v.id = team_assignments.venture_id
      AND v.company_id = auth.uid()
    )
  );

-- Service role insert/update (EVA dispatch)
CREATE POLICY "service_role_write" ON public.team_assignments
  FOR ALL USING (auth.role() = 'service_role');
```

### Updated Trigger
```sql
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.team_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

### Data Migration
```sql
UPDATE public.agent_task_contracts
SET target_agent = REPLACE(target_agent, 'CREW_', 'TEAM_')
WHERE target_agent LIKE 'CREW_%';
```

## API Surface

### Renamed Endpoint
- `POST /api/v2/teams/dispatch` — dispatch a team to a venture stage
  - Request: `{ venture_id, stage_number, team_type, objective, max_tokens?, timeout_minutes? }`
  - Response: `{ success, task_contract_id, status }`
  - Now writes to `team_assignments` (new table) and `agent_task_contracts` (existing, fixed reference)

### Existing Endpoints (activated by table creation)
- `GET /api/v2/chairman/insights?format=simple` — AgentActivity generator now returns data
- `GET /api/v2/chairman/briefing` — `active_agents` section now populated
- `GET /api/v2/stream/global` — emits `team_update` events
- `GET /api/v2/stream/venture/[id]` — emits venture-scoped `team_update` events

## Implementation Phases

### Phase 1: Migration (PR #1)
1. Write `supabase/migrations/20260306_001_create_team_assignments.sql`
2. Include table, indexes, RLS policies, updated_at trigger
3. Include data migration for `agent_task_contracts.target_agent` prefix
4. Deploy migration via `supabase db push`
5. Verify table exists and RLS works

### Phase 2: Code Rename (PR #2)
1. Rename types in `vision-v2.ts` (`CrewAssignment` → `TeamAssignment`, etc.)
2. Let TypeScript compiler surface all consumers
3. Rename constants in `evaTaskContracts.ts` (`CREW_REGISTRY` → `TEAM_REGISTRY`, etc.)
4. Update all 7 files with `.from('crew_assignments')` → `.from('team_assignments')`
5. Fix dispatch.ts bug: `.from('task_contracts')` → `.from('agent_task_contracts')`
6. Move `src/pages/api/v2/crews/` → `src/pages/api/v2/teams/`
7. Rename SSE events: `crew_update` → `team_update`
8. Update `evaDirectiveRouter.ts` and `evaDirectiveParser.ts`

### Phase 3: Verification
1. TypeScript compilation passes with zero errors
2. Manual test: dispatch endpoint creates team_assignments row
3. Verify insights endpoint returns AgentActivity data
4. Verify SSE streams emit team_update events
5. Verify chairman briefing shows active_agents data
6. Run existing test suite

## Testing Strategy

### Unit Tests
- Verify `TEAM_REGISTRY` exports correct 11 team types with configs
- Verify `STAGE_TEAM_MAP` maps all 25 stages correctly
- Verify Zod schemas validate `TeamDispatchRequest` correctly

### Integration Tests
- `POST /api/v2/teams/dispatch` with valid venture_id → 202 with task_contract_id
- `POST /api/v2/teams/dispatch` with duplicate active team → 409 conflict
- `GET /api/v2/chairman/insights?format=simple` → non-empty response with AgentActivity type
- `GET /api/v2/chairman/briefing` → `active_agents.total_working >= 0`

### Regression Tests
- All existing tests continue to pass (no imports of old names)
- No remaining references to `crew_assignments`, `CREW_REGISTRY`, or `CrewAssignment` in codebase
- Dashboard loads without 404 errors in console

## Risk Mitigation

### Risk 1: Queries that handled "always fails" may not handle "now returns rows"
- **Mitigation**: Review all 16 query sites — each has a success path (they render data). The 404 path was the error handler, not the primary path. The code was written to use the data; it just never got it.
- **Verification**: Manual walkthrough of each query's success path with sample data

### Risk 2: SSE event rename breaks undiscovered listeners
- **Mitigation**: Grep entire codebase for `crew_update` string to find all listeners. If any are outside the 14 known files, assess impact.
- **Fallback**: Emit both `crew_update` and `team_update` for one release cycle (add TODO to remove old name)

### Risk 3: RLS policies block legitimate queries
- **Mitigation**: Follow exact pattern from existing `eva_orchestration_layer` migration. Test with both chairman role and service_role.
- **Fallback**: If RLS blocks, queries return empty arrays (gracefully handled by existing error guards)

### Risk 4: dispatch.ts bug fix (task_contracts → agent_task_contracts) reveals more issues
- **Mitigation**: This is a simple table name fix. The insert payload is already correct for `agent_task_contracts` schema. Verify column names match before deploying.
