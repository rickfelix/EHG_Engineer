# Architecture Plan: Pre-Development Artifact Checklist & Quality Gates

## Stack & Repository Decisions
- **Repositories**: EHG_Engineer (LEO Protocol gate infrastructure)
- **Runtime**: Node.js (existing gate system)
- **Database**: Supabase (PostgreSQL) — extends existing `leo_validation_rules` table
- **Existing Infrastructure (Fully Reusable)**: BaseExecutor (1,021 LOC), ValidationOrchestrator (949 LOC), PLAN-TO-EXEC gates (16+ existing), SD Type Validation (`lib/utils/sd-type-validation.js`), Progressive Preflight (`scripts/phase-preflight.js`, 782 LOC), database-driven `leo_validation_rules`
- **New Dependencies**: None required

## Legacy Deprecation Plan
N/A — additive gates within existing infrastructure. All existing PLAN-TO-EXEC gates continue to function unchanged. New gates are registered alongside existing ones using the same ValidationOrchestrator pattern.

## Route & Component Structure

### EHG_Engineer (Backend)
- `scripts/modules/handoff/executors/plan-to-exec/gates/pre-exec-readiness.js` — **New** (150 LOC): Unified artifact readiness gate. Aggregates brainstorm, vision, architecture, PRD, and EVA registration checks. Type-aware requirements matrix. Returns structured readiness report.
- `scripts/modules/handoff/executors/plan-to-exec/gates/eva-registration-gate.js` — **New** (120 LOC): Validates EVA vision and architecture documents exist and are registered. Advisory mode initially. Checks `eva_vision_documents` and `eva_architecture_plans` tables.
- `scripts/modules/handoff/executors/plan-to-exec/gates/exec-checklist-gate.js` — **New** (60 LOC): Validates PRD `exec_checklist` exists and has ≥1 item before EXEC phase (currently only checked post-EXEC).
- `scripts/modules/handoff/executors/plan-to-exec/gates/exploration-audit-enforcement.js` — **Modified** (20 LOC): Elevate existing exploration audit from advisory to blocking for feature/infrastructure/database SD types.
- `scripts/modules/handoff/executors/plan-to-exec/gates/orchestrator-coherence.js` — **New** (150 LOC): For parent SDs, validate all children have completed LEAD. For child SDs, validate parent is in EXEC. Moves logic from phase-preflight.js into formal gate.
- `scripts/modules/handoff/executors/plan-to-exec/gates/index.js` — **Modified**: Register new gates in the gate array.
- `lib/utils/artifact-requirements.js` — **New** (80 LOC): Type-aware artifact requirements matrix. Exports `getRequiredArtifacts(sdType)` returning which artifacts are required/optional/exempt per SD type.

## Data Layer

### New Tables
None — uses existing tables. Gate results stored in existing `sd_phase_handoffs` JSONB `gate_results` field.

### Existing Tables Used
- `strategic_directives_v2` — SD metadata, type, parent_sd_id
- `product_requirements_v2` — PRD existence, status, exec_checklist
- `eva_vision_documents` — Vision document registration
- `eva_architecture_plans` — Architecture plan registration
- `brainstorm_sessions` — Brainstorm document existence (via document_path or created_sd_id)
- `leo_validation_rules` — Dynamic gate configuration (advisory vs blocking per type)
- `sd_phase_handoffs` — Gate results storage

### RLS
No changes — uses existing service role access for gate validation.

## API Surface
No new endpoints — gates are internal to the handoff system. Results surface through:
- `npm run sd:next` — artifact readiness badges per SD
- `node scripts/handoff.js execute PLAN-TO-EXEC <SD-ID>` — gate pass/fail with readiness report
- `node scripts/phase-preflight.js PLAN-TO-EXEC <SD-ID>` — fast-fail preflight output

## Implementation Phases
- **Phase 1** (2 weeks): Core Gates — Create `pre-exec-readiness.js` unified gate (~150 LOC). Create `artifact-requirements.js` type-aware matrix (~80 LOC). Register in `plan-to-exec/gates/index.js`. Configure as advisory in `leo_validation_rules`. Add artifact readiness badges to `sd:next` output.
- **Phase 2** (1 week): Quality Elevation — Promote readiness gate to blocking for feature/infrastructure. Create `eva-registration-gate.js` (~120 LOC, advisory). Create `exec-checklist-gate.js` (~60 LOC). Elevate exploration audit to blocking (~20 LOC change). Add artifact quality scoring (brainstorm has team analysis, vision has dimensions, architecture has phases).
- **Phase 3** (1 week): Orchestrator and Calibration — Create `orchestrator-coherence.js` (~150 LOC). Wire in phase-coverage-validator. Add Learn command correlation analysis for artifact quality vs implementation outcomes. Collect 30-day calibration data.

## Testing Strategy
- Unit tests for `artifact-requirements.js` (each SD type → expected required/optional/exempt artifacts)
- Unit tests for `pre-exec-readiness.js` (SD with all artifacts → pass, SD missing required artifact → fail with report)
- Unit tests for type-awareness (quick-fix SD → all artifacts exempt, feature SD → all required)
- Integration tests for PLAN-TO-EXEC handoff with new gates (existing gates still pass, new gates evaluate correctly)
- Edge case tests: orchestrator SD with incomplete children → coherence gate fails, documentation SD → no artifact requirements
- Regression tests: all existing PLAN-TO-EXEC tests continue to pass (no existing gate behavior changed)

## Risk Mitigation
- **Gate fatigue**: Advisory-first for 30 days. Type-aware from day 1 (no burden on small fixes). Quick-fix/bugfix exempt. Monitor velocity metrics during advisory period — if measurable slowdown, recalibrate.
- **Compliance theater**: Quality checks, not just existence checks. Brainstorm must have ≥3 team perspectives. Vision must have ≥5 scored dimensions. Architecture must have ≥2 implementation phases. PRD must have populated exec_checklist. Minimum content thresholds prevent boilerplate from passing.
- **EVA coupling risk**: EVA registration gate starts advisory. Does not block PLAN-TO-EXEC until EVA intake redesign is production-ready. Gate configuration stored in `leo_validation_rules` — can be promoted to blocking via database update without code change.
- **Breaking existing workflow**: All new gates use the same ValidationOrchestrator pattern as existing gates. BaseExecutor template method ensures consistent execution. New gates are additive — existing gate behavior unchanged. Feature flag via `leo_validation_rules` advisory/blocking mode.
- **Stale artifact risk**: Deferred to Phase 2. If retrospective data shows stale artifacts correlate with rework, add recency check. Evidence-based, not speculative.
