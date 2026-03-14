<!-- Archived from: docs/plans/architecture-phase-coverage-lifecycle-controls-architecture.md -->
<!-- SD Key: SD-LEO-ORCH-ARCHITECTURE-PHASE-COVERAGE-001 -->
<!-- Archived at: 2026-03-09T18:21:38.946Z -->

# Architecture Plan: Architecture Phase Coverage — Lifecycle Controls

## Stack & Repository Decisions

### Repository
- **EHG_Engineer**: Layers 0, 1, 3 (SD creation, gate, sd:next, backfill) — all backend/tooling
- **EHG App** (`rickfelix/ehg`): Layer 2 UI (Planning tab on Vision route) — frontend only

### Technology Stack (No Changes)
- **Backend**: Node.js ESM, Supabase (PostgreSQL)
- **Frontend**: React + TypeScript + Vite + Shadcn UI + Tailwind + @tanstack/react-query
- **Gate System**: Existing unified-handoff-system.js semantic gate framework

### New Patterns Introduced
- **Auto-generated SDs**: Draft SDs created programmatically from architecture plan phases (new pattern for `leo-create-sd.js`)
- **Cross-source roadmap items**: `roadmap_wave_items` extended beyond intake sources to include architecture phases

## Legacy Deprecation Plan

N/A — This extends existing systems. No replacements.

**Coexistence notes**:
- The existing LEAD-TO-PLAN `ARCHITECTURE_PHASE_COVERAGE` gate remains unchanged. The new LEAD-FINAL-APPROVAL gate is additive.
- The existing `roadmap_wave_items` table is extended (new source_type value), not replaced.
- Existing manually-created orchestrator children continue to work. Auto-generation only fills gaps.

## Route & Component Structure

### Modified Files (EHG_Engineer)
```
scripts/
  leo-create-sd.js                                    # Extend: auto-generate phase children
  modules/
    sd-next/
      roadmap-awareness.js                            # NEW: query unscheduled roadmap items
      index.js                                        # Modify: add roadmap section to output
    handoff/
      executors/
        lead-final-approval/
          gates/
            phase-coverage-exit.js                    # NEW: exit gate for phase coverage
          index.js                                    # Modify: register new gate
      validation/
        phase-coverage-validator.js                   # Extend: add "deferred" status support

scripts/
  backfill-uncovered-phases.js                        # NEW: one-time retroactive scan
```

### Modified Files (EHG App — Phase 2)
```
src/
  pages/
    chairman-v3/
      VisionAlignmentPage.tsx                         # Modify: add Planning tab (third tab)
  components/
    chairman-v3/
      planning/
        PlanningTab.tsx                               # NEW: main planning tab container
        WaveSequenceView.tsx                          # NEW: ordered wave list with progress
        WaveCard.tsx                                  # NEW: individual wave display
        UnscheduledItemsBanner.tsx                    # NEW: warning banner for unscheduled items
  hooks/
    useRoadmapData.ts                                 # NEW: fetch roadmap waves and items
```

## Data Layer

### Schema Changes

```sql
-- Extend roadmap_wave_items source_type constraint to include architecture phases
ALTER TABLE roadmap_wave_items
  DROP CONSTRAINT IF EXISTS roadmap_wave_items_source_type_check;
ALTER TABLE roadmap_wave_items
  ADD CONSTRAINT roadmap_wave_items_source_type_check
  CHECK (source_type IN ('todoist', 'youtube', 'architecture_phase'));

-- Add deferred_at and deferred_rationale to track explicit deferrals
-- (Stored in existing metadata JSONB column — no schema change needed)
```

### Auto-Generated SD Fields
When `leo-create-sd.js` creates draft SDs for architecture phases, the following fields are set:

```javascript
{
  title: phase.title,                           // From architecture plan
  status: 'draft',
  sd_type: phase.separate_orchestrator ? 'orchestrator' : 'child',
  parent_sd_id: phase.separate_orchestrator ? null : orchestratorId,
  metadata: {
    arch_key: archKey,                          // Link to architecture plan
    phase_number: phase.number,                 // Phase index
    auto_generated: true,                       // Distinguishes from manual
    source_description: phase.description,      // Phase description from arch plan
    depends_on_phase: phase.depends_on || null  // Phase dependency if specified
  }
}
```

### Key Queries

**Uncovered phases for an architecture plan:**
```sql
SELECT
  p.phase_number,
  p.title,
  p.covered_by_sd_key,
  sd.status as sd_status
FROM eva_architecture_plans eap,
  jsonb_array_elements(eap.sections->'implementation_phases') WITH ORDINALITY AS p(phase, phase_number)
LEFT JOIN strategic_directives_v2 sd ON sd.sd_key = p.phase->>'covered_by_sd_key'
WHERE eap.plan_key = $1
  AND (p.phase->>'covered_by_sd_key' IS NULL OR sd.status IS NULL);
```

**Unscheduled roadmap items (for sd:next):**
```sql
SELECT
  rwi.id,
  rwi.metadata->>'phase_title' as title,
  rwi.metadata->>'arch_key' as arch_key,
  rwi.metadata->>'deferred_rationale' as rationale,
  rwi.assigned_at
FROM roadmap_wave_items rwi
WHERE rwi.source_type = 'architecture_phase'
  AND rwi.promoted_to_sd_key IS NULL
ORDER BY rwi.assigned_at ASC;
```

