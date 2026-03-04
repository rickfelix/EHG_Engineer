# Architecture Plan: Explore Opportunities — Stage Zero UI Surface

## Stack & Repository Decisions

- **Repository**: `rickfelix/ehg` (the EHG web app)
- **Stack**: React + TypeScript + Shadcn UI + Tailwind CSS + TanStack Query + Supabase
- **No new dependencies**: All required packages are already in the project (lucide-react, date-fns, sonner, etc.)
- **Component style**: V3 Chairman Shell conventions — TypeScript, functional components, `cn()` for class merging, `data-testid` for testing, TanStack Query for data fetching
- **State management**: TanStack Query for server state; Zustand `chairman-ui` store for sidebar collapse (existing pattern)

## Legacy Deprecation Plan

### Do NOT port `OpportunitySourcingDashboard.jsx`
- Legacy JSX component from V1 app generation
- Different data access patterns, no V3 shell integration, no TypeScript
- **Decision**: Build a new `ExploreOpportunitiesPage.tsx` from scratch, consuming the existing service layer

### Reuse service layer as-is
- `ventureIdeationService.ts` — type-safe, already queries `opportunity_blueprints`
- `blueprintScoring.ts` — has 24h in-memory cache, `batchAssessBlueprints()` works
- `blueprintSelection.ts` — `selectBlueprint()` creates venture + records selection
- `opportunityToVentureAdapter.ts` — `transformBlueprint()` and `validateBlueprintForCreation()` are clean

### Import path standardization (prerequisite)
- `opportunityToVentureAdapter.ts` imports from `@/lib/supabase`
- `ventureIdeationService.ts` imports from `@/integrations/supabase/client`
- **Verify** both resolve to the same Supabase client instance. If not, standardize to `@/integrations/supabase/client` (V3 convention).

## Route & Component Structure

### Routes (in `chairmanRoutesV3.tsx`)
```
/chairman/opportunities          → ExploreOpportunitiesPage (lazy-loaded)
/chairman/opportunities/:id      → BlueprintDetailPage (Phase 3, lazy-loaded)
```

### Component Tree
```
src/pages/chairman-v3/
  ExploreOpportunitiesPage.tsx     # Page wrapper (follows existing pattern)

src/components/chairman-v3/opportunities/
  ExploreOpportunities.tsx         # Main component (blueprint list + nursery)
  BlueprintCard.tsx                # Individual blueprint with scores + actions
  NurserySection.tsx               # Parked ventures list with triggers
  StageZeroStatusBadge.tsx         # Work queue status indicator
  ExploreEmptyState.tsx            # Empty state with guidance
  ExploreBriefingCTA.tsx           # CTA card for BriefingDashboard.tsx

src/hooks/
  useOpportunityBlueprints.ts     # TanStack Query wrapper for blueprints
  useNurseryVentures.ts           # TanStack Query wrapper for parked ventures
  useStageZeroQueue.ts            # TanStack Query wrapper for work queue status
```

### Navigation Changes
```typescript
// chairman-nav-config.ts — add to chairmanNavItems array
import { Telescope } from "lucide-react";
{ path: "/chairman/opportunities", label: "Explore", icon: Telescope, section: "chairman" }

// mobilePrimaryTabs — NO CHANGE (Explore excluded, same as Prefs)
```

## Data Layer

### Existing Tables (read)
| Table | Query | Purpose |
|-------|-------|---------|
| `opportunity_blueprints` | `.select('*').order('opportunity_score', {ascending: false})` | Blueprint list with scores |
| `ventures` | `.select('*').eq('status', 'parked').order('updated_at', {ascending: false})` | Nursery ventures |

### New Table: `stage_zero_requests` (work queue)
```sql
CREATE TABLE stage_zero_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID REFERENCES opportunity_blueprints(id),
  requested_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'in_progress', 'completed', 'failed')),
  venture_id UUID REFERENCES ventures(id),  -- populated on completion
  error_message TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- RLS: Only authenticated users can insert/read their own requests
ALTER TABLE stage_zero_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own requests"
  ON stage_zero_requests FOR INSERT
  WITH CHECK (auth.uid() = requested_by);

CREATE POLICY "Users can read their own requests"
  ON stage_zero_requests FOR SELECT
  USING (auth.uid() = requested_by);

-- Index for Claude Code polling
CREATE INDEX idx_stage_zero_pending ON stage_zero_requests(status)
  WHERE status IN ('pending', 'claimed');
```

### Mutations
| Action | Service Method | Table Effect |
|--------|---------------|--------------|
| Approve blueprint | `ventureIdeationService.updateBlueprintStatus(id, 'approved')` + insert `stage_zero_requests` | Blueprint status → approved, work queue → pending |
| Park blueprint | `ventureIdeationService.updateBlueprintStatus(id, 'parked')` | Blueprint status → parked (nursery) |
| Reject blueprint | `ventureIdeationService.updateBlueprintStatus(id, 'rejected')` | Blueprint status → rejected |
| Reactivate nursery | `UPDATE ventures SET status = 'active' WHERE id = ?` | Venture moves back to active review |

