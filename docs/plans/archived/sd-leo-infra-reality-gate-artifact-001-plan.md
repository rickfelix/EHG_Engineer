<!-- Archived from: C:/Users/rickf/.claude/plans/sd-reality-gate-artifact-name-unification.md -->
<!-- SD Key: SD-LEO-INFRA-REALITY-GATE-ARTIFACT-001 -->
<!-- Archived at: 2026-05-12T16:05:46.848Z -->

# Reality Gate Artifact-Name Unification — DB single source of truth for boundary requirements

## Priority
high

## Description

The cross-phase reality gates check `BOUNDARY_CONFIG[fromStage->toStage]` in `lib/eva/reality-gates.js` (hardcoded) and `LEGACY_GATE_THRESHOLDS` in `lib/eva/stage-zero/profile-service.js` (hardcoded) for required upstream artifacts. The hardcoded names disagree with what stage analyzers actually emit (and what `lifecycle_stage_config.required_artifacts` declares) for 2 of 5 cross-phase boundaries. This SD makes the DB the single source of truth for boundary requirements and removes the hardcoded fallbacks.

This is the same architectural pattern as SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 (just shipped) but at the artifact-name layer instead of the gate-type layer.

**Empirical witness**: NameSignal venture (`57e2645a-8288-4b55-9a44-0805ad4a3df1`) hit the bug at the 9→10 boundary on 2026-05-12T15:44:07Z. The chairman_decisions DFE context says:

```
"reasons": [
  {"code": "ARTIFACT_MISSING", "message": "Required artifact 'engine_risk_assessment' not found for boundary 9->10", "artifact_type": "engine_risk_assessment"},
  {"code": "ARTIFACT_MISSING", "message": "Required artifact 'engine_revenue_model' not found for boundary 9->10", "artifact_type": "engine_revenue_model"}
]
```

But the venture HAS the artifacts under different names: S6 emitted `engine_risk_matrix` and S7 emitted `engine_pricing_model` — exactly what `lifecycle_stage_config.required_artifacts` declares for those stages.

**Four sources disagree** on artifact identifiers (familiar pattern):
1. `artifact-types.js` (code) — exports BOTH `engine_risk_matrix` AND `engine_risk_assessment` as if they were different artifacts (lines 42 + 46). Same with `engine_pricing_model` AND `engine_revenue_model` (lines 43 + 47). Same with `launch_metrics` AND `launch_launch_metrics` (lines 107 + 108, where 108 is already marked @deprecated).
2. Stage analyzers emit: `engine_risk_matrix` (S6), `engine_pricing_model` (S7), `engine_business_model_canvas` (S8), `engine_exit_strategy` (S9), `launch_metrics` (S24).
3. `lifecycle_stage_config.required_artifacts` (DB) declares the analyzers' names as canonical. Matches producer reality.
4. `BOUNDARY_CONFIG['9->10']` and `LEGACY_GATE_THRESHOLDS['9->10']` (hardcoded) declare the duplicate names — `engine_risk_assessment`, `engine_revenue_model`. NEVER emitted by any stage. Same problem at `BOUNDARY_CONFIG['23->24']` which references the @deprecated `launch_launch_metrics` instead of canonical `launch_metrics`.

**Blast radius** (verified across all 5 cross-phase boundaries):

| Boundary | BOUNDARY_CONFIG artifact names | Match emitter? |
|---|---|---|
| 5→6 | truth_problem_statement, truth_target_market_analysis, truth_value_proposition | ✓ |
| **9→10** | engine_risk_assessment, engine_revenue_model, engine_business_model_canvas | **✗ 2 of 3 broken** |
| 12→13 | engine_business_model_canvas, blueprint_technical_architecture, blueprint_project_plan | ✓ |
| 17→18 | blueprint_review_summary | ✓ |
| **23→24** | launch_launch_metrics (DEPRECATED), launch_user_feedback_summary, launch_production_app | **✗ uses deprecated alias** |

40% of cross-phase boundaries are broken; 1 currently-blocked venture witnesses this.

**Root architectural cause**: `reality-gates.js:91-94` comment says "When requiredArtifacts is provided (from lifecycle_stage_config), uses those instead of the deprecated BOUNDARY_CONFIG. Falls back to BOUNDARY_CONFIG if requiredArtifacts is not supplied." But `eva-orchestrator.js` does NOT pass `requiredArtifacts` to evaluateRealityGate at boundary checks — so the stale fallback is always reached. The architectural deprecation marker exists but the migration was never completed.

**Design**: same pattern as the just-shipped venture-gate unification — make the DB authoritative, remove the hardcoded fallback, eliminate duplicate identifiers.

## Rationale

User explicitly authorized "do the right thing and not just go with a band-aid" continuation of the just-shipped venture-gate-unification approach. This SD applies the same DB-as-source-of-truth pattern to a sibling subsystem (reality gates at cross-phase boundaries).

Prior related SDs:
- SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 (shipped 2026-05-12) — same architectural pattern at the gate-decision layer. This SD extends to the artifact-name layer.
- The 2026-04-06 `expand_venture_artifacts_check_constraint.sql` migration introduced the duplicate `engine_risk_assessment` / `engine_revenue_model` names alongside the existing `engine_risk_matrix` / `engine_pricing_model`. The producer analyzers were never migrated to emit the new names; the BOUNDARY_CONFIG never migrated back.

