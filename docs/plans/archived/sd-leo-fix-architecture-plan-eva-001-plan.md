<!-- Archived from: docs/plans/eva-stage-pipeline-artifact-unification-architecture.md -->
<!-- SD Key: SD-LEO-FIX-ARCHITECTURE-PLAN-EVA-001 -->
<!-- Archived at: 2026-03-07T14:19:07.668Z -->

# Architecture Plan: EVA Stage Pipeline Artifact Unification

## Stack & Repository Decisions

**Repository**: `EHG_Engineer` (backend infrastructure)
**Stack**: Node.js (CJS), Supabase (PostgreSQL), existing EVA orchestrator framework
**No new dependencies**: All changes use existing libraries and patterns

**Key constraint**: The orchestrator, reality gates, GoldenNuggetValidator, and SD Bridge are all CJS modules. No ESM migration needed.

## Legacy Deprecation Plan

### Deprecated: Hardcoded Artifact Type Taxonomies

| Location | Current State | After |
|----------|--------------|-------|
| `lib/eva/reality-gates.js` → `BOUNDARY_CONFIG` | 15 hardcoded artifact type strings | Reads from `lifecycle_stage_config` DB table |
| `lib/eva/eva-orchestrator.js` → step definitions | Hardcodes `artifactType: 'stage_output'` | Reads `required_artifacts` from DB per stage |
| `lib/agents/modules/golden-nugget-validator/stage-config.js` | Reads YAML file at wrong path | Reads from `lifecycle_stage_config` DB table |
| `lib/agents/modules/golden-nugget-validator/artifact-validation.js` | `MIN_LENGTH_REQUIREMENTS` with 29 hardcoded types | Derives validation rules from DB config |
| `lib/eva/stage-zero/profile-service.js` → `LEGACY_GATE_THRESHOLDS` | Own threshold taxonomy per gate | Reads thresholds from `lifecycle_stage_config.metadata` |

### Kept: `docs/guides/workflow/stages_v2.yaml`
Retained as human-readable documentation. No longer read at runtime.

## Route & Component Structure

No routes or UI components. All changes are in backend modules:

```
lib/eva/
├── eva-orchestrator.js          ← MODIFY: Read required_artifacts from DB, persist typed artifacts
├── eva-orchestrator-helpers.js   ← MODIFY: persistArtifacts() uses correct artifact types
├── reality-gates.js             ← MODIFY: Replace BOUNDARY_CONFIG with DB reads
├── stage-execution-worker.js    ← MINOR: Ensure eva_ventures.id passed to tracer
├── lifecycle-sd-bridge.js       ← MODIFY: Fix child SD key generation + target_application
├── stage-contracts.js           ← MINOR: Cross-stage validation uses DB artifact types
└── devils-advocate.js           ← MINOR: Fix artifact persist (source column)

lib/agents/modules/golden-nugget-validator/
├── stage-config.js              ← MODIFY: Read from DB instead of YAML
└── artifact-validation.js       ← MODIFY: Derive validation from DB config

database/migrations/
└── 20260307_artifact_unification.sql  ← NEW: Add missing columns

scripts/temp/
└── run-full-pipeline.cjs        ← MODIFY: Enhanced for post-completion validation
```

## Data Layer

### Migration: Add Missing Columns

```sql
-- venture_artifacts: add 'source' column for DA artifact persistence
ALTER TABLE venture_artifacts ADD COLUMN IF NOT EXISTS source VARCHAR(100);

-- venture_artifacts: add 'artifact_data' column for RealityTracker
ALTER TABLE venture_artifacts ADD COLUMN IF NOT EXISTS artifact_data JSONB;

-- chairman_decisions: add 'context' column for DFE escalation
ALTER TABLE chairman_decisions ADD COLUMN IF NOT EXISTS context JSONB;
```

### Queries: Orchestrator Reads Stage Config

```sql
-- Get required artifacts for a stage (called by orchestrator before persistence)
SELECT required_artifacts, metadata
FROM lifecycle_stage_config
WHERE stage_number = $1;
```

### Queries: Reality Gates Read Boundary Requirements

```sql
-- Get all stages in a boundary range and their required artifacts
-- For boundary 5->6, this gets stages 1-5 (all stages that should have artifacts before entering stage 6)
SELECT stage_number, required_artifacts, metadata
FROM lifecycle_stage_config
WHERE stage_number >= $1 AND stage_number <= $2
  AND required_artifacts != '{}';
```

### Queries: Event Tracer ID Resolution

```sql
-- Resolve ventures.id → eva_ventures.id for event tracing
SELECT ev.id AS eva_venture_id
FROM eva_ventures ev
WHERE ev.venture_id = $1;  -- $1 is ventures.id
```

### RLS

No RLS changes needed. All queries use `SUPABASE_SERVICE_ROLE_KEY` (server-side).

## API Surface

No new API endpoints. All changes are internal module modifications.

### Modified Internal Functions

| Module | Function | Change |
|--------|----------|--------|
| `eva-orchestrator.js` | `processStage()` | Read `lifecycle_stage_config` for stage's `required_artifacts`, pass to step definitions |
| `eva-orchestrator.js` | Step construction | Replace hardcoded `artifactType: 'stage_output'` with artifact types from config |
| `eva-orchestrator-helpers.js` | `persistArtifacts()` | For multi-artifact stages, extract sections from LLM output and persist each with correct type |
| `reality-gates.js` | `evaluateRealityGate()` | Replace `BOUNDARY_CONFIG` lookup with DB query to `lifecycle_stage_config` |
| `reality-gates.js` | Gate failure handling | Return `status: 'BLOCKED'` instead of triggering DFE kill flow |
| `lifecycle-sd-bridge.js` | `createChildSDs()` | Validate sprint item fields, default `target_application`, fix key generation |
| `stage-config.js` | `loadStageConfig()` | Query `lifecycle_stage_config` instead of reading YAML file |
| `stage-execution-worker.js` | Event tracing | Resolve `ventures.id` → `eva_ventures.id` before inserting into `eva_events` |

