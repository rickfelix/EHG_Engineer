# Architecture Plan: Strategic Roadmap — New Artifact Type for EVA Planning Pipeline

## Stack & Repository Decisions

- **Repository**: EHG_Engineer (backend/tooling) for schema, clustering, CLI; EHG (frontend) for Chairman UI tab
- **Runtime**: Node.js (ESM modules, consistent with existing EVA scripts)
- **Database**: Supabase (PostgreSQL) — new tables with FK references to existing intake, OKR, and vision tables
- **LLM**: Claude Haiku via existing `getLLMClient({ purpose: 'triage' })` routing for wave clustering proposals
- **Interaction**: AskUserQuestion tool for Chairman wave review and sequence approval
- **Frontend**: React + TypeScript + Shadcn UI (EHG app stack) for Planning tab on Vision route
- **No new dependencies required** — all needed packages already installed

## Legacy Deprecation Plan

N/A — This is a new artifact type. No existing systems are being replaced.

**Coexistence note**: The existing `sd_execution_baselines` table tracks SD execution plans. The new `roadmap_baseline_snapshots` table tracks pre-SD planning sequences. These are complementary systems at different lifecycle stages, not replacements. No migration or deprecation needed.

## Route & Component Structure

### New Files (EHG_Engineer)
```
database/
  migrations/
    YYYYMMDD_strategic_roadmap_tables.sql     # Schema for all roadmap tables
lib/
  integrations/
    roadmap-clusterer.js                       # AI clustering engine (intake items → wave proposals)
    roadmap-manager.js                         # CRUD operations, baseline snapshots, OKR linkage
    roadmap-taxonomy.js                        # Wave status enum, validation, OKR linkage rules
scripts/
  roadmap-propose.js                           # CLI: npm run roadmap:propose
  roadmap-approve.js                           # CLI: npm run roadmap:approve (interactive)
  roadmap-status.js                            # CLI: npm run roadmap:status
```

### New Files (EHG Frontend — Phase 3)
```
src/
  components/
    chairman-v2/
      planning/
        PlanningTab.tsx                         # Main planning tab container
        WaveSequenceView.tsx                    # Ordered wave list with dependency arrows
        OKRWaveDashboard.tsx                    # Bidirectional OKR-to-wave mapping
        BaselineChangeLog.tsx                   # Baseline version history
        WaveCard.tsx                            # Individual wave display component
```

### Modified Files
```
package.json                                   # Add roadmap:propose, roadmap:approve, roadmap:status scripts
lib/integrations/leo-create-sd.js              # Add --from-wave <wave-id> flag (Phase 2)
```

### Module Organization
- `roadmap-taxonomy.js` — Pure data module: wave status enum (proposed/approved/active/complete), validation functions, OKR linkage rules. No side effects.
- `roadmap-clusterer.js` — AI clustering engine: loads classified intake items, calls LLM for grouping proposals, assigns confidence scores, generates wave candidates with unifying themes.
- `roadmap-manager.js` — Stateful manager: creates/updates roadmaps, manages wave CRUD, handles baseline snapshots, manages OKR linkage, coordinates wave-to-SD promotion.
- CLI scripts — Thin wrappers that parse flags, initialize Supabase client, and call manager functions.

## Data Layer

### Schema (New Tables)

