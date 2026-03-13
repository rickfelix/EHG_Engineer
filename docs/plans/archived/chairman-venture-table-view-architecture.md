# Architecture Plan: Chairman Venture Table View

## Stack & Repository Decisions

**Repository**: `rickfelix/ehg` (frontend app)
**Stack**: React + TypeScript + Shadcn UI + Tailwind CSS + @tanstack/react-query
**Pattern Reference**: `src/components/chairman-v3/operations/OperationsDashboard.tsx`

No new dependencies. All UI components (Table, Badge, Card) already in Shadcn. No backend changes for Phase 1.

## Legacy Deprecation Plan

### Components to Remove
| Component | Location | Lines | Replacement |
|-----------|----------|-------|-------------|
| VentureLifecycleMap | `src/components/chairman-v3/VentureLifecycleMap.tsx` | ~263 | VentureTable (new) |
| VentureDetailDrawer | Inline in VentureLifecycleMap (lines 123-186) | ~63 | Removed (row click navigates) |
| SwimlaneColumnView | Inline in VentureLifecycleMap (lines 82-121) | ~40 | Removed |

### Hook to Refactor
| Hook | Location | Change |
|------|----------|--------|
| useVentureLifecycle | `src/hooks/useVentureLifecycle.ts` | Remove swimlane grouping, add sort/filter state, flatten to array |

### Files Untouched
- `src/pages/chairman-v3/VentureLifecyclePage.tsx` — wrapper, just imports (may update import name)
- `src/pages/chairman-v3/VentureDetailPage.tsx` — detail page, no changes
- `src/pages/VentureDetail.tsx` — 8-tab detail, no changes
- All route definitions — routes unchanged

## Route & Component Structure

### Component Tree
```
VentureLifecyclePage (page wrapper)
  └── VentureTable (new component, replaces VentureLifecycleMap)
        ├── Summary Cards (Total, Active, Avg AI Score, Near Gate)
        ├── PhaseDistribution (venture count chips per phase)
        └── Table
              ├── TableHeader (sortable column headers)
              └── TableBody
                    └── TableRow (clickable → navigate to /chairman/ventures/:id)
                          ├── Name cell
                          ├── Status badge
                          ├── Phase badge (from venture-workflow.ts)
                          ├── Stage (N/25)
                          ├── AI Score (colored)
                          ├── Next Gate (computed from VENTURE_STAGES)
                          └── Last Activity (timeAgo)
```

### New Files
| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/components/chairman-v3/ventures/VentureTable.tsx` | Main table component | ~120 |
| `src/components/chairman-v3/ventures/PhaseDistribution.tsx` | Phase count chips | ~30 |
| `src/components/chairman-v3/ventures/index.ts` | Barrel export | ~3 |

### Modified Files
| File | Change | Est. Delta |
|------|--------|-----------|
| `src/hooks/useVentureLifecycle.ts` | Remove swimlane grouping, add sort state | ~-20, +30 |
| `src/pages/chairman-v3/VentureLifecyclePage.tsx` | Update import to VentureTable | ~2 lines |

### Deleted Files
| File | Reason |
|------|--------|
| `src/components/chairman-v3/VentureLifecycleMap.tsx` | Replaced by VentureTable |

## Data Layer

### Supabase Query (existing, refactored)
The current `useVentureLifecycle` hook queries:
```sql
SELECT id, name, status, current_lifecycle_stage, ai_score, validation_score,
       risk_score, updated_at, pipeline_mode