## Implementation Phases

### Child A: DB Schema Migrations + Event FK Fix (~50 LOC, 1 session)
- Add `source` column to `venture_artifacts`
- Add `artifact_data` column to `venture_artifacts`
- Add `context` column to `chairman_decisions`
- Fix event tracer to resolve `ventures.id` → `eva_ventures.id`
- **Deliverable**: Migration SQL + tracer code fix
- **Test**: Insert test artifacts with new columns, verify event inserts succeed

### Child B: Orchestrator Artifact Type Unification (~100 LOC, 1 session)
- Modify `eva-orchestrator.js` to read `required_artifacts` from `lifecycle_stage_config`
- Modify `persistArtifacts()` to use correct artifact types from config
- Implement section-based extraction for multi-artifact stages
- Handle empty `required_artifacts` (stages 18-19) — persist as `stage_output` (existing behavior)
- **Deliverable**: Orchestrator produces correctly-typed artifacts
- **Test**: Run single-stage pipeline test, verify artifact types in `venture_artifacts`

### Child C: Reality Gate Refactor (~80 LOC, 1 session)
- Replace `BOUNDARY_CONFIG` with DB reads from `lifecycle_stage_config`
- Aggregate required artifacts across stages for each boundary
- Change gate failure from kill to block (`status: 'BLOCKED'`, clear reason)
- Keep quality threshold checking (use `metadata` field for overrides)
- **Deliverable**: Reality gates validate against DB-defined artifact types
- **Test**: Run boundary crossing test, verify gates check correct types and block instead of kill
- **Dependency**: Child B must complete first (so correctly-typed artifacts exist for gates to find)

### Child D: SD Bridge + Stage Template Fixes (~60 LOC, 1 session)
- Fix `lifecycle-sd-bridge.js` child SD key generation (eliminate `undefined` in keys)
- Validate and default `target_application` on sprint items before SD creation
- Fix `onBeforeAnalysis` hook parameter mismatch
- Fix financial contract name-vs-UUID issue
- **Deliverable**: SD Bridge creates valid child SDs at Stage 18
- **Test**: Run stages 17-18, verify orchestrator + children created successfully

### Child E: GoldenNuggetValidator DB Migration (~40 LOC, 1 session)
- Modify `stage-config.js` to query `lifecycle_stage_config` instead of YAML
- Update `artifact-validation.js` to derive validation rules from DB config
- Remove YAML file path dependency
- **Deliverable**: Validator uses DB as source of truth
- **Test**: Validator loads config successfully, validates artifacts by correct types

### Child F: Comprehensive Pipeline Validation (~30 LOC, 1 session)
- Run full 25-stage pipeline test with test venture
- Verify all 9 success criteria from vision document
- Catalog any new issues that surfaced
- Produce pass/fail report
- **Dependency**: All other children must complete first
- **Deliverable**: Pipeline test report with pass/fail per success criterion
- **Test**: The entire child IS the test

### Estimated Total: ~360 LOC across 6 children

## Testing Strategy

### Per-Child Testing
Each child has its own focused test (described above). Tests run against the live Supabase instance using the test venture "Dream Weaver Stories" (ventures.id: `81a82426-d9cb-4440-95c5-4c46141d608e`).

### Integration Testing (Child F)
The comprehensive pipeline test (`scripts/temp/run-full-pipeline.cjs`) is the integration test:
1. Reset test venture to stage 1
2. Run full pipeline with auto-advance and chairman gate auto-approval
3. Verify each boundary crossing succeeds
4. Check `venture_artifacts` for correctly-typed artifacts at each stage
5. Verify no errors in pipeline log except intentional blocks (UAT gate, chairman gates)

### Regression Checks
- Existing ventures at various stages should not be affected (we're adding columns, not changing existing ones)
- Stage templates produce the same LLM output — only persistence changes
- Gates that currently pass should still pass (we're fixing gates that incorrectly fail)

## Risk Mitigation

### Risk 1: Section Extraction Fails for Multi-Artifact Stages
**Impact**: Stages with multiple required artifacts (10, 14, 17, 24, 25) might not produce LLM output structured in extractable sections.
**Mitigation**: Fallback behavior — if a section can't be extracted, persist the entire output with the first required artifact type. Log a warning. The gate will see at least one artifact and can be configured for partial pass.

### Risk 2: Reality Gate Behavior Change Breaks Existing Ventures
**Impact**: Ventures currently past a boundary might fail on re-evaluation.
**Mitigation**: Gates only evaluate during active advancement. Ventures already past a boundary aren't re-evaluated. The change from kill to block is strictly less destructive.

### Risk 3: lifecycle_stage_config Data Drift
**Impact**: If someone updates the DB table without updating the stage templates, artifacts and config diverge.
**Mitigation**: The GoldenNuggetValidator (Child E) now reads from the same DB table, providing a runtime consistency check. Vision heal scoring will detect drift via the `artifact_type_unification` dimension.

### Risk 4: SD Bridge Fix Creates Unexpected SDs
**Impact**: Fixing the child SD creation might create SDs in production from test data.
**Mitigation**: SD Bridge only runs at Stage 18 of the venture pipeline. Test ventures are isolated. The fix validates fields — it doesn't change when SDs are created, only ensures they're valid when they are.