**Roadmap waves with items and progress (for Planning tab):**
```sql
SELECT
  rw.id, rw.title, rw.sequence_rank, rw.status, rw.progress_pct,
  json_agg(json_build_object(
    'id', rwi.id,
    'source_type', rwi.source_type,
    'promoted_to_sd_key', rwi.promoted_to_sd_key,
    'metadata', rwi.metadata
  ) ORDER BY rwi.assigned_at) as items
FROM roadmap_waves rw
LEFT JOIN roadmap_wave_items rwi ON rwi.wave_id = rw.id
WHERE rw.roadmap_id = $1
GROUP BY rw.id
ORDER BY rw.sequence_rank;
```

### RLS
- No new RLS policies needed — existing service_role access for backend scripts, existing authenticated read for frontend queries

## API Surface

### No New RPC Functions Required
All operations use direct Supabase client queries (INSERT/SELECT/UPDATE). The auto-generation, gate check, and roadmap queries are all performed via the existing Supabase JS client.

### Existing APIs Extended
- `leo-create-sd.js` CLI — new `--arch-key` behavior: when provided, auto-generates phase SDs
- `phase-coverage-validator.js` — new `validatePhaseCoverageAtExit()` function that checks for completed (not just assigned) SDs

### New CLI Commands
```bash
# One-time retroactive scan
npm run backfill:uncovered-phases

# Existing command, enhanced output
npm run sd:next    # Now includes roadmap awareness section
```

## Implementation Phases

### Phase 1: Core Controls (EHG_Engineer — 3 children)

| Child | Description | Est. LOC | Dependencies |
|-------|-------------|----------|-------------|
| A | **Auto-generate phase SDs at orchestrator creation** — Extend `leo-create-sd.js` to parse architecture plan phases and create draft SDs. Update `covered_by_sd_key`. Handle "separate orchestrator" phases as parentless drafts. Skip phases that already have SDs. | ~120 | None |
| B | **Exit gate at LEAD-FINAL-APPROVAL** — New `phase-coverage-exit.js` gate. Reuse `phase-coverage-validator.js` logic but check for completed SDs (not just assigned). Support "deferred" marking with auto-promote to roadmap. Expand `roadmap_wave_items.source_type` constraint. | ~150 | None |
| C | **sd:next roadmap awareness + retroactive backfill** — New `roadmap-awareness.js` module for sd:next. Query unscheduled roadmap items. Format for terminal display. Backfill script to scan existing architecture plans. | ~130 | B (needs source_type constraint) |

**Phase 1 Deliverable**: No new gaps can form (Layer 0 + Layer 1). All existing gaps are surfaced in sd:next (Layer 3). Total: ~400 LOC.

### Phase 2: Chairman UI (EHG App — 1-2 children)

| Child | Description | Est. LOC | Dependencies |
|-------|-------------|----------|-------------|
| D | **Planning tab on Vision route** — Add third tab to `VisionAlignmentPage.tsx`. Build `PlanningTab.tsx`, `WaveSequenceView.tsx`, `WaveCard.tsx`, `UnscheduledItemsBanner.tsx`. Create `useRoadmapData.ts` hook. | ~350 | Phase 1 (roadmap data must exist) |

**Phase 2 Deliverable**: Chairman has full UI visibility of roadmap waves, progress, and unscheduled items. Total: ~350 LOC.

**Note**: Phase 2 also delivers the original Strategic Roadmap Phase 3 (Planning tab) that was silently dropped — closing the loop on the incident that motivated this work.

### Total Estimated LOC: ~750 across all phases

## Testing Strategy

### Unit Tests
- `leo-create-sd.js` extension — test auto-generation with 1, 3, 5 phases; test skipping existing children; test "separate orchestrator" handling
- `phase-coverage-exit.js` gate — test PASS (all phases complete), BLOCK (uncovered phases), PASS with advisory (deferred phases)
- `roadmap-awareness.js` — test with 0, 1, 5 unscheduled items; test formatting
- `backfill-uncovered-phases.js` — test with architecture plans that have full/partial/no coverage

### Integration Tests
- End-to-end: Create orchestrator with `--arch-key` → verify draft SDs created → verify `covered_by_sd_key` updated
- Gate flow: Complete Phase 1-2 children → attempt LEAD-FINAL-APPROVAL with Phase 3 uncovered → verify block
- Deferred flow: Mark Phase 3 as deferred → verify roadmap item created → verify gate passes with advisory
- sd:next flow: Create unscheduled roadmap items → run sd:next → verify roadmap section appears

### Manual Validation
- Create a test orchestrator with a 3-phase architecture plan
- Verify all 3 phases appear as draft SDs in sd:next
- Complete Phases 1-2, attempt completion → verify block
- Defer Phase 3 → verify it appears on roadmap and in sd:next
- Open `/chairman/vision` → Planning tab → verify unscheduled item visible

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Auto-generated SDs create noise in sd:next queue | Medium | Draft SDs are clearly labeled with `[auto-generated]` badge. sd:next already filters by status — drafts appear in the queue but at lower priority than READY/EXEC. |
| Architecture plans without structured `sections` data | Medium | Layer 0 gracefully skips if `sections.implementation_phases` is NULL. The backfill script (`backfill-architecture-sections.js`, already exists) can populate sections from markdown. |
| Exit gate blocks legitimate "Phase 3 is genuinely later" cases | High | "Deferred" escape hatch with required rationale. Deferred phases auto-promote to roadmap — they're not blocked, they're tracked. |
| Roadmap tab shows stale data | Low | `useRoadmapData` hook uses @tanstack/react-query with appropriate stale time. Roadmap items update when SDs are created via `promoted_to_sd_key`. |
| Retroactive backfill promotes too many items | Medium | Backfill is a one-time script that reports before writing. Can be run in dry-run mode first. Items can be dismissed from the roadmap if they're genuinely obsolete. |
| Performance impact on sd:next from roadmap query | Low | Single indexed query on `roadmap_wave_items` (small table). Adds <100ms to sd:next execution. |
