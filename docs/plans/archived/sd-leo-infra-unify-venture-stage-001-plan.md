<!-- Archived from: .prd-payloads/venture-stage-ssot-plan.md -->
<!-- SD Key: SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001 -->
<!-- Archived at: 2026-05-29T15:01:57.562Z -->

# Plan: Unify Venture Stage Definitions into a Single Source of Truth

<!-- target_application: EHG_Engineer -->

## Type
infrastructure

## Priority
high

## Target Application
EHG_Engineer

## Goal
Venture lifecycle stage definitions are fragmented across 6+ sources that drift continuously: two DB tables (stage_config, lifecycle_stage_config), the EHG app's hand-edited venture-workflow.ts (the app's SOLE runtime source — it does not read the DB), 6+ secondary/duplicate stage arrays in the app, three mutually-contradictory hardcoded gate-stage lists, ~50 stale doc files, and dead analysis-step variants left over from the 40 to 26 stage consolidation. Five prior reconciliation SDs played whack-a-mole on individual drifts without removing the structural cause. This SD collapses everything to ONE editable source of truth — a unified DB table — from which every other artifact (the app's venture-workflow.ts, generated config, and documentation) is GENERATED and CI-guarded, and deletes all stale and duplicate definitions. No stage behavior changes: names, classification, and data are reconciled and deduplicated, not redesigned.

## Scope
IN SCOPE (cross-repo: EHG_Engineer plus the ehg app):
- Merge stage_config and lifecycle_stage_config into one unified venture_stages table (superset of all used columns including the app-only component_path), with a backward-compatible transition (old tables become views or stay synced until all readers cut over).
- Repoint every EHG_Engineer reader to the unified table: stage-governance.js, stage-registry.js, stage-registry/index.js, generate-stage-config.cjs, exit-gate-enforcer.js, stage-execution-worker.js, the fn_advance_venture_stage RPC, the canonical-sync triggers, the audit trigger, the supabase_realtime publication membership, and FKs from advisory_checkpoints / chairman_decisions.
- INVERT the source-of-truth direction: make the ehg app's venture-workflow.ts a GENERATED, CI-validated mirror of the DB (preserving app-only componentPath), instead of the hand-edited SSOT it is today.
- Eliminate the app's secondary stage definitions (workflowStages.ts STAGE_CONFIGS [15 stages], StageAnalysisDashboard STAGE_METADATA, the ventures API STAGE_DEFINITIONS, milestoneAutoPopulate VENTURE_LIFECYCLE_STAGES) and reconcile the three contradictory hardcoded gate-stage lists (useStageDisplayData GATE_STAGES, gate-config DEFAULT_HARD_GATE_STAGES, useChairmanConfig hard_gate_stages) so all derive from the single generated source.
- Regenerate or replace stale documentation from the single source (docs/eva/stage-reference.md, the dossiers, critique, cli-venture-lifecycle, research, and 04_features per-stage docs) and delete dead analysis-step variants plus the legacy name fields in stage-contracts.yaml.
- Wire generate + cross-table parity + doc-generation checks into CI / pre-commit so drift cannot reappear.

OUT OF SCOPE:
- Changing what any stage DOES (no behavior or gate-threshold redesign).
- Venture pipeline runtime execution logic beyond repointing reads.

## Objectives
- Establish exactly ONE editable definition of every venture stage (number, name, key, phase/chunk, gate_type, work_type, review_mode, required_artifacts, description, component_path).
- Make every other representation (app config, generated JS, docs) a generated artifact that fails CI if hand-edited or out of sync.
- Remove all stale, duplicate, and dead stage definitions so any reader sees one consistent answer.
- Eliminate the latent correctness bug where different UI paths disagree on which stages are gates.

## Key Changes
| File | Action | Purpose |
|------|--------|---------|
| database/migrations/NEW_create_venture_stages_unified.sql | CREATE | Unified venture_stages table, data migration, triggers, audit, realtime, FK repoint |
| lib/eva/stage-governance.js | MODIFY | Single-table read; one realtime subscription instead of two |
| lib/eva/stage-registry.js | MODIFY | Single-table read; drop the in-memory cross-table join |
| lib/eva/stage-registry/index.js | MODIFY | Single-table read |
| scripts/generate-stage-config.cjs | MODIFY | Invert direction: generate venture-workflow.ts FROM the DB |
| ehg/src/config/venture-workflow.ts | MODIFY | Becomes a generated mirror; preserve app-only componentPath |
| ehg/src/types/workflowStages.ts | DELETE | Remove the 15-stage duplicate STAGE_CONFIGS |
| ehg/src/lib/gate-config.ts | MODIFY | Derive gate-stage lists from the single source |
| docs/eva/stage-reference.md | MODIFY | Generated from the unified table |
| lib/eva/stage-templates/analysis-steps/stage-20-build-execution.js | DELETE | Dead variant from the 40 to 26 consolidation |
| lib/eva/contracts/stage-contracts.yaml | MODIFY | Drop legacy non-canonical name fields |

## Risks
- Live migration of two tables that back gate logic in a running pipeline with 3+ parallel sessions — must use a backward-compatible transition (views or sync) so no in-flight session or the app breaks mid-cutover.
- Inverting the SSOT direction requires the unified table to absorb app-only fields (componentPath) before it can generate venture-workflow.ts.
- The app's hardcoded gate lists currently disagree with each other and with the DB — reconciling them may surface UI behavior that silently depended on a wrong list.
- Cross-repo coordination (EHG_Engineer plus ehg) and the PR-size limit require decomposition into children.
- The fn_advance_venture_stage RPC and the audit / realtime / FK machinery must be repointed atomically with the data migration.

## Key Principles
- The DB is the single source of truth; every other representation is generated and CI-guarded.
- Backward-compatible transition first (add the unified table, keep old tables readable), cut readers over, then remove — never a destructive big-bang on live tables.
- Generate, do not hand-edit: any artifact derivable from the source must fail CI if edited directly.
- No behavior change — reconcile and deduplicate definitions; do not redesign stages.
- Parallel-session safe: isolate file work in a worktree and coordinate the migration window with other sessions.

## Acceptance
- A single editable artifact defines all 26 stages; the old tables are removed or demoted to non-authoritative views.
- venture-workflow.ts, the generated config, and stage-reference.md are all produced by a generator, and a CI check fails if any of them drifts from the unified source.
- All secondary app stage definitions and the three contradictory hardcoded gate lists are removed or derived from the single source; one consistent gate-stage set exists repo-wide.
- Dead analysis-step variants and the legacy stage-contracts.yaml name fields are deleted.
- Stale per-stage docs are regenerated from the source; no doc references a superseded stage name.
- The full venture-lifecycle test suite passes and gate classification (kill / promotion / review) is unchanged from current canonical values.

## Decomposition
Proposed children (finalized during PLAN):
- Child A (database, keystone, no deps): unified venture_stages table, data migration, triggers, audit, realtime, FK and RPC repoint, with old tables kept readable during the transition.
- Child B (infrastructure, depends on A): repoint all EHG_Engineer readers and invert the generator direction.
- Child C (feature, ehg app, depends on A and B): venture-workflow.ts becomes a generated mirror; delete app secondary definitions; reconcile the hardcoded gate lists.
- Child D (documentation, depends on A through C): regenerate or replace stale docs; delete dead analysis-step variants and legacy stage-contracts.yaml names; wire CI / pre-commit drift guards.