```sql
-- Strategic Roadmaps (one per vision/planning context)
CREATE TABLE strategic_roadmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  vision_key TEXT REFERENCES eva_vision_documents(vision_key),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  current_baseline_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Roadmap Waves (ordered clusters within a roadmap)
CREATE TABLE roadmap_waves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id UUID NOT NULL REFERENCES strategic_roadmaps(id) ON DELETE CASCADE,
  sequence_rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  theme TEXT,                                   -- Unifying theme description
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'active', 'completed', 'archived')),
  dependency_rationale TEXT,                    -- Why this wave is ordered here
  depends_on_wave_ids UUID[] DEFAULT '{}',      -- FK-like array of wave IDs this depends on
  okr_objective_ids UUID[] DEFAULT '{}',        -- Existing OKRs this wave advances
  proposed_okrs JSONB DEFAULT '[]'::jsonb,      -- New OKRs proposed by this wave (Phase 2)
  confidence_score NUMERIC(3,2),                -- AI clustering confidence
  progress_pct NUMERIC(5,2) DEFAULT 0,          -- Computed from item/SD completion
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (roadmap_id, sequence_rank)
);

-- Wave Items (classified intake items assigned to waves)
CREATE TABLE roadmap_wave_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id UUID NOT NULL REFERENCES roadmap_waves(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('todoist', 'youtube')),
  source_id UUID NOT NULL,                      -- FK to eva_todoist_intake.id or eva_youtube_intake.id
  promoted_to_sd_key TEXT,                      -- SD created from this item (when promoted)
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (wave_id, source_type, source_id)
);

-- Baseline Snapshots (versioned record of approved wave sequences)
CREATE TABLE roadmap_baseline_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roadmap_id UUID NOT NULL REFERENCES strategic_roadmaps(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  wave_sequence JSONB NOT NULL,                 -- Snapshot of wave ordering at time of approval
  change_rationale TEXT,                        -- Why the sequence changed from previous version
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT DEFAULT 'chairman',
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE (roadmap_id, version)
);

-- Index for fast wave-item lookups
CREATE INDEX idx_wave_items_source ON roadmap_wave_items(source_type, source_id);
CREATE INDEX idx_waves_roadmap ON roadmap_waves(roadmap_id, sequence_rank);
CREATE INDEX idx_baselines_roadmap ON roadmap_baseline_snapshots(roadmap_id, version);

-- Optional: Add roadmap_wave_id to strategic_directives_v2 for wave-to-SD linkage (Phase 2)
-- ALTER TABLE strategic_directives_v2 ADD COLUMN roadmap_wave_id UUID REFERENCES roadmap_waves(id);
```

### Key Queries

**Unassigned classified items (ready for clustering):**
```sql
SELECT id, title, description, target_application, target_aspects, chairman_intent
FROM eva_todoist_intake
WHERE target_application IS NOT NULL
  AND id NOT IN (SELECT source_id FROM roadmap_wave_items WHERE source_type = 'todoist')
ORDER BY classified_at ASC;
```

**Current roadmap with waves:**
```sql
SELECT r.*, json_agg(
  json_build_object(
    'id', w.id,
    'sequence_rank', w.sequence_rank,
    'title', w.title,
    'status', w.status,
    'item_count', (SELECT COUNT(*) FROM roadmap_wave_items wi WHERE wi.wave_id = w.id),
    'progress_pct', w.progress_pct
  ) ORDER BY w.sequence_rank
) as waves
FROM strategic_roadmaps r
LEFT JOIN roadmap_waves w ON w.roadmap_id = r.id
WHERE r.status = 'active'
GROUP BY r.id;
```

**Baseline change history:**
```sql
SELECT version, change_rationale, wave_sequence, approved_at
FROM roadmap_baseline_snapshots
WHERE roadmap_id = $1
ORDER BY version DESC;
```

### RLS
- No RLS changes needed — existing service_role_key access pattern used by all EVA scripts

## API Surface

### CLI Commands
```bash
# Propose wave clusters from unassigned classified items
npm run roadmap:propose

# Interactive Chairman review of proposed waves
npm run roadmap:approve

# Show current roadmap progress
npm run roadmap:status

# Promote approved wave to SD creation (Phase 2)
npm run roadmap:promote -- --wave-id <uuid>
```

### Internal APIs (module exports)

```javascript
// roadmap-taxonomy.js
export const WAVE_STATUSES = ['proposed', 'approved', 'active', 'completed', 'archived'];
export const ROADMAP_STATUSES = ['draft', 'active', 'archived'];
export function validateWave(wave) { ... }
export function validateSequence(waves) { ... }

// roadmap-clusterer.js
export async function proposeWaves(classifiedItems, llmClient, options) { ... }
export async function computeClusterConfidence(cluster) { ... }

// roadmap-manager.js
export async function createRoadmap(supabase, title, visionKey) { ... }
export async function getActiveRoadmap(supabase) { ... }
export async function addWave(supabase, roadmapId, wave) { ... }
export async function resequenceWaves(supabase, roadmapId, newOrder) { ... }
export async function approveSequence(supabase, roadmapId, rationale) { ... }
export async function getBaselineHistory(supabase, roadmapId) { ... }
export async function promoteWaveToSDs(supabase, waveId) { ... }
export async function getRoadmapStats(supabase) { ... }
```

### No REST/RPC endpoints in Phase 1 — CLI-only workflow. Chairman UI API (Phase 3) will use Supabase client directly.

## Implementation Phases

