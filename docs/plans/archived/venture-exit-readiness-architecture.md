# Architecture Plan: Venture Acquisition-Readiness

## Stack & Repository Decisions

- **Backend**: Express.js (existing server in `server/`) — new routes mounted under `/api/eva/exit/`
- **Database**: Supabase (Postgres) — new tables with RLS policies following existing patterns
- **Frontend**: React + TypeScript + Shadcn UI + Tailwind (in `rickfelix/ehg` repo) — new Chairman pages
- **Workers**: EVA Master Scheduler domain handlers (following `registerOperationsHandlers()` pattern)
- **Repository**: All backend/worker changes in `EHG_Engineer`. All frontend changes in `ehg` app repo.

No new technology required. All components use existing stack and patterns.

## Legacy Deprecation Plan

No systems are deprecated. This is additive to the existing pipeline:

- `ventures.pipeline_mode` CHECK constraint is extended (not replaced) with 3 new values
- Existing operations workers continue unchanged — new exit-readiness workers are registered alongside them
- Existing stage templates gain new soft criteria — no existing criteria are removed
- Existing Chairman views remain — new exit views are added as tabs

**Migration consideration**: The `pipeline_mode` CHECK constraint must be altered in a backward-compatible migration. Existing ventures keep their current mode values. No data migration required.

## Route & Component Structure

### API Routes (EHG_Engineer)

```
server/routes/eva-exit.js
├── GET    /api/eva/exit/portfolio          → Portfolio exit readiness overview
├── GET    /api/eva/exit/:ventureId/profile → Venture exit profile
├── PUT    /api/eva/exit/:ventureId/profile → Update exit model/metadata
├── POST   /api/eva/exit/:ventureId/enter   → Transition to exit_prep mode
├── POST   /api/eva/exit/:ventureId/divest  → Transition to divesting mode
├── POST   /api/eva/exit/:ventureId/sold    → Mark as sold (terminal)
├── GET    /api/eva/exit/:ventureId/assets  → Asset registry for venture
├── POST   /api/eva/exit/:ventureId/assets  → Register new asset
├── PUT    /api/eva/exit/:ventureId/assets/:id → Update asset
├── DELETE /api/eva/exit/:ventureId/assets/:id → Remove asset
├── GET    /api/eva/exit/:ventureId/separability → Score history
├── GET    /api/eva/exit/:ventureId/data-room   → Data room artifacts list
├── POST   /api/eva/exit/:ventureId/data-room/generate → Trigger generation
└── GET    /api/eva/exit/:ventureId/data-room/:artifactId → Download artifact
```

### Frontend Components (ehg repo)

```
src/components/chairman-v2/exit/
├── PortfolioExitReadiness.tsx      → Portfolio overview table
├── VentureExitDashboard.tsx        → Per-venture exit tab
├── AssetRegistryPanel.tsx          → Asset CRUD with provenance
├── SeparabilityScoreChart.tsx      → Time-series score visualization
├── DataRoomPanel.tsx               → Data room status + download
├── ExitModelSelector.tsx           → Exit model picker with descriptions
└── SeparationPlanView.tsx          → Dependency map + dry-run results

src/hooks/
├── useExitProfile.ts               → React Query hook for exit profile
├── useAssetRegistry.ts             → React Query hook for assets
├── useSeparabilityHistory.ts        → React Query hook for score history
└── useDataRoom.ts                   → React Query hook for data room
```

### Routes (ehg repo)

```
/chairman/portfolio/exit-readiness   → PortfolioExitReadiness
/chairman/ventures/:id/exit          → VentureExitDashboard
/chairman/ventures/:id/data-room     → DataRoomPanel (expanded)
```

## Data Layer

### New Tables