## Scope (Functional Requirements)

FR-1: New DB table `gate_boundary_config` (or new JSONB column on `lifecycle_stage_config`) carrying per-boundary required artifacts. Backfill from corrected BOUNDARY_CONFIG values with `engine_risk_matrix` + `engine_pricing_model` at 9→10 and `launch_metrics` at 23→24. Idempotent UPSERT keyed on `from_stage, to_stage`. Single transaction with inline verification SELECT asserting expected boundary count and artifact_type validity (every boundary's required artifact_type must appear in some upstream stage's `lifecycle_stage_config.required_artifacts`).

FR-2: Refactor `lib/eva/reality-gates.js evaluateRealityGate` to read boundary requirements from the new DB source. Remove BOUNDARY_CONFIG hardcoded fallback. Defensive null-data handling — when no DB row matches, return advisory pass with warning rather than treating missing config as a hard fail.

FR-3: Refactor `lib/eva/stage-zero/profile-service.js LEGACY_GATE_THRESHOLDS` similarly — derived from DB or removed if downstream callers can read directly from the new boundary table.

FR-4: Update `lib/eva/eva-orchestrator.js` reality-gate callsite to no longer require the caller to pass `requiredArtifacts` — the gate sources from DB internally. Eliminates the "fall through to deprecated fallback" failure mode.

FR-5: `lib/eva/artifact-types.js` cleanup — mark `ENGINE_RISK_ASSESSMENT`, `ENGINE_REVENUE_MODEL`, `LAUNCH_LAUNCH_METRICS` as `@deprecated` aliases of the canonical names. Add inline comments pointing to the canonical name. Do not remove yet (one-release deprecation window).

FR-6: Test coverage for: DB-driven boundary lookup; missing-boundary-config graceful path; canonical-name resolution; integration test that runs a synthetic 9→10 transition and verifies the gate passes with `engine_risk_matrix` / `engine_pricing_model` emitted.

FR-7: Validation script `scripts/validate-boundary-config-coherence.mjs` that asserts every boundary's required artifact_type appears in some upstream stage's `lifecycle_stage_config.required_artifacts`. Wire into CI as a pre-merge guard so the drift class can never recur.

## Out of Scope

- The duplicate artifact-type identifiers in `artifact-types.js` are marked @deprecated but not removed in this SD. A follow-up SD will retire them after one release.
- Removing the `venture_artifacts` CHECK constraint entries for the deprecated names — keeping them allows historical rows to remain valid. Cleanup of legacy rows (if any) is a separate concern.
- The orphan reality-gate paths in `lib/proving-companion/stage-config.js` — proving-companion is a different subsystem with its own contract; out of scope here.
- NameSignal's currently-pending `gate_failure_escalation` decision (`0a765f40-f659-472a-877f-6f0a1514019d`) will resolve cleanly when this SD ships (the gate will pass), but during EXEC the chairman may manually approve to keep the venture moving.

## Risk

- Removing BOUNDARY_CONFIG affects any venture currently mid-boundary-evaluation. Mitigation: FR-2 retains the function signature and falls back to the new DB source — runtime behavior changes from "use stale config" to "use correct config".
- New DB table introduces a new write-path. Mitigation: read-only at runtime; writes only during seeding migrations. RLS policy: authenticated SELECT, service-role writes (same shape as `stage_config`).
- LEGACY_GATE_THRESHOLDS may have callers besides the reality-gate path. Mitigation: PLAN phase greps for all consumers; FR-3 updates them or marks them deprecated.

## Success Criteria

1. All 5 cross-phase boundaries (5→6, 9→10, 12→13, 17→18, 23→24) reference artifact_types that match what upstream stages actually emit.
2. `reality-gates.js evaluateRealityGate` returns from a single DB source — no hardcoded BOUNDARY_CONFIG remains in code.
3. Validation script `scripts/validate-boundary-config-coherence.mjs` returns 0 mismatches when run against production DB.
4. NameSignal venture mechanically transitions 9→10 (gate passes) when SD ships AND once the existing `gate_failure_escalation` pending decision is resolved.
5. Tests: ≥80% line coverage on the new DB-driven gate path; CI guard prevents future drift.
6. CI gates green; ≥85% sub-agent confidence on TESTING + DATABASE.

## Estimated Effort

- Tier 3 SD
- LOC: ~250-400 src + ~250-350 test
- Touched files: ~6-8 (1 migration, 3 lib modules, 1 validation script, 2 test files)
- 1 DB migration
- Target repos: `EHG_Engineer` only (no UI surface)

## Dependencies

None hard. SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 is a sibling unification, not a prerequisite.

## Deletion Audit (Q8)

- Original proposal included full removal of duplicate artifact-type identifiers from `artifact-types.js`. **Trimmed** to "mark as deprecated, defer removal one release" — preserves callers that might reference them. Saves ~40 LOC + cross-repo deprecation coordination. ~10% LOC reduction.
- Original proposal included `venture_artifacts` CHECK constraint cleanup. **Removed** entirely — out of scope; historical rows under deprecated names should remain valid. Saves a migration. ~15% LOC reduction.
- Original FR-7 (CI guard validation) considered cuttable but kept — prevents the entire drift class from recurring; this is the lever that makes the unification self-enforcing.

Total scope reduction from initial proposal: ~25% LOC and 0 FRs.