### TanStack Query Configuration
```typescript
// useOpportunityBlueprints.ts
useQuery({
  queryKey: ['opportunity-blueprints'],
  queryFn: () => ventureIdeationService.getOpportunityBlueprints(),
  staleTime: 2 * 60 * 1000,  // 2 min
});

// useStageZeroQueue.ts
useQuery({
  queryKey: ['stage-zero-queue'],
  queryFn: () => supabase
    .from('stage_zero_requests')
    .select('*')
    .in('status', ['pending', 'claimed', 'in_progress'])
    .order('requested_at', { ascending: false }),
  refetchInterval: 10_000,  // Poll every 10s for status updates
});

// useNurseryVentures.ts
useQuery({
  queryKey: ['nursery-ventures'],
  queryFn: () => supabase
    .from('ventures')
    .select('id, name, status, updated_at, metadata')
    .eq('status', 'parked')
    .order('updated_at', { ascending: false }),
  staleTime: 5 * 60 * 1000,  // 5 min
});
```

## API Surface

### Existing APIs (consumed as-is)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| Supabase: `opportunity_blueprints` | SELECT/UPDATE | Blueprint CRUD |
| Supabase: `ventures` | SELECT | Nursery query |
| `blueprintScoring.batchAssessBlueprints()` | Client-side | Batch scoring with cache |
| `blueprintSelection.selectBlueprint()` | Client-side + Supabase | Venture creation from blueprint |

### New: Work Queue Insert (client-side)
```typescript
// In useStageZeroQueue.ts or a mutation hook
async function requestStageZero(blueprintId: string) {
  const { data, error } = await supabase
    .from('stage_zero_requests')
    .insert({
      blueprint_id: blueprintId,
      requested_by: (await supabase.auth.getUser()).data.user?.id,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

### Claude Code Pickup (backend/CLI side)
Claude Code reads pending work queue items during `sd:next` or a dedicated check:
```sql
SELECT * FROM stage_zero_requests
WHERE status = 'pending'
ORDER BY requested_at ASC
LIMIT 1;
```
Then updates to `claimed`/`in_progress` as it processes, and `completed` with `venture_id` when done.

## Implementation Phases

### Phase 1: MVP (2 focused days)
**Deliverables**:
- `ExploreOpportunitiesPage.tsx` with blueprint card list
- `BlueprintCard.tsx` with scores + approve/park/reject actions
- `ExploreEmptyState.tsx` for empty blueprint state
- Route in `chairmanRoutesV3.tsx`
- Nav item in `chairman-nav-config.ts`
- `ExploreBriefingCTA.tsx` in `BriefingDashboard.tsx`
- `useOpportunityBlueprints.ts` hook
- Schema verification of import paths and table columns

**Deferred**: Work queue table, nursery section, detail view

### Phase 2: Work Queue + Nursery (1-2 days)
**Deliverables**:
- `stage_zero_requests` table migration
- `useStageZeroQueue.ts` hook with polling
- `StageZeroStatusBadge.tsx` component
- `NurserySection.tsx` with parked ventures and trigger dates
- `useNurseryVentures.ts` hook

### Phase 3: Decision Signals (2-3 days)
**Deliverables**:
- `BlueprintDetailPage.tsx` at `/chairman/opportunities/:id`
- Stage-of-death prediction visualization
- Counterfactual summary panel
- Full scoring breakdown (capability alignment, portfolio synergy, competitive gaps)
- Blueprint comparison view

### Phase 4: Full Stage 0 Flow (future)
**Deliverables**:
- Multi-step commit wizard
- Manual idea entry alongside blueprint selection
- Claude Code result ingestion callback
- Nursery reactivation triggers (automated)

## Testing Strategy

### Unit Tests
- `BlueprintCard.tsx`: Renders correct scores, fires approve/park/reject callbacks, handles missing data
- `ExploreEmptyState.tsx`: Renders guidance text, no error state
- `useOpportunityBlueprints.ts`: TanStack Query configuration, error handling
- `StageZeroStatusBadge.tsx`: Renders correct status for pending/in_progress/completed/failed

### Integration Tests
- Blueprint list loads from Supabase mock, renders cards
- Approve action calls `updateBlueprintStatus` + inserts work queue record
- Empty state shows when no blueprints exist
- Nursery section shows parked ventures with trigger dates

### E2E Tests (Playwright)
- Navigate to `/chairman/opportunities` via sidebar
- Navigate via briefing CTA on `/chairman`
- Approve a blueprint and verify work queue record created
- Verify mobile layout (no 6th tab, CTA accessible)

## Risk Mitigation

### Risk 1: Blueprint pipeline is empty (no data to show)
- **Mitigation**: Clear empty state component with actionable guidance: "No opportunity blueprints available. The competitive intelligence pipeline generates blueprints from market scanning. Contact your builder to configure market segments."
- **Fallback**: Show R&D opportunities from brainstorm sessions as an alternative source

### Risk 2: Supabase import path divergence
- **Mitigation**: Phase 1 prerequisite — verify `@/lib/supabase` and `@/integrations/supabase/client` resolve to the same instance. Standardize if they don't.
- **Detection**: Schema verification sprint on Day 1

### Risk 3: Work queue items never picked up (Claude Code not running)
- **Mitigation**: `StageZeroStatusBadge` shows time-since-request. After 1 hour with no status change, show warning: "Pending for 1h — ensure Claude Code is running."
- **Escalation**: After 24h, auto-transition to `failed` with message

### Risk 4: Scope creep — trying to build full Stage 0 wizard in MVP
- **Mitigation**: Strict phase boundaries. Phase 1 is browse + approve/park/reject only. Decision signals and wizard flow are Phase 3+.
- **Gate**: Each phase ships as a separate PR. No phase includes work from the next phase.

### Risk 5: `sd_phase_handoffs` FK constraint rejects blueprint-sourced ventures
- **Mitigation**: Verify during schema sprint. `blueprintSelection.ts` already handles this gracefully (logs error, returns success). If FK is blocking, use a different handoff mechanism or make handoff creation non-blocking.