#### `venture_exit_profiles`
```sql
CREATE TABLE venture_exit_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  exit_model TEXT NOT NULL CHECK (exit_model IN ('full_acquisition', 'licensing', 'revenue_share', 'undetermined')),
  exit_model_history JSONB DEFAULT '[]',  -- [{model, set_at, reason}]
  target_buyer_type TEXT,                 -- 'strategic', 'financial', 'competitor', 'platform'
  readiness_score NUMERIC(5,2) DEFAULT 0,
  data_room_completeness NUMERIC(5,2) DEFAULT 0,
  entered_exit_prep_at TIMESTAMPTZ,
  entered_divesting_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  sale_metadata JSONB,                    -- price, buyer, terms (post-sale record)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id)
);
```

#### `venture_asset_registry`
```sql
CREATE TABLE venture_asset_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  asset_type TEXT NOT NULL CHECK (asset_type IN (
    'code_repo', 'domain', 'customer_list', 'integration',
    'brand_asset', 'api_key', 'database', 'ml_model',
    'documentation', 'license', 'contract', 'other'
  )),
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,                          -- URL, path, or identifier
  owner_entity TEXT,                      -- legal entity that owns this asset
  provenance JSONB DEFAULT '{}',          -- {created_by, created_at, license, ip_status, encumbrances}
  dependencies JSONB DEFAULT '[]',        -- [{asset_id, dependency_type, separable}]
  separable BOOLEAN DEFAULT true,         -- can this asset be extracted independently?
  separation_notes TEXT,                  -- what's needed to separate
  verified_at TIMESTAMPTZ,               -- last manual verification
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_asset_registry_venture ON venture_asset_registry(venture_id);
CREATE INDEX idx_asset_registry_type ON venture_asset_registry(asset_type);
```

#### `venture_separability_scores`
```sql
CREATE TABLE venture_separability_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  overall_score NUMERIC(5,2) NOT NULL,    -- 0-100
  dimensions JSONB NOT NULL,              -- [{dimension, score, weight, details}]
  shared_dependencies JSONB DEFAULT '[]', -- [{resource, type, severity, separable}]
  computed_by TEXT DEFAULT 'ops_separability_score',
  computation_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_separability_venture_time ON venture_separability_scores(venture_id, created_at DESC);
```

#### `venture_data_room_artifacts`
```sql
CREATE TABLE venture_data_room_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  artifact_type TEXT NOT NULL CHECK (artifact_type IN (
    'financial_summary', 'customer_list', 'technical_architecture',
    'dependency_map', 'integration_inventory', 'separation_plan',
    'revenue_history', 'metric_dashboard', 'asset_inventory',
    'legal_summary', 'custom'
  )),
  title TEXT NOT NULL,
  content JSONB,                          -- structured content
  file_path TEXT,                         -- generated file location
  exit_model_applicable TEXT[],           -- which exit models need this artifact
  status TEXT DEFAULT 'stale' CHECK (status IN ('current', 'stale', 'generating', 'error')),
  last_generated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,                 -- when artifact becomes stale
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_data_room_venture ON venture_data_room_artifacts(venture_id);
```

### Schema Modification

```sql
-- Extend pipeline_mode CHECK constraint
ALTER TABLE ventures DROP CONSTRAINT IF EXISTS ventures_pipeline_mode_check;
ALTER TABLE ventures ADD CONSTRAINT ventures_pipeline_mode_check
  CHECK (pipeline_mode IN ('evaluation', 'build', 'launch', 'operations', 'exit_prep', 'divesting', 'sold', 'parked', 'killed'));
```

### RLS Policies

All new tables follow the existing pattern: service role has full access, authenticated users have read access scoped to their ventures. Write access for asset registry and exit profiles is restricted to chairman role.

### Key Queries

```sql
-- Portfolio exit readiness overview
SELECT v.id, v.name, v.pipeline_mode,
       ep.exit_model, ep.readiness_score, ep.data_room_completeness,
       ss.overall_score as separability_score,
       (SELECT COUNT(*) FROM venture_asset_registry ar WHERE ar.venture_id = v.id) as asset_count
FROM ventures v
LEFT JOIN venture_exit_profiles ep ON ep.venture_id = v.id
LEFT JOIN LATERAL (
  SELECT overall_score FROM venture_separability_scores
  WHERE venture_id = v.id ORDER BY created_at DESC LIMIT 1
) ss ON true
WHERE v.status = 'active'
ORDER BY ep.readiness_score DESC NULLS LAST;

-- Separability score history for charts
SELECT overall_score, dimensions, created_at
FROM venture_separability_scores
WHERE venture_id = $1
ORDER BY created_at DESC
LIMIT 90;  -- ~3 months of hourly data
```

