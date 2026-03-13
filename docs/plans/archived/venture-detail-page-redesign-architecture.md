# Architecture Plan: Venture Detail Page Redesign — Mode-Aware Progressive Reveal

## Stack & Repository Decisions

**Repository**: `rickfelix/ehg` (frontend application)
**Stack**: Vite + React + TypeScript + Shadcn UI + Tailwind + Recharts + @tanstack/react-query (no changes)
**Supabase**: Existing schema — no new tables, existing columns/views reused

**Key architectural decision**: The Venture Detail page becomes a **mode-switching container** that renders different hero + tab configurations based on `ventures.pipeline_mode`. All mode logic lives in a single route component that delegates to mode-specific sub-components.

## Legacy Deprecation Plan

### Phase 0 Deprecation & Deletion (prerequisite — separate SD)
| Target | Current State | Action |
|--------|--------------|--------|
| `WORKFLOW_STAGES` (40 stages) in `workflows.ts` | Exported, used by 3+ components | **DELETE** export, replace consumers with `VENTURE_STAGES` from `venture-workflow.ts` |
| `DEFAULT_STAGE_LIMIT = 40` in `tierRouting.ts` | Fallback for null tier | Change to `TOTAL_STAGES = 25` from `venture-workflow.ts` |
| Hardcoded `40` in ~15 files | Various `/ 40`, `of 40` patterns | Replace with `TOTAL_STAGES` import |
| `metadata.tier` read in VentureDetail.tsx | Line 125: reads undefined metadata field | Read `venture.tier` DB column directly |
| `WorkflowProgress.tsx` | Uses deprecated WORKFLOW_STAGES | **DELETE** — built on deprecated 40-stage system |

### Phase 1 Deletion (during building mode redesign)
| Target | Current State | Action |
|--------|--------------|--------|
| 8-tab layout in VentureDetail.tsx | Static tabs regardless of mode | **DELETE** — replace with mode-aware 4-tab configurations |
| Overview tab component | Always visible | **DELETE** — data integrated into BuildingHero |
| Research tab component | Always visible | **DELETE** — relevant data moved to ArtifactsTab |
| Brand tab component | Always visible | **DELETE** — relevant data moved to ArtifactsTab |
| Team tab component | Always visible | **DELETE** — not needed in redesign |
| Timeline tab component | Always visible | **DELETE** — replaced by new TimelineTab with 25-stage interactive view |
| Exit tab component | Always visible | **DELETE** — relevant data moved to FinancialsTab |

### Post-Phase 2 Cleanup (dedicated cleanup SD)
| Target | Current State | Action |
|--------|--------------|--------|
| Orphaned imports | References to deleted components | **DELETE** all orphaned imports across codebase |
| Dead utility functions | Helpers only used by deleted components | **DELETE** unused utilities |
| Stale type definitions | Types for deleted tab props | **DELETE** unused type exports |
| Test files for deleted components | Tests referencing removed components | **DELETE** or update to test new components |

## Route & Component Structure

### Routes
```
/chairman/ventures/:id              → VentureDetail (mode-switching container)
/chairman/ventures/:id/stage/:num   → StagePage (new route)
/chairman/operations/:ventureId     → OperationsDashboard (preserved, unchanged)
```

### Component Architecture
```
VentureDetail/
├── VentureDetailContainer.tsx      # Route component — fetches venture, delegates to mode
├── modes/
│   ├── BuildingMode.tsx            # pipeline_mode='building' layout
│   └── OperationsMode.tsx          # pipeline_mode='operations' layout
├── hero/
│   ├── BuildingHero.tsx            # Stage progress + phase + progress bar
│   ├── OperationsHero.tsx          # Health + revenue + AI agents + journey badge
│   └── DecisionCard.tsx            # Gate decision card (shared between modes)
├── tabs/
│   ├── building/
│   │   ├── ArtifactsTab.tsx        # Stage artifacts with quality scores
│   │   ├── RisksTab.tsx            # EVA-generated risks
│   │   ├── TimelineTab.tsx         # 25-stage interactive timeline
│   │   └── FinancialsTab.tsx       # Financial model, burn rate
│   └── operations/
│       ├── HealthTab.tsx           # Health trends, satisfaction, churn
│       ├── RevenueTab.tsx          # MRR, growth, projections
│       ├── AIAgentsTab.tsx         # Agent status, errors, capacity
│       └── RiskSignalsTab.tsx      # Declining metrics, alerts
├── shared/
│   ├── JourneyBadge.tsx            # Collapsed/expanded journey timeline
│   ├── GateEvidencePanel.tsx       # Inline expansion for gate review
│   └── AdvisoryCheckpoints.tsx     # 3 advisory checkpoint status display
└── stage/
    └── StagePage.tsx               # Dedicated stage artifact checklist page

hooks/
├── useVentureMode.ts               # Returns mode-specific config based on pipeline_mode
├── useNextGate.ts                  # Calculates next kill/promotion gate for current stage
├── useStageArtifacts.ts            # Fetches artifacts for a specific stage
├── useOperationsTriggers.ts        # Monitors health/revenue/agent thresholds
└── useVentureRisks.ts              # EVA-generated risk analysis
```

### Mode-Switching Logic
```typescript
// VentureDetailContainer.tsx (pseudocode)
function VentureDetailContainer() {
  const { venture } = useVenture(ventureId);
  const mode = venture.pipeline_mode; // 'building' | 'operations' | ...

  switch (mode) {
    case 'building':
      return <BuildingMode venture={venture} />;
    case 'operations':
    case 'growth':
    case 'scaling':
    case 'exit_prep':
    case 'divesting':
    case 'sold':
      return <OperationsMode venture={venture} mode={mode} />;
    default:
      return <BuildingMode venture={venture} />; // safe fallback
  }
}
```

