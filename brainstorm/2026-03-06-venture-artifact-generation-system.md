# Brainstorm: Venture Artifact Generation System

## Metadata
- **Date**: 2026-03-06
- **Domain**: Architecture
- **Phase**: Execute
- **Mode**: Conversational
- **Outcome Classification**: Needs Triage
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: NichePulse (7ff47c57-c4cc-4990-8be3-e1567ff1953d)

---

## Problem Statement

The EHG venture lifecycle has 25 stages, each requiring specific artifacts (market_analysis, pricing_model, etc.) to advance. The auto-advance consumer (`useStageAutoAdvance`) polls for these artifacts and advances stages automatically — but **no code in the web UI creates these artifacts**. Ventures get stuck at their current stage indefinitely because nothing generates the required outputs.

The user's investigation revealed this is NOT a greenfield problem: a complete CLI-based pipeline already exists (25 stage templates, StageExecutionWorker class, stage-zero queue processor) built by orchestrator SD `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001` with 11 child SDs (all marked COMPLETED). However, the Stage Execution Worker is **not running** — it's not registered in `config/workers.json` and has no entry point script.

## Discovery Summary

### What Works (End-to-End Verified)
1. **UI → Stage Zero**: "Find Me Opportunities" button → DiscoveryModeDialog (4 strategies: Trend Scanner, Democratization Finder, Capability Overhang, Nursery Re-eval) → `stage_zero_requests` table
2. **Stage Zero Processing**: `stage-zero-queue-processor.js` polls every 30s, claims requests atomically, 5-min timeout
3. **Venture Creation**: Stage Zero Orchestrator creates venture with `current_lifecycle_stage = 1`, persists to `ventures` table
4. **Auto-Advance Consumer**: `useStageAutoAdvance` hook polls `venture_artifacts` every 5s, detects required artifacts, auto-advances non-gate stages; gate stages wait for chairman approval via `useGateApproval`
5. **Gate Decision System**: `get_gate_decision_status` SECURITY DEFINER RPC, `usePendingGateDecision` for approve/reject mutations

### What's Broken
1. **Stage Execution Worker NOT RUNNING**: Class exists at `lib/eva/stage-execution-worker.js` but:
   - Not registered in `config/workers.json`
   - No entry point script
   - Not started by LEO stack
   - Ventures stuck at stage 1 indefinitely
2. **Database Schema Mismatch**: Three different tables used by different components:
   - `ventures` (used by stage-zero, web UI)
   - `eva_ventures` (used by stage-execution-worker)
   - `workflow_executions` (used by eva-workers)
3. **Stages 17-25 are Simulations**: LLM imagines dev/QA/launch results rather than tracking real work. Infrastructure exists (lifecycle-sd-bridge.js, sd-completed.js) but analysis steps bypass it.

### Existing Infrastructure (from CLI)
- **25 stage templates** (`lib/eva/stage-templates/stage-XX.js`): 80-230 lines each, full JSON schemas, cross-stage contracts, validation
- **StageExecutionWorker class**: Polling, gate handling, retry logic, operating mode boundaries (EVALUATION 1-5, STRATEGY 6-12, PLANNING 13-16, BUILD 17-21, LAUNCH 22-25)
- **Chairman gates**: BLOCKING [3, 10, 22, 24], ADVISORY [5, 23]
- **LLM Client Factory**: Gemini adapter with retry logic, token budgets per stage
- **Stage Zero Orchestrator**: Venture creation, artifact persistence, chairman review

### Key Prior Work
- **Brainstorm**: `brainstorm/2026-03-04-eva-stage-execution-worker.md` — comprehensive analysis of the pipeline problem, led to orchestrator SD
- **Orchestrator**: `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001` with 11 children (A-K), all marked COMPLETED
- **Documentation**: `docs/guides/workflow/25-stage-venture-lifecycle-overview.md`, `docs/guides/workflow/cli-venture-lifecycle/00-overview.md`

## Analysis

### Arguments For (Wiring Existing Infrastructure)
- **90% of the code already exists** — 25 stage templates, StageExecutionWorker class, stage-zero pipeline, auto-advance consumer hooks all implemented
- **Low effort, high impact** — registering the worker in `workers.json` and fixing DB schema alignment could unblock the entire 25-stage pipeline
- **11 child SDs already "completed"** — the orchestrator delivered the components; only integration testing and runtime activation remain
- **Auto-advance consumer already works** — `useStageAutoAdvance` polls artifacts and advances stages; it just needs artifacts to be created