## API Surface

### RPC Functions

```sql
-- Transition venture to exit_prep mode (with validation)
CREATE OR REPLACE FUNCTION enter_exit_prep(p_venture_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_current_mode TEXT;
  v_has_profile BOOLEAN;
BEGIN
  SELECT pipeline_mode INTO v_current_mode FROM ventures WHERE id = p_venture_id;
  IF v_current_mode != 'operations' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture must be in operations mode');
  END IF;

  SELECT EXISTS(SELECT 1 FROM venture_exit_profiles WHERE venture_id = p_venture_id) INTO v_has_profile;
  IF NOT v_has_profile THEN
    RETURN jsonb_build_object('success', false, 'error', 'Exit profile required before entering exit prep');
  END IF;

  UPDATE ventures SET pipeline_mode = 'exit_prep' WHERE id = p_venture_id;
  UPDATE venture_exit_profiles SET entered_exit_prep_at = NOW() WHERE venture_id = p_venture_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### REST Endpoints

All endpoints under `/api/eva/exit/` follow existing Express middleware patterns:
- `optionalAuth` middleware (same as operations routes)
- Request validation via express-validator
- Supabase client from `req.app.locals.supabase`
- Standard error response format: `{ error: string, message: string }`

## Implementation Phases

### Phase 1: Foundation (Asset Registry + Exit Modes) — COMPLETED

**Status**: Completed (SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-A, PR #1794)

**Scope**: Database schema, API routes, basic Chairman UI

**Deliverables**:
- Migration: extend `pipeline_mode` CHECK constraint
- Migration: create `venture_exit_profiles` table
- Migration: create `venture_asset_registry` table
- API: `server/routes/eva-exit.js` with profile and asset CRUD
- RPC: `enter_exit_prep()` function
- Frontend: `VentureExitDashboard.tsx`, `AssetRegistryPanel.tsx`, `ExitModelSelector.tsx`
- Frontend: Exit readiness tab on venture detail view

**Dependencies**: None — fully additive to existing system

### Phase 2: Scoring + Workers — COMPLETED

**Status**: Completed (SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-B, PR #1798)

**Scope**: Separability scoring worker, data room framework, operations integration

**Deliverables**:
- Migration: create `venture_separability_scores` table
- Migration: create `venture_data_room_artifacts` table
- Worker: `ops_separability_score` domain handler (infrastructure dependency analysis)
- Worker: `ops_data_room_refresh` domain handler (artifact generation)
- Module: `lib/eva/exit/separability-scorer.js` (scoring engine)
- Module: `lib/eva/exit/data-room-generator.js` (artifact templating)
- API: separability history and data room endpoints
- Frontend: `SeparabilityScoreChart.tsx`, `DataRoomPanel.tsx`

**Dependencies**: Phase 1 (tables must exist for workers to write to)

### Phase 3: Stage Integration + Validation — COMPLETED

**Status**: Completed (SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C, Backend PR #1802, Frontend PR #219)

**Scope**: Pipeline-wide acquirability criteria, separation rehearsal, dry-runs

**Planned Deliverables** (all delivered):
- Stage template modifications: acquirability criteria in stages 0, 18-22, 24
- Module: `lib/eva/exit/separation-rehearsal.js` (standalone deployment validation)
- Frontend: `SeparationPlanView.tsx`, `PortfolioExitReadiness.tsx`
- Data room templates: per-exit-model artifact sets

**Additional Deliverables** (implemented beyond plan):
- Module: `lib/eva/exit/data-room-templates.js` — Template system for 6 exit models (full_acquisition, licensing, acqui_hire, revenue_share, merger, wind_down)
- 7 acquirability analysis step files (`lib/eva/stage-templates/analysis-steps/stage-{00,18,19,20,21,22,24}-acquirability.js`)
- `getAcquirabilityStep(stageNumber)` registry function in analysis steps index
- Stage 24 acquirability review: weighted aggregation (stage0 30% + build delta 30% + separability 40%)
- 4 Phase 3 API endpoints: POST rehearsal, GET rehearsal/latest, GET data-room/template, GET data-room/completeness
- 115 unit tests across 3 test files (`separation-rehearsal.test.js`, `data-room-templates.test.js`, `stage-24-acquirability-review.test.js`)
- Frontend: `PortfolioExitReadiness.tsx` (Chairman V3 portfolio dashboard), `SeparationPlanView.tsx` (venture detail separation view)

**Deferred**:
- Extended scoring: per-PR separability delta computation (CI integration) — deferred to future SD

**Dependencies**: Phase 2 (scoring system must exist before adding criteria to stage gates)

## Testing Strategy

### Unit Tests (Vitest)
- `tests/unit/eva/exit/separability-scorer.test.js` — scoring algorithm with mock dependency data
- `tests/unit/eva/exit/data-room-generator.test.js` — artifact generation with mock venture data
- `tests/unit/eva/exit/asset-registry.test.js` — provenance validation, dependency analysis

### Integration Tests (Vitest)
- `tests/integration/eva/exit-pipeline.integration.test.js` — full lifecycle: operations → exit_prep → divesting → sold with stateful mock Supabase
- `tests/integration/eva/exit-workers.integration.test.js` — worker handler execution with mock infrastructure data

### E2E Tests (Playwright)
- `tests/e2e/api/eva-exit.spec.ts` — REST API endpoint validation
- `tests/e2e/chairman/exit-readiness.spec.ts` — Chairman UI workflow (create profile, add assets, view scores)

### Test Data
- Seed fixtures for each exit model type
- Mock infrastructure dependency scans with known separability scores
- Mock data room templates for artifact generation testing

## Risk Mitigation

### Risk 1: Pipeline redesign fatigue
The 25-stage pipeline was just redesigned (2026-03-04). Modifying stage templates again risks regressions.

**Mitigation**: Phase 3 (stage template changes) is deferred. Phases 1 and 2 are fully additive — no existing code is modified. Phase 3 only proceeds after Phases 1-2 are stable and tested.

### Risk 2: Separability score without validation
A computed score that has never been tested against a real separation attempt creates false confidence (Challenger's key concern).

**Mitigation**: Phase 2 includes scoring with explicit "unvalidated" status. Phase 3 adds separation rehearsals. Scores display a "last validated" timestamp — if never validated, the UI shows a warning badge. The score does not auto-influence decisions (informational only).

### Risk 3: Small venture sample (N=4)
Designing a generic exit architecture for 4 ventures risks over-fitting.

**Mitigation**: The asset type and exit model enums are designed to be extensible. The scoring dimensions are configurable per venture (stored as JSONB, not fixed columns). The architecture favors flexibility over optimization for current ventures.

### Risk 4: Legal entity structure is a prerequisite
The asset registry tracks ownership, but the actual legal entity structure (LLCs per venture, IP assignments) is an offline business decision.

**Mitigation**: The `owner_entity` field on assets accepts free-text. The system tracks what's recorded but does not validate legal entity existence. The data room generator flags assets with missing `owner_entity` as incomplete — surfacing the gap without blocking progress.

### Risk 5: Shared Supabase instance complicates data export
All ventures share a single Supabase project. Venture-scoped data export requires per-venture logical partitioning.

**Mitigation**: All venture-scoped tables already have `venture_id` foreign keys. Data room generation uses filtered queries (`WHERE venture_id = $1`), not physical database separation. For full-acquisition exits requiring database transfer, Phase 3 includes a migration script that exports a venture's data into a standalone SQL dump with referential integrity preserved.