### Phase 1: Schema + Core Clustering (Child SD 1-2)
- **Child 1**: Database migration for all roadmap tables
  - Create `strategic_roadmaps`, `roadmap_waves`, `roadmap_wave_items`, `roadmap_baseline_snapshots`
  - Build `roadmap-taxonomy.js` with enum definitions and validation
  - Run migration, verify FK references to existing tables
  - **Deliverable**: Database ready for roadmap data
  - **Estimate**: ~80 LOC (SQL + taxonomy module)
  - **Prerequisite**: None (schema can be built before intake classification ships)

- **Child 2**: AI clustering engine + CLI tooling
  - Build `roadmap-clusterer.js` with LLM-driven grouping
  - Build `roadmap-manager.js` with CRUD, baseline snapshots, read-only OKR linkage
  - Build CLI scripts (propose, approve, status)
  - **Deliverable**: Working clustering and approval flow
  - **Estimate**: ~200-250 LOC
  - **Prerequisite**: Intake Redesign Phase 1 (classification columns populated)

### Phase 2: SD Promotion + OKR Write Path (Child SD 3-4)
- **Child 3**: Wave promotion to governance pipeline
  - Wave promotion triggers Vision Readiness Rubric per wave/item
  - Add `--from-wave` flag to `leo-create-sd.js` (exempt from rubric — upstream governance provenance)
  - Add `roadmap_wave_id` column to `strategic_directives_v2`
  - Baseline snapshot on sequence approval
  - **Deliverable**: Approved waves flow through existing governance pipeline (rubric → vision → arch → SD)
  - **Estimate**: ~100 LOC

- **Child 4**: OKR proposal workflow
  - Chairman approval gate for AI-proposed OKRs
  - Write path to `objectives` and `key_results` tables
  - `proposed_okrs` JSONB processing on wave approval
  - **Deliverable**: Waves can propose and create new OKRs with Chairman approval
  - **Estimate**: ~120 LOC

### Phase 3: Chairman UI (Separate Orchestrator — EHG Frontend)
- Planning tab on Vision route
  - WaveSequenceView component with dependency arrows
  - OKRWaveDashboard component with bidirectional linkage
  - BaselineChangeLog component
  - Real-time progress updates
  - **Must sequence after** pipeline redesign Phase 5 GUI work
  - **Estimate**: ~400 LOC (React/TypeScript)

## Testing Strategy

### Unit Tests
- `roadmap-taxonomy.js`: Validate enum values, wave validation, sequence validation
- `roadmap-clusterer.js`: Mock LLM responses, verify cluster quality metrics, edge cases (1 item, 200 items, items with no clear cluster)
- `roadmap-manager.js`: CRUD operations, baseline snapshot creation, sequence reordering

### Integration Tests
- End-to-end: Create classified items → propose clusters → approve sequence → verify baseline snapshot created
- Promotion: Approve wave → promote to SDs → verify `roadmap_wave_id` on created SDs
- Resume: Partially approve → restart → verify state preserved in database
- OKR linkage: Wave with OKR references → verify linkage queries return correct data

### Manual Validation (Acceptance)
- Cluster 20+ classified items into 3-4 waves via AI
- Review and resequence waves via AskUserQuestion flow
- Approve sequence and verify baseline snapshot created
- Promote one wave to SD creation and verify linkage
- View roadmap in Chairman UI Planning tab (Phase 3)

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| AI clustering produces incoherent groups | High | Confidence scoring + Chairman review; fall back to manual grouping if AI quality < 50% acceptance rate |
| Baseline coexistence with `sd_execution_baselines` | Medium | Separate `roadmap_baseline_snapshots` table; no shared semantics or constraints |
| Chairman abandons roadmap under time pressure | Medium | Degradation path: all existing workflows work without roadmap; HEAL treats wave alignment as bonus, not requirement |
| OKR write-path creates competing governance | Medium | Phase 2 only; read-only OKR linkage in Phase 1; Chairman must explicitly approve proposed OKRs |
| GUI surface contention with pipeline redesign Phase 5 | Medium | Sequence roadmap UI after pipeline GUI work; separate component tree in `planning/` subdirectory |
| Wave dependencies become stale as work progresses | Low | Dependency rationale stored as text; Chairman can update during sequence revision; baseline change log preserves history |
| Initial bolus (199 items) overwhelms clustering | Low | Limit initial clustering to 50 items per session; remainder processed in subsequent sessions |