### Arguments Against
- **"Completed" SDs may be hollow** — 11 children marked complete but the worker isn't running, suggesting validation gaps in the orchestrator
- **Database schema mismatch is non-trivial** — three different tables (`ventures`, `eva_ventures`, `workflow_executions`) means wiring requires schema reconciliation, not just config changes
- **Stages 17-25 are simulations** — LLM imagines dev/QA/launch results rather than tracking real work; shipping this as-is could mislead users about venture readiness
- **No integration tests exist** — end-to-end flow from stage zero through all 25 stages has never been tested

## Team Perspectives

### Challenger
- **Blind Spots**:
  1. Polling race condition: auto-advance consumer fires before artifact content is fully persisted (5s poll vs async DB write)
  2. No failure propagation strategy — if stage 4 artifact generation fails, nothing prevents repeated retries consuming Gemini tokens
  3. Duplicate `integration_plan` mapping (stages 15 and 19) is a symptom of deeper schema inconsistency
- **Assumptions at Risk**:
  1. Gemini API latency assumed fast enough for synchronous stage completion — later stages with 375K token budgets may take minutes
  2. Context windows at later stages (stage 16+) may exceed Gemini's limits when cross-stage contracts pull from 15+ prior artifacts
  3. `useEnsureArtifact` hooks are completely untested in production
- **Worst Case**: Silent corruption cascade — malformed stage 3 artifact passes validation, propagates through cross-stage contracts, produces plausible-looking but wrong analysis through stages 4-10, only caught at kill gate 13 (if at all)

### Visionary
- **Opportunities**:
  1. Artifact chain as an epistemic graph — each stage's output is a node, cross-stage contracts are edges, enabling "trace this conclusion back to its evidence" UI
  2. Kill gate predictive triage — pre-score ventures at stage 2 using lightweight signals (market size, competition density) to predict gate 3 outcome, saving full pipeline execution for high-probability ventures
  3. Tier-aware artifact compression as a competitive moat — tier 1 ventures get 10-stage summaries, tier 3 get full 25-stage deep analysis, creating a natural "upgrade path" for promising ideas
- **Synergies**: Chairman UI rebuild, FK registry work, auto-advance consumer are all ready to consume pipeline output
- **Upside Scenario**: Full automation from "Find opportunity" click to stage 10+ in under 20 minutes, with Chairman reviewing kill gates asynchronously

### Pragmatist
- **Feasibility**: 5/10 (wiring is moderate complexity due to schema mismatch)
- **Resource Requirements**: 3-4 weeks, Gemini API credits (~$5-15/venture for full pipeline), content schema audit
- **Constraints**:
  1. Must audit existing `venture_artifacts` content before building on it (duplicate `integration_plan` bug)
  2. Stage templates expect `eva_ventures` table but web UI uses `ventures` table — schema bridge needed
  3. Auto-advance race condition: worker creates artifact → consumer detects → advances → worker picks up next stage (timing must be coordinated)
- **Recommended Path**: Fix duplicates in STAGE_ARTIFACT_MAP → align DB schemas → register worker in workers.json → test single venture end-to-end → scale

### Synthesis
- **Consensus Points**: All three perspectives agree the infrastructure exists but isn't integrated. The schema mismatch is the critical blocker, not missing code.
- **Tension Points**: Visionary sees opportunity to build epistemic graph features; Pragmatist says "just wire it up first"; Challenger warns the wiring may expose deeper issues.
- **Composite Risk**: Medium — infrastructure exists but integration testing is zero, and "completed" SDs that didn't actually deliver raise process concerns.

## Open Questions
1. Should we run `/heal sd` on `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001` to verify the 11 child SDs actually delivered?
2. Can the `stage-execution-worker.js` be pointed at the `ventures` table instead of `eva_ventures`, or do we need a schema bridge?
3. Should stages 17-25 (simulations) be clearly labeled as "AI Projections" in the UI to set expectations?
4. What's the Gemini token budget per venture, and what's the cost at scale (100 ventures)?

## Suggested Next Steps
1. **Run `/heal sd --sd-id SD-LEO-ORCH-EVA-STAGE-PIPELINE-001`** — verify the 11 child SDs actually delivered what they promised
2. **Audit the schema mismatch** — determine if `ventures` ↔ `eva_ventures` can be unified or needs a bridge table
3. **Create a targeted wiring SD** — register worker, fix schema alignment, add entry point script, test with NichePulse
4. **Do NOT brainstorm a new system** — the system exists; the problem is integration, not design
