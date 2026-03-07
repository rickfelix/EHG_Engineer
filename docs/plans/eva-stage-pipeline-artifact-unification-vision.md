# Vision: EVA Stage Pipeline Artifact Unification

## Executive Summary

The EVA venture lifecycle pipeline processes ventures through 25 stages across 6 phases (THE TRUTH, THE ENGINE, THE IDENTITY, THE BLUEPRINT, THE BUILD LOOP, LAUNCH & LEARN). A comprehensive end-to-end pipeline test of all 25 stages revealed that the artifact type system — the mechanism by which stages produce and validate deliverables — is fundamentally broken due to 5 incompatible artifact type taxonomies across the codebase.

The root cause: the orchestrator hardcodes `artifactType: 'stage_output'` for ALL stage artifacts, while reality gates expect specific typed artifacts (e.g., `financial_model`, `risk_matrix`). This means every reality gate at every mode boundary fails, killing ventures that have legitimately completed their work. Additionally, missing database columns, FK constraint mismatches, and broken subsystems (SD Bridge, GoldenNuggetValidator) compound the problem.

This vision establishes a **single source of truth** for artifact types (`lifecycle_stage_config` database table), aligns all consumers to read from it, and fixes the downstream systems that depend on correctly-typed artifacts.

## Problem Statement

**Who is affected**: Every venture processed through the EVA lifecycle pipeline. The pipeline is the core value-creation engine of EHG — ventures cannot advance through stages without it.

**Current impact**:
- All 5 reality gates fail (5→6, 9→10, 12→13, 16→17, 22→23) because artifacts are typed `stage_output` instead of the expected names
- Failed reality gates trigger DFE escalation which also fails (missing `context` column on `chairman_decisions`)
- Ventures are marked `killed_at_reality_gate` despite completing legitimate work
- The SD Bridge at Stage 18 creates orchestrator SDs but all child SDs fail with `check_target_application` constraint
- Devil's Advocate artifacts can't persist (missing `source` column on `venture_artifacts`)
- Event tracing fails on every stage advance (FK constraint mismatch)
- The GoldenNuggetValidator can't load its config (wrong file path) and uses its own incompatible taxonomy

**Scale**: These are not edge cases — they affect 100% of ventures at every mode boundary.

## Personas

### Chairman (Rick)
- **Goals**: Walk ventures through the full 25-stage lifecycle, making informed go/no-go decisions at gates
- **Mindset**: Wants to understand what each stage produces, trust that gates enforce real quality checks
- **Key activities**: Reviewing stage artifacts, approving/rejecting at decision gates, monitoring venture health
- **Pain point**: Gates kill ventures due to artifact naming bugs, not genuine quality failures

### EVA Orchestrator (System)
- **Goals**: Process stages, persist artifacts, advance ventures through gates
- **Mindset**: Follows contracts and configs to determine completion and advancement
- **Key activities**: Running LLM analysis, persisting artifacts, evaluating gate conditions
- **Pain point**: Hardcoded `stage_output` type means all artifacts are "generic" — gates can't find them

### LEO Protocol (System)
- **Goals**: Create and execute Strategic Directives from venture lifecycle milestones
- **Mindset**: SD Bridge converts lifecycle events into engineering work items
- **Key activities**: Creating orchestrator SDs with child SDs from sprint items
- **Pain point**: SD Bridge child creation fails because sprint items lack `target_application`

## Information Architecture

### Data Flow: Stage Analysis → Artifact Persistence → Gate Validation

```
lifecycle_stage_config (DB)
  ├── required_artifacts: ["financial_model"]     ← Single source of truth
  │
  ├── Orchestrator reads required_artifacts
  │   └── Persists each section as typed artifact
  │       └── venture_artifacts.artifact_type = "financial_model"
  │
  ├── Reality Gates read required_artifacts
  │   └── Queries venture_artifacts WHERE artifact_type IN (required)
  │       └── PASS if all present with quality >= threshold
  │
  ├── GoldenNuggetValidator reads required_artifacts
  │   └── Validates artifact content meets minimum standards
  │
  └── Stage Contracts reference required_artifacts
      └── Pre-stage validation checks upstream artifacts exist
```

### Database Tables Involved

| Table | Role | Current Issue |
|-------|------|---------------|
| `lifecycle_stage_config` | Canonical artifact type definitions | Working correctly — this is the source of truth |
| `venture_artifacts` | Stores artifacts with `artifact_type` | Missing `source` and `artifact_data` columns |
| `chairman_decisions` | Gate decisions and escalations | Missing `context` column |
| `eva_events` | Event tracing | FK references `eva_ventures.id` but code passes `ventures.id` |
| `strategic_directives_v2` | SD Bridge target | `check_target_application` constraint blocks child SDs with undefined fields |

### Navigation / Routes

No UI changes required. This is entirely backend infrastructure.

## Key Decision Points

