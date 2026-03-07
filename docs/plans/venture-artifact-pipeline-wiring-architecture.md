# Architecture Plan: Venture Artifact Pipeline Wiring

## Stack & Repository Decisions

- **Backend (EHG_Engineer)**: Node.js worker process, existing LLM Client Factory with Gemini adapter
- **Frontend (ehg)**: No changes needed — auto-advance hooks already consume `venture_artifacts`
- **Database**: Supabase PostgreSQL — schema reconciliation between `ventures` and `eva_ventures`
- **AI Engine**: Google Gemini API via existing `lib/llm/client-factory.js` adapter

## Legacy Deprecation Plan

- **`eva_ventures` table**: Either drop (if worker can be pointed at `ventures`) or create a view that maps `ventures` → `eva_ventures` schema
- **`workflow_executions` table**: Used by disabled `eva-workers` — leave as-is, do not integrate
- **`lib/eva/workers/index.js`**: Disabled alternative worker system — leave disabled, use `stage-execution-worker.js` instead

## Route & Component Structure

No new routes or components. Existing architecture:

**Backend Modules (EHG_Engineer):**
- `lib/eva/stage-execution-worker.js` — Main worker class (EXISTS, needs activation)
- `lib/eva/stage-templates/stage-XX.js` — 25 stage templates (EXIST)
- `scripts/stage-zero-queue-processor.js` — Stage zero handler (RUNNING)
- `config/workers.json` — Worker registry (NEEDS UPDATE)

**Frontend Hooks (ehg):**
- `src/hooks/useStageAutoAdvance.ts` — Auto-advance consumer (WORKING)
- `src/hooks/useVentureWorkflow.ts` — Stage work queries (WORKING)
- `src/hooks/useGateApproval.ts` — Gate approval polling (WORKING)
- `src/hooks/usePendingGateDecision.ts` — Gate decision mutations (WORKING)

## Data Layer

### Schema Reconciliation

**Problem**: `stage-execution-worker.js` imports from modules that query `eva_ventures`. The web UI and stage-zero processor use `ventures`.

**Approach**: Modify the worker's data access layer to read from `ventures` table instead of `eva_ventures`. Key column mapping:
- `eva_ventures.venture_id` → `ventures.id`
- `eva_ventures.current_stage` → `ventures.current_lifecycle_stage`
- `eva_ventures.status` → `ventures.status`
- `eva_ventures.tier` → `ventures.tier`

**Artifacts**: Worker writes to `venture_artifacts` table (same table the frontend reads from). Schema:
- `venture_id` (FK to ventures.id)
- `lifecycle_stage` (integer)
- `artifact_type` (matches STAGE_ARTIFACT_MAP)
- `content` (JSONB — schema defined by stage template)
- `is_current` (boolean — only latest version matters)

### RLS Considerations
- Worker runs server-side with service role key — no RLS concerns for writes
- Frontend reads `venture_artifacts` via authenticated client — existing RLS policies apply

## API Surface

No new RPCs needed. Existing RPCs used:
- `bootstrap_venture_workflow` — creates stage work rows (already called by frontend)
- `advance_venture_stage` — advances stage (called by auto-advance hook)
- `get_gate_decision_status` — checks gate approval (called by useGateApproval)
- `approve_chairman_decision` / `reject_chairman_decision` — gate actions (called by usePendingGateDecision)

**Worker → Database**: Direct Supabase client queries (not RPCs) for:
- Reading ventures needing processing
- Writing artifacts
- Creating chairman decisions at gate stages
- Updating venture stage state

## Implementation Phases

### Phase 1: Worker Activation (1-2 days)
1. Audit `stage-execution-worker.js` imports to identify all `eva_ventures` references
2. Create adapter layer or modify queries to read from `ventures` table
3. Add worker to `config/workers.json` with appropriate settings
4. Create entry point script (`scripts/start-stage-worker.js`) or integrate into LEO stack
5. Test: Start worker, verify it picks up NichePulse at current stage

### Phase 2: End-to-End Integration Test (1-2 days)
1. Create test venture via "Find Me Opportunities" UI flow
2. Verify stage-zero processor creates venture at stage 1
3. Verify worker picks up venture, executes stage 1 template, creates artifact
4. Verify auto-advance consumer detects artifact and advances to stage 2
5. Continue through stages 1-3 (first kill gate)
6. Verify gate pause — worker stops, Chairman UI shows pending decision
7. Approve gate, verify pipeline resumes

### Phase 3: STAGE_ARTIFACT_MAP Fix (0.5 day)
1. Fix duplicate `integration_plan` mapping (stages 15 and 19)
2. Verify all 25 stage mappings match stage template output types
3. Update `useVentureArtifacts.ts` if needed

### Phase 4: Observability (1-2 days)
1. Add worker health check endpoint
2. Log pipeline progress to `workflow_executions` or new tracking table
3. Surface pipeline status in venture detail page (optional)

## Testing Strategy

- **Unit**: Verify stage template schemas match `venture_artifacts` content expectations
- **Integration**: End-to-end test with a real venture (NichePulse or new test venture)
- **Gate Testing**: Verify all 7 gate stages (3, 5, 10, 13, 16, 22, 23) correctly pause and resume
- **Failure Testing**: Kill Gemini API mid-pipeline, verify retry logic and state consistency
- **Race Condition**: Verify auto-advance doesn't fire before artifact is fully persisted (5s poll interval should provide sufficient margin)

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Schema mismatch deeper than expected | Start with read-only audit of worker imports before any code changes |
| Gemini API rate limits at scale | Existing LLM Client Factory has retry logic; add per-venture rate limiting if needed |
| Auto-advance race condition | Worker writes artifact → waits 2s → updates stage status; consumer polls every 5s |
| "Completed" child SDs didn't deliver | Run `/heal sd` on orchestrator to verify; treat as sunk cost if hollow |
| Stages 17-25 produce misleading output | Label as "AI Projections" in artifact metadata; defer to Phase 4 |