## Data Layer

### Existing Tables Used (no schema changes)
| Table | Usage |
|-------|-------|
| `ventures` | `pipeline_mode`, `tier`, `currentWorkflowStage`, `health_score` |
| `venture_artifacts` | Stage artifacts with `quality_score`, `validation_status` |
| `lifecycle_stage_config` | 25 stages with phase groupings, descriptions |
| `advisory_checkpoints` | 3 checkpoints: Validation@3, Profitability@5, Schema Firewall@16 |

### Key Queries
```typescript
// useNextGate.ts — find next decision point
const nextGate = VENTURE_STAGES
  .filter(s => s.stageNumber > currentStage)
  .find(s => s.gateType === 'kill' || s.gateType === 'promotion');

// useStageArtifacts.ts — artifacts for a specific stage
const { data } = await supabase
  .from('venture_artifacts')
  .select('*, quality_score, validation_status')
  .eq('venture_id', ventureId)
  .eq('stage_number', stageNumber);

// useOperationsTriggers.ts — detect intervention triggers
const triggers = [];
if (venture.health_score < 70) triggers.push({ type: 'health_drop', ... });
if (revenueChange < -0.10) triggers.push({ type: 'revenue_decline', ... });
if (agentErrorRate > threshold) triggers.push({ type: 'agent_errors', ... });
```

### RLS Requirements
- No new RLS policies needed — existing venture-level access controls apply
- Stage page uses same `venture_id` access as parent venture detail

## API Surface

### No New RPC Functions
All data is fetched via existing Supabase client queries on existing tables. No new server-side functions needed.

### Existing Hooks Reused
| Hook | Source | Purpose |
|------|--------|---------|
| `useVentureOperations` | `useVentureOperations.ts` | Health, revenue, agent data for operations mode |
| `useWorkflowExecution` | `useWorkflowExecution.ts` | Stage execution progress (already uses `totalStages: 25`) |

## Implementation Phases

### Phase 0: Foundation Fix (1 SD, ~50 LOC)
**Deliverables**: Fix the "40-stage" bug across the codebase
- Replace `DEFAULT_STAGE_LIMIT = 40` with `TOTAL_STAGES = 25`
- Fix `VentureDetail.tsx:125` to read `venture.tier` instead of `metadata.tier`
- Migrate all hardcoded `40` references in ~15 files
- Remove deprecated `WORKFLOW_STAGES` from `workflows.ts` and update consumers
- **Prerequisite**: Must complete before Phase 1

### Phase 1: Building Mode Redesign (2-3 SDs)
**Deliverables**: New VentureDetail page for building mode
- SD 1A: VentureDetailContainer + BuildingMode + BuildingHero + DecisionCard
- SD 1B: 4 building tabs (Artifacts, Risks, Timeline, Financials)
- SD 1C: StagePage route + StageArtifacts component + navigation from timeline
- **Dependencies**: Phase 0 complete

### Phase 2: Operations Mode (2 SDs)
**Deliverables**: Operations mode transformation
- SD 2A: OperationsMode + OperationsHero + JourneyBadge (collapsed/expanded)
- SD 2B: 4 operations tabs (Health, Revenue, AI Agents, Risk Signals) + trigger-based DecisionCard
- **Dependencies**: Phase 1 complete (shared components like DecisionCard exist)

### Phase 3: Polish & Additional Modes (future, 1-2 SDs)
**Deliverables**: Growth/scaling/exit modes, animations, mobile polish
- Define content configurations for growth, scaling, exit_prep, divesting, sold
- Transition animations between modes
- Mobile responsiveness improvements
- **Dependencies**: Phase 2 complete

## Testing Strategy

### Unit Tests
- `useNextGate` — correct gate calculation for each stage
- `useVentureMode` — correct mode config for each pipeline_mode
- `useOperationsTriggers` — trigger detection for health/revenue/agent thresholds
- Mode-switching logic — correct component rendered per pipeline_mode

### Integration Tests
- VentureDetailContainer renders BuildingMode when `pipeline_mode='building'`
- VentureDetailContainer renders OperationsMode when `pipeline_mode='operations'`
- DecisionCard inline expansion shows correct evidence
- Timeline stage click navigates to `/ventures/:id/stage/:num`

### E2E Tests
- Full building mode flow: view stage → see gate → review evidence → advance
- Operations mode: view health → trigger fires → decision card appears
- Journey badge: collapse/expand cycle
- Stage page: navigate from timeline → view artifact checklist → navigate back

## Risk Mitigation

### Risk 1: Mode-switching breaks for unknown pipeline_modes
**Mitigation**: Default fallback to BuildingMode for any unrecognized pipeline_mode. Log warning for monitoring.

### Risk 2: Operations data hooks may not exist for all metrics
**Mitigation**: Phase 2 starts by auditing existing `useVentureOperations` hook. Missing data shows "No data available" rather than failing.

### Risk 3: 40→25 migration breaks other pages that depend on stage counts
**Mitigation**: Phase 0 is a standalone SD with comprehensive grep + test coverage. All 40-references are identified and migrated atomically.

### Risk 4: Stage page route conflicts with existing routes
**Mitigation**: New route `/ventures/:id/stage/:num` is nested under existing `/ventures/:id` — no conflict with current routes. Added to `chairmanRoutesV3.tsx`.

### Risk 5: EVA risk generation not yet available for all venture stages
**Mitigation**: Risks tab shows "No risks identified" when EVA returns empty results. Tab remains functional as a container for future EVA integration.