FROM ventures
WHERE status = 'active'
ORDER BY current_lifecycle_stage ASC
```

**Refactored hook** removes the swimlane column grouping and returns a flat array with computed fields:
```typescript
interface VentureTableRow {
  id: string;
  name: string;
  status: string;
  stage: number;           // current_lifecycle_stage
  phase: string;           // computed from VENTURE_STAGES config
  aiScore: number;
  nextGate: {              // computed from VENTURE_STAGES
    type: 'kill' | 'promotion';
    stageNumber: number;
    distance: number;      // stages until gate
  } | null;
  lastActivity: string;    // updated_at as timeAgo
  pipelineMode: string;    // for Phase 2
}
```

### Phase Distribution Query
Derived client-side from the ventures array — no additional DB query:
```typescript
const phaseCounts = ventures.reduce((acc, v) => {
  const stage = VENTURE_STAGES.find(s => s.stageNumber === v.stage);
  const phase = stage?.chunk ?? 'unknown';
  acc[phase] = (acc[phase] || 0) + 1;
  return acc;
}, {});
```

### Next Gate Computation
Derived client-side from `VENTURE_STAGES` config:
```typescript
function getNextGate(currentStage: number): NextGate | null {
  const gates = VENTURE_STAGES.filter(s => s.gateType !== 'none' && s.stageNumber > currentStage);
  if (gates.length === 0) return null;
  const next = gates[0];
  return { type: next.gateType, stageNumber: next.stageNumber, distance: next.stageNumber - currentStage };
}
```

### RLS
No changes — existing RLS policies on `ventures` table apply.

## API Surface
No new API endpoints for Phase 1. All data comes from existing Supabase queries.

**Phase 2 dependency**: `GET /api/eva/exit/portfolio` (bulk exit summary) from Venture Architecture ORCH-001.

## Implementation Phases

### Phase 1: Core Table View (This SD — ~200 LOC)
1. Create `VentureTable.tsx` — Shadcn Table with 7 columns, summary cards, phase chips
2. Create `PhaseDistribution.tsx` — compact phase count badges
3. Refactor `useVentureLifecycle.ts` — flatten data, add sort state, compute next-gate
4. Update `VentureLifecyclePage.tsx` — swap import
5. Delete `VentureLifecycleMap.tsx`
6. Test: ventures render in table, rows navigate to detail, sort works, phase chips accurate

### Phase 2: Exit-Readiness Columns (Follow-up SD)
- Blocked on: bulk exit summary endpoint from ORCH-001
- Add 3 columns: Pipeline Mode badge, Asset Count, Exit Model
- Add filter: dropdown by pipeline mode
- ~80 LOC additional

### Phase 3: Advanced Features (Future)
- Column show/hide preferences
- Saved filter presets
- Export to CSV/PDF
- Inline quick actions

## Testing Strategy

### Unit Tests (Vitest)
- `getNextGate()` — correct gate computation for each stage
- Phase distribution — correct counts for sample venture arrays
- Sort comparator — ascending/descending for each sortable column

### Component Tests (Vitest + React Testing Library)
- VentureTable renders correct number of rows
- Clicking a row calls `navigate` with correct venture ID
- Summary cards show correct totals
- Phase distribution chips show correct counts
- Sort toggles update column order

### E2E Tests (Playwright)
- Navigate to `/chairman/ventures` → table renders with venture rows
- Click a venture row → navigates to `/chairman/ventures/:id`
- Click column header → rows re-sort
- Phase chips reflect correct venture distribution

### Visual Regression
- Screenshot comparison of table view vs Operations page (pattern consistency)

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| 6-phase restructuring lands after this SD | Low | Table uses `VENTURE_STAGES` config — phase is computed from stage number, not hardcoded. Restructuring changes config, table adapts automatically. |
| Empty exit-readiness columns if Phase 2 ships before data exists | Medium | Defer exit columns to Phase 2. Only add when bulk endpoint AND venture data exist. |
| VentureDetail page stub tabs exposed as primary landing | Low | Separate concern — can hide stubs in a follow-up. Table navigates to existing page as-is. |
| Spatial lifecycle awareness lost | Low | PhaseDistribution chips above table preserve at-a-glance clustering signal. |
| N+1 queries for exit data in Phase 2 | Medium | Accept for small portfolio (7 ventures). Add bulk endpoint before scaling. |
