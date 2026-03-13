# Vision: Venture Artifact Pipeline Wiring

## Executive Summary

The EHG venture lifecycle requires AI-generated artifacts at each of its 25 stages to advance ventures automatically through the pipeline. A complete CLI-based artifact generation system already exists — 25 stage templates, a StageExecutionWorker class, and a stage-zero queue processor — built by orchestrator SD `SD-LEO-ORCH-EVA-STAGE-PIPELINE-001` with 11 child SDs.

However, the Stage Execution Worker is not running. It's not registered in `config/workers.json`, has no entry point script, and is not started by the LEO stack. Additionally, a database schema mismatch exists between the `ventures` table (used by the web UI and stage-zero processor) and the `eva_ventures` table (expected by the stage execution worker). This vision addresses wiring the existing infrastructure into a functioning end-to-end pipeline.

The goal is NOT to build new artifact generation capabilities — those exist. The goal is to connect the existing components so that a venture created via "Find Me Opportunities" automatically progresses through stages 1-25 (pausing at chairman gates) without manual intervention.

## Problem Statement

Ventures created through the Chairman UI's "Find Me Opportunities" flow get stuck at stage 1 indefinitely. The stage-zero queue processor successfully creates the venture and bootstraps stage work, but no process picks up the venture to execute stages 1 through 25. The auto-advance consumer (`useStageAutoAdvance`) on the frontend correctly polls for artifacts and advances stages — but no artifacts are ever created because the producer (Stage Execution Worker) isn't running.

This affects all ventures in the system. NichePulse (currently at stage 7) was manually advanced through stages. No venture has ever completed the automated pipeline end-to-end.

## Personas

**Chairman (Rick)**: Primary decision-maker who reviews kill/promotion gates. Wants ventures to progress automatically between gates, surfacing only decision points that require human judgment. Currently has to manually advance stages, defeating the purpose of the 25-stage automation.

**EVA (AI Orchestrator)**: The automated system executing stage templates, generating artifacts via Gemini API, and validating cross-stage contracts. Currently exists as code but never runs — needs activation and schema alignment.

**Venture (Entity)**: A business opportunity progressing through the lifecycle. Currently stuck at whatever stage it was manually set to. Needs continuous automated evaluation from stage 1 through stage 25 (or kill gate termination).

## Information Architecture

**Data Flow**: `stage_zero_requests` → Stage Zero Processor → `ventures` table → Stage Execution Worker → `venture_artifacts` → Auto-Advance Consumer → stage progression → Chairman Gate (if applicable) → next stage

**Current Break Point**: Between `ventures` table creation (stage-zero output) and Stage Execution Worker pickup. The worker expects `eva_ventures` but ventures live in `ventures`.

**Key Tables**:
- `ventures` — source of truth for venture state (used by web UI, stage-zero)
- `venture_stage_work` — tracks per-stage status (bootstrapped by RPC)
- `venture_artifacts` — stores generated artifacts (consumed by auto-advance)
- `chairman_decisions` — gate decisions (created at gate entry, approved/rejected by Chairman)
- `eva_ventures` — parallel venture table used by CLI pipeline (SCHEMA MISMATCH)
- `workflow_executions` — execution tracking (used by disabled eva-workers)

**Routes**: No new routes needed. Existing venture detail page already has auto-advance wired.

## Key Decision Points

1. **Schema Reconciliation Strategy**: Unify `ventures` and `eva_ventures` into one table, OR create a bridge/view that lets the worker read from `ventures`
2. **Worker Activation Method**: Register in `workers.json` for LEO stack management, OR create standalone entry point
3. **Simulation Stage Handling (17-25)**: Label as "AI Projections" in UI, OR defer activation to a later phase
4. **Failure Recovery**: What happens when Gemini API fails mid-pipeline — retry from failed stage, or require manual intervention

## Integration Patterns

- **Stage Execution Worker → ventures table**: Worker polls for ventures with `current_lifecycle_stage` needing processing (currently polls `eva_ventures` — needs redirect)
- **Worker → Gemini API**: Via LLM Client Factory with existing retry logic and token budgets per stage
- **Worker → venture_artifacts**: Inserts generated artifacts, triggering auto-advance consumer detection
- **Worker → chairman_decisions**: At gate stages, creates pending decision and waits for Chairman approval before advancing
- **config/workers.json → LEO stack**: Worker registry controls which processes the stack manages (start/stop/restart)

## Evolution Plan

**Phase 1 (Wiring)**: Register worker, fix schema alignment, test with NichePulse. Target: ventures auto-advance through non-gate stages.

**Phase 2 (Gate Integration)**: Verify chairman gate flow works end-to-end — worker pauses, decision surfaces in Chairman UI, approval triggers auto-advance.

**Phase 3 (Observability)**: Add pipeline status to venture detail page — show which stage is executing, estimated completion, error states.

**Phase 4 (Simulation Handling)**: Address stages 17-25 — either label as projections or build real integrations for build/test/launch tracking.

## Out of Scope

- Building new stage templates (all 25 exist)
- Changing the auto-advance consumer logic (already working)
- Modifying the Chairman gate decision UI (already working)
- Real build/test/launch tracking for stages 17-25 (simulation is acceptable for now)
- Multi-tenant or multi-user concerns (single Chairman model)

## UI/UX Wireframes

N/A — no new UI components needed. The existing venture detail page with auto-advance badges and chairman gate buttons already handles the display. The only visible change will be that ventures actually progress through stages automatically.

## Success Criteria

1. A venture created via "Find Me Opportunities" automatically progresses from stage 1 through stage 3 (first kill gate) without manual intervention
2. Stage Execution Worker is registered in `config/workers.json` and starts/stops with LEO stack
3. Generated artifacts appear in `venture_artifacts` table with correct `venture_id`, `lifecycle_stage`, and `artifact_type`
4. Auto-advance consumer detects artifacts and advances stages within 10 seconds of artifact creation
5. Chairman gate stages (3, 5, 10, 13, 16, 22, 23, 24) pause pipeline execution until Chairman approves
6. NichePulse can be run through the full tier-1 pipeline (stages 1-10) as integration test
7. No schema migration required — worker reads from `ventures` table (or view) instead of `eva_ventures`