These decisions were made during the Q&A phase with the Chairman:

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | `lifecycle_stage_config` is the single source of truth | Eliminates 4 other competing taxonomies; already has correct data for all 25 stages |
| 2 | Fix misaligned artifact names now | Stage/artifact combinations in the DB that don't match stage purpose should be corrected |
| 3 | Stages 18-19 keep empty `required_artifacts` | Their output is DB state (SDs created, tasks tracked), not document artifacts |
| 4 | Reality gates block, don't kill | Chairman decides venture fate — gates shouldn't unilaterally kill ventures |
| 5 | All artifacts in array required for multi-artifact stages | Enforces full scope of each stage's deliverables |
| 6 | Section-based extraction from single LLM output | One LLM call, extract sections matching each required artifact type |
| 7 | Include DB migration fixes in this SD | Missing columns cause silent failures across multiple subsystems |
| 8 | Fix code to pass `eva_ventures.id` for events | FK constraint is correct — code is passing the wrong ID |
| 9 | Include SD Bridge fix | Stage 18's core function; tightly coupled to artifact/orchestration work |
| 10 | Orchestrator SD with children | ~20 issues across 6 categories; children enable independent implementation |
| 11 | Refactor GoldenNuggetValidator to read from DB | Eliminates path bug and another taxonomy drift source |

## Integration Patterns

### Orchestrator → lifecycle_stage_config

The orchestrator (`eva-orchestrator.js`) currently hardcodes `artifactType: 'stage_output'`. After this work:

```javascript
// BEFORE (broken):
steps = [{ artifactType: 'stage_output' }];

// AFTER (reads from DB):
const stageConfig = await getStageConfig(stageNumber);
const requiredArtifacts = stageConfig.required_artifacts; // e.g., ["financial_model"]
// For multi-artifact stages, extract sections from LLM output
// For single-artifact stages, persist the whole output with the correct type
```

### Reality Gates → lifecycle_stage_config

Reality gates (`reality-gates.js`) currently hardcode `BOUNDARY_CONFIG`. After this work:

```javascript
// BEFORE (hardcoded, wrong names):
const BOUNDARY_CONFIG = { '5->6': { required_artifacts: ['problem_statement', ...] } };

// AFTER (reads from DB):
async function getBoundaryRequirements(fromStage, toStage) {
  // Read all stages fromStage+1..toStage from lifecycle_stage_config
  // Aggregate their required_artifacts
  // Apply quality thresholds from config or defaults
}
```

### GoldenNuggetValidator → lifecycle_stage_config

Currently reads from a YAML file at the wrong path. After this work, reads artifact types and validation rules from the DB.

### SD Bridge → Sprint Item Validation

The LifecycleSDBridge creates child SDs from sprint items. Currently fails because items lack `target_application`. Fix: validate and default sprint item fields before SD creation.

## Evolution Plan

### Phase 1: Foundation (Children A + B)
- Add missing DB columns (`source`, `artifact_data`, `context`)
- Fix FK constraint code (eva_events)
- Refactor orchestrator to read from `lifecycle_stage_config` and persist typed artifacts
- This unblocks everything else

### Phase 2: Gate Alignment (Child C)
- Refactor reality gates to read from `lifecycle_stage_config` instead of hardcoded `BOUNDARY_CONFIG`
- Change gate failure behavior from kill to block
- Ensure quality thresholds are configurable

### Phase 3: Subsystem Fixes (Children D + E)
- Fix SD Bridge child SD creation (target_application, key generation)
- Refactor GoldenNuggetValidator to read from DB
- Fix stage contract cross-stage validation

### Phase 4: Validation (Child F)
- Run comprehensive 25-stage pipeline test
- Verify all issues resolved
- Document any new issues surfaced
- This child SD is the iterative evaluation gate

## Out of Scope

- **UI changes**: No frontend work. This is entirely backend infrastructure.
- **Stage template prompt changes**: LLM prompts stay the same. Only the persistence layer changes.
- **New stage additions**: We're fixing the existing 25-stage pipeline, not adding stages.
- **AutonomyModel L0 default**: The "Cannot coerce to single JSON object" warning is a separate issue — ventures defaulting to L0 is safe behavior.
- **Stages v2 YAML deprecation**: The YAML file remains as documentation. We're removing it as a runtime dependency, not deleting it.
- **Quality score tuning**: We're making gates use correct artifact types and configurable thresholds, but not tuning what "good" scores look like.

## UI/UX Wireframes

N/A — no UI component. This is backend infrastructure work.

## Success Criteria

1. **Full 25-stage pipeline test passes end-to-end** with a test venture advancing from stage 1 through stage 25 without any artifact-type-related failures
2. **All 5 reality gates evaluate correctly** — checking for artifacts by the names defined in `lifecycle_stage_config`, not hardcoded names
3. **Multi-artifact stages** (10, 11, 14, 17, 21, 24, 25) persist each required artifact as a separate typed entry in `venture_artifacts`
4. **Reality gate failures block** the venture (state = `blocked`) instead of killing it
5. **Zero "column does not exist" errors** in pipeline logs — all referenced columns exist in the schema
6. **Zero FK constraint violations** in `eva_events` — tracer passes `eva_ventures.id` correctly
7. **SD Bridge creates child SDs successfully** at Stage 18 with valid `target_application` and proper key generation
8. **GoldenNuggetValidator reads from `lifecycle_stage_config`** instead of the YAML file
9. **Post-completion pipeline test** runs automatically as the final child SD, producing a pass/fail report with any remaining issues cataloged
