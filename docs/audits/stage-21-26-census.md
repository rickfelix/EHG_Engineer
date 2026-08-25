# Stage 21-26 Census

- **Generated**: 2026-08-25T21:07:44.335Z
- **SD**: SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-A
- **Re-run command**: `node scripts/audits/stage-21-26-census.mjs`
- **Scope**: 2 filesystem repos (EHG_Engineer, ehg) + 1 shared database (not 2 separate databases)

## Negative Control

PASS -- both known-live stage 21/22 `component_path` mismatches were detected:

- stage_number=21 -> component_path=`Stage22DistributionSetup.tsx`
- stage_number=22 -> component_path=`Stage21VisualAssets.tsx`

## Per-Surface Findings

| Surface | Count | Classification |
|---|---|---|
| information_schema stage-bearing columns | 7 | - |
| jsonb metadata paths (eva_stage_gate_attempts) | 0 | - |
| pg_proc function bodies | 24 | hand-written |
| views/matviews | 3 | hand-written |
| array-typed columns | 8 | hand-written |
| venture_stages.component_path mismatches (negative control source) | 2 | hand-written |
| Code sweep: EHG_Engineer | 3184 | see detail below |
| Code sweep: ehg | 617 | see detail below |

## Code Findings Detail

| Repo | File | Line | Match | Classification |
|---|---|---|---|---|
| EHG_Engineer | .github/workflows/lovable-checklist.yml | 83 | `Stage 21` | hand-written |
| EHG_Engineer | .github/workflows/lovable-checklist.yml | 101 | `Stage 21` | hand-written |
| EHG_Engineer | .github/workflows/worker-smoke.yml | 46 | `stage-23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 243 | `stage24` | hand-written |
| EHG_Engineer | CHANGELOG.md | 369 | `stage-21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 370 | `stage-21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 371 | `stage21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 402 | `Stage23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 749 | `stage 24` | hand-written |
| EHG_Engineer | CHANGELOG.md | 892 | `Stage 21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 892 | `Stage 22` | hand-written |
| EHG_Engineer | CHANGELOG.md | 893 | `Stage 21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 893 | `Stage 22` | hand-written |
| EHG_Engineer | CHANGELOG.md | 894 | `Stage 21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1127 | `Stage-23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1128 | `Stage-23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1128 | `stage-23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1128 | `Stage-23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1130 | `Stage-23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1131 | `stage-23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1131 | `stage-23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1131 | `stage-23` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1231 | `stage-21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1232 | `stage-22` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1432 | `stage 22` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1802 | `Stage 25` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1803 | `Stage-25` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1803 | `Stage25` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1803 | `Stage26` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1894 | `stage 21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1895 | `stage 21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1895 | `stage 22` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1895 | `stage 21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1897 | `stage 21` | hand-written |
| EHG_Engineer | CHANGELOG.md | 1897 | `stage 22` | hand-written |
| EHG_Engineer | CLAUDE_EXEC.md | 1966 | `stage_number": 21` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 24 | `stage_number":21` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 24 | `stage_number":22` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 24 | `stage_number":23` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 24 | `stage_number":24` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 24 | `stage_number":25` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 24 | `stage_number":26` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 44 | `stage_number":26` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 44 | `stage_number":21` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 44 | `stage_number":25` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 44 | `stage_number":22` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 44 | `stage_number":23` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 44 | `stage_number":24` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 57 | `stage_number":21` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 57 | `stage_number":22` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 57 | `stage_number":22` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 57 | `stage_number":23` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 57 | `stage_number":24` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 57 | `stage_number":25` | hand-written |
| EHG_Engineer | database/backups/20260530_childF_legacy_stage_tables_backup.sql | 57 | `stage_number":25` | hand-written |
| EHG_Engineer | database/chairman-gated/20260825_ventures_canonical_writer_choke.sql | 229 | `stage24` | hand-written |
| EHG_Engineer | database/chairman-gated/20260825_ventures_canonical_writer_choke.sql | 231 | `stage24` | hand-written |
| EHG_Engineer | database/chairman-gated/20260825_ventures_canonical_writer_choke.sql | 231 | `Stage 23` | hand-written |
| EHG_Engineer | database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql | 480 | `Stage 23` | hand-written |
| EHG_Engineer | database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql | 746 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20251206_vision_transition_parent_orchestrator.sql | 300 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20251206_vision_transition_parent_orchestrator.sql | 300 | `Stage 22` | hand-written |
| EHG_Engineer | database/migrations/20251206_vision_transition_parent_orchestrator.sql | 300 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20251206_vision_transition_parent_orchestrator.sql | 300 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20251206_vision_transition_parent_orchestrator.sql | 300 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20251207_add_plan_review_flags_to_001d_grandchildren.sql | 104 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20251207_add_plan_review_flags_to_001d_grandchildren.sql | 105 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20251207_add_plan_review_flags_to_001d_grandchildren.sql | 107 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20251207_add_plan_review_flags_to_001d_grandchildren.sql | 108 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20251207_add_vision_references_to_001d_grandchildren.sql | 212 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20251207_add_vision_references_to_001d_grandchildren.sql | 213 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20251207_update_001d_grandchildren_full_product_scope.sql | 127 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20251207_update_001d_grandchildren_full_product_scope.sql | 136 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20251207_update_001d_grandchildren_full_product_scope.sql | 139 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20251207_update_001d_grandchildren_full_product_scope.sql | 144 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20251207_update_001d_grandchildren_full_product_scope.sql | 144 | `Stage 22` | hand-written |
| EHG_Engineer | database/migrations/20251207_update_001d_grandchildren_full_product_scope.sql | 144 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20251207_update_001d_grandchildren_full_product_scope.sql | 144 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20251207_update_001d_grandchildren_full_product_scope.sql | 144 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20251220_industrial_expansion.sql | 48 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20251220_industrial_expansion.sql | 236 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20251220_industrial_expansion.sql | 288 | `Stage 22` | hand-written |
| EHG_Engineer | database/migrations/20251220_industrial_expansion.sql | 288 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20251220_industrial_expansion.sql | 288 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20251220_industrial_expansion.sql | 288 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20251220_industrial_expansion.sql | 300 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20251220_register_industrial_subagents.sql | 11 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_stage20_compliance_gate_integration.sql | 6 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260118_upgrade_stage24_retention.sql | 54 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_upgrade_stage24_retention.sql | 64 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_upgrade_stage24_retention.sql | 87 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_upgrade_stage24_retention.sql | 2 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_upgrade_stage24_retention.sql | 5 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_upgrade_stage24_retention.sql | 16 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_upgrade_stage24_retention.sql | 17 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_upgrade_stage24_retention.sql | 67 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_upgrade_stage24_retention.sql | 70 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 67 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 77 | `Stage-25` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 132 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 230 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 266 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 348 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 348 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 355 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 364 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 365 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 378 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 390 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 566 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 696 | `Stage-25` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 696 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 703 | `Stage-25` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 712 | `Stage-25` | hand-written |
| EHG_Engineer | database/migrations/20260118_venture_lifecycle_gap_remediation.sql | 720 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 868 | `Stage21QUAT.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 869 | `Stage22Deployment.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 885 | `Stage23Launch.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 886 | `Stage24Analytics.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 887 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 310 | `stage-25` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 402 | `stage-22` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 410 | `stage-22` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 420 | `stage-23` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 420 | `stage-25` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 420 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 425 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 428 | `stage-23` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 428 | `stage-25` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 526 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 532 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 876 | `stage_21` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 877 | `stage_22` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 890 | `stage_23` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 891 | `stage_24` | hand-written |
| EHG_Engineer | database/migrations/20260207_cli_venture_lifecycle_sd_hierarchy.sql | 892 | `stage_25` | hand-written |
| EHG_Engineer | database/migrations/20260214_eva_gate_constraints.sql | 189 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260214_eva_gate_constraints.sql | 189 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260214_venture_templates.sql | 4 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260214_venture_templates.sql | 63 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260312_fix_telemetry_view_phase1.sql | 29 | `stage_23` | hand-written |
| EHG_Engineer | database/migrations/20260312_fix_telemetry_view_phase1.sql | 38 | `stage_23` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 24 | `stage_number = 26` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 26 | `stage_number = 26` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 26 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 27 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 27 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 28 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 28 | `stage_number = 23` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 29 | `stage_number = 23` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 29 | `stage_number = 22` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 30 | `stage_number = 22` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 30 | `stage_number = 21` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 31 | `stage_number = 21` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 119 | `stage_number = 26` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 121 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 19 | `stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 21 | `stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 59 | `stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260322_stage_renumbering_blueprint_review.sql | 71 | `stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260322_update_bootstrap_and_approve_26.sql | 11 | `Stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260322_update_bootstrap_and_approve_26.sql | 11 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260322_update_bootstrap_and_approve_26.sql | 12 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260322_update_bootstrap_and_approve_26.sql | 12 | `Stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260322_update_fn_advance_stage_26.sql | 8 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260322_update_fn_advance_stage_26.sql | 54 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260322_update_fn_advance_stage_26.sql | 98 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260329_rescan_stage20_artifact_check.sql | 129 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260329_rescan_stage20_rpc.sql | 70 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260329_rescan_stage20_rpc.sql | 105 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260406_add_artifact_gate_to_fn_advance_venture_stage.sql | 246 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260409_unified_gate_enforcement_stage_config.sql | 435 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260421_expand_venture_artifacts_marketing_types.sql | 49 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260421_expand_venture_artifacts_marketing_types.sql | 51 | `Stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260421_expand_venture_artifacts_marketing_types.sql | 60 | `Stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260503_verify_s22_schema_preconditions.sql | 13 | `stage_number=22` | hand-written |
| EHG_Engineer | database/migrations/20260503_verify_s22_schema_preconditions.sql | 63 | `stage_number = 22` | hand-written |
| EHG_Engineer | database/migrations/20260503_verify_s22_schema_preconditions.sql | 66 | `stage_number=22` | hand-written |
| EHG_Engineer | database/migrations/20260504_ensure_s21_lifecycle_stage_config.sql | 53 | `stage_number = 21` | hand-written |
| EHG_Engineer | database/migrations/20260504_ensure_s21_lifecycle_stage_config.sql | 56 | `stage_number=21` | hand-written |
| EHG_Engineer | database/migrations/20260504_ensure_s21_lifecycle_stage_config.sql | 2 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260504_ensure_s21_lifecycle_stage_config.sql | 10 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260504_ensure_s25_lifecycle_stage_config.sql | 56 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/20260504_ensure_s25_lifecycle_stage_config.sql | 59 | `stage_number=25` | hand-written |
| EHG_Engineer | database/migrations/20260504_ensure_s25_lifecycle_stage_config.sql | 2 | `stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260504_extend_venture_artifacts_postlaunch_types.sql | 4 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260504_extend_venture_artifacts_postlaunch_types.sql | 66 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260504_extend_venture_artifacts_postlaunch_types.sql | 69 | `Stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260504_extend_venture_artifacts_postlaunch_types.sql | 78 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260504_extend_venture_artifacts_postlaunch_types.sql | 84 | `Stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260504_extend_venture_artifacts_visual_skipped.sql | 58 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260504_extend_venture_artifacts_visual_skipped.sql | 62 | `Stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260504_extend_venture_artifacts_visual_skipped.sql | 71 | `Stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260504_fn_advance_venture_stage_canonical_artifact_source.sql | 235 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260505_120000_backfill_launch_readiness_checklist_artifact_type.sql | 2 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260505_120000_backfill_launch_readiness_checklist_artifact_type.sql | 29 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260505_120000_backfill_launch_readiness_checklist_artifact_type.sql | 48 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260505_120000_backfill_launch_readiness_checklist_artifact_type.sql | 54 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260507_add_launch_metrics_artifact_type.sql | 202 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260507_add_launch_metrics_artifact_type.sql | 304 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260507_add_launch_metrics_artifact_type.sql | 331 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260507_add_launch_metrics_artifact_type.sql | 1 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260507_add_launch_metrics_artifact_type.sql | 252 | `Stage-24` | hand-written |
| EHG_Engineer | database/migrations/20260507_add_launch_metrics_artifact_type.sql | 255 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260507_add_launch_metrics_artifact_type.sql | 276 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260507_add_launch_metrics_artifact_type.sql | 283 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260507_extend_venture_artifacts_postlaunch_v2_regenerated.sql | 183 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/20260507_extend_venture_artifacts_postlaunch_v2_regenerated.sql | 259 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/20260507_extend_venture_artifacts_postlaunch_v2_regenerated.sql | 1 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/20260509_extend_venture_artifacts_growth_optimization_roadmap.sql | 1 | `Stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260509_growth_optimization_roadmap_terminal_gates.sql | 35 | `stage_number = 26` | hand-written |
| EHG_Engineer | database/migrations/20260509_growth_optimization_roadmap_terminal_gates.sql | 60 | `stage_number = 26` | hand-written |
| EHG_Engineer | database/migrations/20260509_growth_optimization_roadmap_terminal_gates.sql | 68 | `stage_number = 26` | hand-written |
| EHG_Engineer | database/migrations/20260509_growth_optimization_roadmap_terminal_gates.sql | 1 | `Stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260509_growth_optimization_roadmap_terminal_gates.sql | 3 | `Stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260509_growth_optimization_roadmap_terminal_gates.sql | 25 | `Stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260509_growth_optimization_roadmap_terminal_gates.sql | 46 | `Stage 26` | hand-written |
| EHG_Engineer | database/migrations/20260512_stage_config_v2_parity_and_publication.sql | 50 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/20260512_stage_config_v2_parity_and_publication.sql | 106 | `stage_number = 21` | hand-written |
| EHG_Engineer | database/migrations/20260512_stage_config_v2_parity_and_publication.sql | 111 | `stage_number = 22` | hand-written |
| EHG_Engineer | database/migrations/20260512_stage_config_v2_parity_and_publication.sql | 116 | `stage_number = 23` | hand-written |
| EHG_Engineer | database/migrations/20260512_stage_config_v2_parity_and_publication.sql | 122 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260512_stage_config_v2_parity_and_publication.sql | 128 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/20260529_childC_repoint_advance_fn_and_advisory_fk_to_venture_stages.sql | 240 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260529_childC_repoint_advance_fn_and_advisory_fk_to_venture_stages_rollback.sql | 204 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260529_childD_venture_stages_app_fields.sql | 70 | `Stage21VisualAssets.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260529_childD_venture_stages_app_fields.sql | 71 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260529_childD_venture_stages_app_fields.sql | 72 | `Stage23LaunchReadiness.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260529_childD_venture_stages_app_fields.sql | 73 | `Stage24GoLive.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260529_childD_venture_stages_app_fields.sql | 74 | `Stage25PostLaunchReview.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260529_childD_venture_stages_app_fields.sql | 75 | `Stage26GrowthPlaybook.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260530_rescan_stage20_reason.sql | 111 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260530_rescan_stage20_reason.sql | 131 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_23_build_group_alignment.sql | 11 | `stage_number = 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_23_build_group_alignment.sql | 16 | `stage_number = 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_23_build_group_alignment.sql | 4 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_23_build_group_alignment.sql | 7 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_23_build_group_alignment.sql | 17 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_23_build_group_alignment.sql | 22 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_definition_alignment.sql | 31 | `stage_number = 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_definition_alignment.sql | 75 | `stage_number = 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_definition_alignment.sql | 12 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_definition_alignment.sql | 17 | `stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_definition_alignment.sql | 30 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_definition_alignment.sql | 65 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_definition_alignment.sql | 77 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260530_venture_stage_definition_alignment.sql | 78 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260607_s21_creative_handoff_gate.sql | 33 | `stage_number = 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_s21_creative_handoff_gate.sql | 6 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_s22_spend_approval_gate.sql | 30 | `stage_number=22` | hand-written |
| EHG_Engineer | database/migrations/20260607_s22_spend_approval_gate.sql | 38 | `stage_number = 22` | hand-written |
| EHG_Engineer | database/migrations/20260607_s22_spend_approval_gate.sql | 6 | `Stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 126 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 139 | `Stage21VisualAssets.tsx` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 61 | `stage_number = 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 62 | `stage_number = 22` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 119 | `stage_number = 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 120 | `stage_number = 22` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 13 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 30 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 43 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 57 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 64 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 110 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 111 | `stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 122 | `Stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 131 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 135 | `Stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 144 | `stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 164 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 164 | `stage 22` | hand-written |
| EHG_Engineer | database/migrations/20260607_swap_stage_21_22_full_content.sql | 182 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260607_venture_artifacts_distribution_types.sql | 6 | `Stage-22` | hand-written |
| EHG_Engineer | database/migrations/20260607_venture_artifacts_distribution_types.sql | 55 | `Stage-22` | hand-written |
| EHG_Engineer | database/migrations/20260607_venture_artifacts_visual_types.sql | 6 | `Stage-21` | hand-written |
| EHG_Engineer | database/migrations/20260607_venture_artifacts_visual_types.sql | 152 | `Stage-21` | hand-written |
| EHG_Engineer | database/migrations/20260610_purge_venture_artifact_storm_residue.sql | 10 | `stage-22` | hand-written |
| EHG_Engineer | database/migrations/20260610_purge_venture_artifact_storm_residue.sql | 11 | `stage-21` | hand-written |
| EHG_Engineer | database/migrations/20260611_add_code_quality_report_artifact_type.sql | 11 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260611_fix_advance_stage_required_artifacts_cast.sql | 8 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260611_guard_pack_secdef_fns.sql | 780 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260611_guard_pack_secdef_fns_DOWN.sql | 654 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition.sql | 20 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition.sql | 25 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition.sql | 200 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition.sql | 211 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition.sql | 236 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition.sql | 352 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition_fixture_bypass.sql | 58 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition_fixture_bypass.sql | 209 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition_fixture_bypass.sql | 220 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition_fixture_bypass.sql | 265 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_chairman_product_review_gate_scoped_precondition_fixture_bypass.sql | 383 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_stage_advancement_fn_advance_venture_stage_retire_legacy_table.sql | 173 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_stage_advancement_fn_advance_venture_stage_retire_legacy_table.sql | 282 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260704_stage_advancement_rescan_stage20_artifact_gate.sql | 233 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260704_stage_advancement_rescan_stage20_artifact_gate.sql | 260 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260706_activate_dormant_exit_gates_observe_only.sql | 68 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260706_fix_stage21_required_artifacts_anyof_ssot.sql | 31 | `stage_number = 21` | hand-written |
| EHG_Engineer | database/migrations/20260706_fix_stage21_required_artifacts_anyof_ssot.sql | 43 | `stage_number = 21` | hand-written |
| EHG_Engineer | database/migrations/20260706_fix_stage21_required_artifacts_anyof_ssot.sql | 6 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260706_fix_stage21_required_artifacts_anyof_ssot.sql | 19 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260706_fix_stage21_required_artifacts_anyof_ssot.sql | 27 | `stage 21` | hand-written |
| EHG_Engineer | database/migrations/20260711_add_distribution_block_marker_artifact_type.sql | 8 | `stage-22` | hand-written |
| EHG_Engineer | database/migrations/20260713_legal_doc_producer_schema.sql | 5 | `Stage-23` | hand-written |
| EHG_Engineer | database/migrations/20260713_legal_doc_producer_schema_hardening.sql | 9 | `Stage-23` | hand-written |
| EHG_Engineer | database/migrations/20260713_legal_doc_producer_schema_hardening.sql | 22 | `Stage-23` | hand-written |
| EHG_Engineer | database/migrations/20260716_add_truth_demand_thesis_artifact_type.sql | 5 | `stage-22` | hand-written |
| EHG_Engineer | database/migrations/20260716_high_consequence_stage_gates.sql | 165 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260716_high_consequence_stage_gates.sql | 317 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 93 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 545 | `stage_number = 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 16 | `stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 16 | `stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 21 | `stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 40 | `stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 54 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 85 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 96 | `stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 101 | `stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 120 | `stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 120 | `stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 296 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 473 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 539 | `stage-24` | hand-written |
| EHG_Engineer | database/migrations/20260722_high_consequence_actuation_completeness.sql | 546 | `Stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql | 39 | `stage 24` | hand-written |
| EHG_Engineer | database/migrations/20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql | 40 | `stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260823_add_thesis_kill_tier_b_to_decision_value.sql | 37 | `stage-22` | hand-written |
| EHG_Engineer | database/migrations/20260823_register_path_integrity_flags.sql | 18 | `Stage23` | hand-written |
| EHG_Engineer | database/migrations/20260823_register_path_integrity_flags.sql | 54 | `Stage 23` | hand-written |
| EHG_Engineer | database/migrations/20260823_register_path_integrity_flags.sql | 55 | `Stage23` | hand-written |
| EHG_Engineer | database/migrations/20260823_register_path_integrity_flags.sql | 60 | `Stage23` | hand-written |
| EHG_Engineer | database/migrations/SD-VISION-TRANSITION-001D6_add_assumptions_report.sql | 13 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/SD-VISION-TRANSITION-001D6_add_assumptions_report.sql | 22 | `stage_number = 25` | hand-written |
| EHG_Engineer | database/migrations/SD-VISION-TRANSITION-001D6_add_assumptions_report.sql | 1 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/SD-VISION-TRANSITION-001D6_add_assumptions_report.sql | 3 | `Stage 25` | hand-written |
| EHG_Engineer | database/migrations/SD-VISION-TRANSITION-001D6_add_assumptions_report.sql | 7 | `Stage 25` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 2232 | `stage_number: 21` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 2243 | `stage_number: 22` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 2255 | `stage_number: 23` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 2264 | `stage_number: 24` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 2273 | `stage_number: 25` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 71 | `stage-25` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 78 | `stage-25` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 223 | `Stage 23` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 235 | `Stage 23` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 1902 | `Stage 25` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 2525 | `Stage 25` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 2613 | `stage 25` | hand-written |
| EHG_Engineer | docs/01_architecture/adr-002-venture-factory-architecture.md | 2642 | `Stage 26` | hand-written |
| EHG_Engineer | docs/01_architecture/database_schema.md | 22 | `Stage 23` | hand-written |
| EHG_Engineer | docs/01_architecture/database_schema.md | 22 | `stage-23` | hand-written |
| EHG_Engineer | docs/01_architecture/database_schema.md | 83 | `Stage 23` | hand-written |
| EHG_Engineer | docs/01_architecture/file-numbering-audit.md | 162 | `Stage 22` | hand-written |
| EHG_Engineer | docs/01_architecture/sd-stage-arch-001-p3.md | 108 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/01_architecture/sd-stage-arch-001-p3.md | 109 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/02_api/23b_feedback_loops_ai.md | 9 | `Stage 23` | hand-written |
| EHG_Engineer | docs/02_api/23b_feedback_loops_ai.md | 392 | `Stage 23` | hand-written |
| EHG_Engineer | docs/02_api/23b_feedback_loops_ai.md | 393 | `Stage 22` | hand-written |
| EHG_Engineer | docs/02_api/23b_feedback_loops_ai.md | 393 | `Stage 24` | hand-written |
| EHG_Engineer | docs/02_api/23b_feedback_loops_ai.md | 872 | `Stage 23` | hand-written |
| EHG_Engineer | docs/02_api/26_security_compliance.md | 9 | `Stage 26` | hand-written |
| EHG_Engineer | docs/02_api/26_security_compliance.md | 78 | `Stage 26` | hand-written |
| EHG_Engineer | docs/02_api/26_security_compliance.md | 320 | `Stage 26` | hand-written |
| EHG_Engineer | docs/02_api/26_security_compliance.md | 321 | `Stage 25` | hand-written |
| EHG_Engineer | docs/02_api/27_actor_model_saga.md | 401 | `Stage 26` | hand-written |
| EHG_Engineer | docs/02_api/ai_ceo_agent.md | 119 | `Stage 23` | hand-written |
| EHG_Engineer | docs/02_api/ai_ceo_agent.md | 164 | `Stage 23` | hand-written |
| EHG_Engineer | docs/03_protocols_and_standards/exceptions/README.md | 40 | `stage-23` | hand-written |
| EHG_Engineer | docs/03_protocols_and_standards/exceptions/README.md | 40 | `Stage 23` | hand-written |
| EHG_Engineer | docs/04_features/20_enhanced_context_loading.md | 96 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/21_preflight_check.md | 9 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/21_preflight_check.md | 91 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/21_preflight_check.md | 92 | `Stage 22` | hand-written |
| EHG_Engineer | docs/04_features/23a_feedback_loops.md | 9 | `Stage 23` | hand-written |
| EHG_Engineer | docs/04_features/23a_feedback_loops.md | 286 | `Stage 23` | hand-written |
| EHG_Engineer | docs/04_features/23a_feedback_loops.md | 287 | `Stage 22` | hand-written |
| EHG_Engineer | docs/04_features/23a_feedback_loops.md | 287 | `Stage 24` | hand-written |
| EHG_Engineer | docs/04_features/24_mvp_engine_iteration.md | 9 | `Stage 24` | hand-written |
| EHG_Engineer | docs/04_features/24_mvp_engine_iteration.md | 277 | `Stage 23` | hand-written |
| EHG_Engineer | docs/04_features/24_mvp_engine_iteration.md | 293 | `Stage 24` | hand-written |
| EHG_Engineer | docs/04_features/24_mvp_engine_iteration.md | 294 | `Stage 23` | hand-written |
| EHG_Engineer | docs/04_features/24_mvp_engine_iteration.md | 294 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/32b_customer_success_ai.md | 31 | `Stage 23` | hand-written |
| EHG_Engineer | docs/04_features/32b_customer_success_ai.md | 31 | `stage-23` | hand-written |
| EHG_Engineer | docs/04_features/32b_customer_success_ai.md | 54 | `Stage 23` | hand-written |
| EHG_Engineer | docs/04_features/32b_customer_success_ai.md | 969 | `Stage 23` | hand-written |
| EHG_Engineer | docs/04_features/capability-router-protocol.md | 170 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/eva-post-pipeline-operations.md | 43 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/eva-post-pipeline-operations.md | 88 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/eva-post-pipeline-operations.md | 108 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/eva-post-pipeline-operations.md | 125 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/eva-post-pipeline-operations.md | 323 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/sd-foundation-v3-006-user-stories-summary.md | 141 | `Stage 23` | hand-written |
| EHG_Engineer | docs/04_features/sd-foundation-v3-006-user-stories-summary.md | 159 | `Stage 24` | hand-written |
| EHG_Engineer | docs/04_features/sd-foundation-v3-006-user-stories-summary.md | 160 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/sd-foundation-v3-006-user-stories-summary.md | 163 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/sd-foundation-v3-006-user-stories-summary.md | 382 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/software-factory-self-healing.md | 26 | `Stage 25` | hand-written |
| EHG_Engineer | docs/04_features/stage20-compliance-gate.md | 57 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/stage20-compliance-gate.md | 112 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/stage20-compliance-gate.md | 139 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/stage20-compliance-gate.md | 185 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/stage20-compliance-gate.md | 211 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/stage20-compliance-gate.md | 277 | `Stage 21` | hand-written |
| EHG_Engineer | docs/04_features/venture-exec-boundary-readiness.md | 65 | `stage-23` | hand-written |
| EHG_Engineer | docs/05_testing/22_iterative_dev_loop.md | 9 | `Stage 22` | hand-written |
| EHG_Engineer | docs/05_testing/22_iterative_dev_loop.md | 86 | `Stage 22` | hand-written |
| EHG_Engineer | docs/05_testing/22_iterative_dev_loop.md | 87 | `Stage 21` | hand-written |
| EHG_Engineer | docs/05_testing/25_quality_assurance.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/05_testing/25_quality_assurance.md | 327 | `Stage 25` | hand-written |
| EHG_Engineer | docs/05_testing/25_quality_assurance.md | 328 | `Stage 24` | hand-written |
| EHG_Engineer | docs/05_testing/25_quality_assurance.md | 328 | `Stage 26` | hand-written |
| EHG_Engineer | docs/05_testing/e2e-coverage-gap-analysis-90-percent.md | 538 | `stage 25` | hand-written |
| EHG_Engineer | docs/06_deployment/eva-operations-mode.md | 22 | `Stage 26` | hand-written |
| EHG_Engineer | docs/06_deployment/eva-operations-mode.md | 70 | `Stage 22` | hand-written |
| EHG_Engineer | docs/06_deployment/eva-operations-mode.md | 71 | `Stage 26` | hand-written |
| EHG_Engineer | docs/06_deployment/eva-operations-mode.md | 75 | `Stage 26` | hand-written |
| EHG_Engineer | docs/06_deployment/eva-operations-mode.md | 328 | `Stage 25` | hand-written |
| EHG_Engineer | docs/adam/ehg-uiux-deep-dive-2026-06-23.md | 18 | `Stage-23` | hand-written |
| EHG_Engineer | docs/adam/ehg-uiux-deep-dive-2026-06-23.md | 18 | `Stage-23` | hand-written |
| EHG_Engineer | docs/adam/ehg-uiux-deep-dive-2026-06-23.md | 21 | `Stage-26` | hand-written |
| EHG_Engineer | docs/adam/ehg-uiux-deep-dive-2026-06-23.md | 21 | `Stage 26` | hand-written |
| EHG_Engineer | docs/adam/ehg-uiux-deep-dive-2026-06-23.md | 21 | `Stage 26` | hand-written |
| EHG_Engineer | docs/architecture/canonical-repo-resolution-census.md | 207 | `stage23` | hand-written |
| EHG_Engineer | docs/architecture/stage-advancement-fr4-tr8-triage.md | 46 | `stage 23` | hand-written |
| EHG_Engineer | docs/architecture/stage-advancement-path-census.md | 101 | `stage 24` | hand-written |
| EHG_Engineer | docs/architecture/stage-advancement-path-census.md | 134 | `Stage-24` | hand-written |
| EHG_Engineer | docs/architecture/stage-advancement-path-census.md | 241 | `stage24` | hand-written |
| EHG_Engineer | docs/architecture/stage-advancement-sibling-app-regression-checklist.md | 52 | `Stage 21` | hand-written |
| EHG_Engineer | docs/architecture/stage-advancement-sibling-app-regression-checklist.md | 62 | `Stage 21` | hand-written |
| EHG_Engineer | docs/architecture/stage-advancement-sibling-app-regression-checklist.md | 89 | `Stage 21` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-acquirability.js | 2 | `Stage 22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-acquirability.js | 11 | `stage-22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-acquirability.js | 18 | `Stage 22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-acquirability.js | 26 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 2 | `Stage 23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 3 | `Stage 23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 9 | `stage-23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 62 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 65 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 67 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 97 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 102 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 114 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 128 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 138 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 147 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 159 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 168 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 187 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 189 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 192 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-deployment.js | 195 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 2 | `Stage 22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 9 | `stage-22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 12 | `stage-22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 13 | `stage-22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 32 | `Stage22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 34 | `Stage 23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 34 | `Stage 21` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 34 | `Stage 22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 44 | `Stage22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 48 | `Stage22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 53 | `Stage22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 70 | `Stage 23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-23-release-readiness.js | 147 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 2 | `Stage 23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 6 | `Stage 22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 7 | `Stage 24` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 9 | `stage-23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 13 | `stage-23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 14 | `stage-23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 31 | `Stage 22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 41 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 43 | `Stage 23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 43 | `Stage 22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-launch-execution.js | 47 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 2 | `Stage 23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 6 | `Stage 22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 9 | `stage-23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 12 | `stage-23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 21 | `Stage 22` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 34 | `Stage23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 41 | `Stage24` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 45 | `Stage24` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 50 | `Stage24` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 58 | `stage 23` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 64 | `Stage 24` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-23-modules/stage-24-marketing-prep.js | 100 | `Stage24` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 7 | `stage-26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 10 | `Stage 26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 15 | `Stage 26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 17 | `stage-26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 18 | `Stage 26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 22 | `stage-26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 23 | `stage-26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 23 | `stage-25` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 26 | `Stage 26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/README.md | 27 | `stage-26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 2 | `Stage 25` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 6 | `Stage 24` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 9 | `stage-25` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 13 | `Stage 24` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 26 | `Stage25` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 33 | `Stage26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 37 | `Stage26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 42 | `Stage26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 57 | `Stage 26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-launch-execution.js | 100 | `Stage26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-venture-review.js | 2 | `Stage 25` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-venture-review.js | 12 | `stage-25` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-venture-review.js | 15 | `stage-25` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-venture-review.js | 38 | `Stage25` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-venture-review.js | 40 | `Stage 26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-venture-review.js | 40 | `Stage 25` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-venture-review.js | 44 | `Stage26` | hand-written |
| EHG_Engineer | docs/archived/orphan-stage-26-modules/stage-26-venture-review.js | 63 | `Stage26` | hand-written |
| EHG_Engineer | docs/audit/open-loop-closure-map.md | 96 | `Stage-23` | hand-written |
| EHG_Engineer | docs/database/lifecycle-gap-migrations-summary.md | 117 | `Stage 21` | hand-written |
| EHG_Engineer | docs/database/stage20-compliance-schema.md | 60 | `Stage 21` | hand-written |
| EHG_Engineer | docs/design/beyond-baseline-horizon.md | 21 | `Stage-25` | hand-written |
| EHG_Engineer | docs/design/operating-company-satellite-architecture-v1.md | 62 | `Stage-21` | hand-written |
| EHG_Engineer | docs/design/operational-maturity-seven-principle-audit.md | 18 | `Stage 26` | hand-written |
| EHG_Engineer | docs/design/operations-layer-design-plan-2026-06-26.md | 33 | `stage 26` | hand-written |
| EHG_Engineer | docs/design/operations-layer-design-plan-2026-06-26.md | 83 | `stage 26` | hand-written |
| EHG_Engineer | docs/design/s20-26-operations-greenfield-spec.md | 5 | `Stage-21` | hand-written |
| EHG_Engineer | docs/design/s20-26-operations-greenfield-spec.md | 16 | `Stage-21` | hand-written |
| EHG_Engineer | docs/design/venture-demand-distribution-engine.md | 13 | `Stage-21` | hand-written |
| EHG_Engineer | docs/design/venture-demand-distribution-engine.md | 14 | `Stage-21` | hand-written |
| EHG_Engineer | docs/design/venture-demand-distribution-engine.md | 24 | `Stage-21` | hand-written |
| EHG_Engineer | docs/design/venture-demand-distribution-engine.md | 31 | `Stage-21` | hand-written |
| EHG_Engineer | docs/design/venture-demand-distribution-engine.md | 62 | `Stage-21` | hand-written |
| EHG_Engineer | docs/design/venture-demand-distribution-engine.md | 88 | `Stage-21` | hand-written |
| EHG_Engineer | docs/design/venture-demand-distribution-engine.md | 90 | `Stage-22` | hand-written |
| EHG_Engineer | docs/design/venture-demand-distribution-engine.md | 114 | `Stage-21` | hand-written |
| EHG_Engineer | docs/eva/cross-stage-data-contracts.md | 24 | `Stage 25` | hand-written |
| EHG_Engineer | docs/eva/cross-stage-data-contracts.md | 43 | `Stage 25` | hand-written |
| EHG_Engineer | docs/eva/cross-stage-data-contracts.md | 54 | `Stage 24` | hand-written |
| EHG_Engineer | docs/eva/cross-stage-data-contracts.md | 56 | `Stage 25` | hand-written |
| EHG_Engineer | docs/eva/cross-stage-data-contracts.md | 70 | `Stage 25` | hand-written |
| EHG_Engineer | docs/eva/cross-stage-data-contracts.md | 70 | `stage 26` | hand-written |
| EHG_Engineer | docs/eva/cross-stage-data-contracts.md | 72 | `stage 25` | hand-written |
| EHG_Engineer | docs/eva/e2e-stage-test-report.md | 30 | `Stage 23` | hand-written |
| EHG_Engineer | docs/eva/e2e-stage-test-report.md | 33 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 93 | `Stage 21` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 94 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 96 | `Stage 23` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 97 | `Stage 24` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 98 | `Stage 25` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 566 | `Stage 21` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 573 | `stage-21` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 585 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 592 | `stage-22` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 607 | `Stage 21` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 608 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 616 | `Stage 23` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 621 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 623 | `stage-23` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 637 | `Stage 24` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 644 | `stage-24` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 672 | `Stage 25` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 677 | `Stage 24` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 678 | `Stage 24` | hand-written |
| EHG_Engineer | docs/eva/stage-reference.md | 679 | `stage-25` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 21 | `Stage 21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 21 | `stage-21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 22 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 22 | `stage-22` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 28 | `Stage 21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 28 | `stage-21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 29 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 29 | `stage-22` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 152 | `Stage 21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 176 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 179 | `Stage 21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 223 | `Stage 21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 227 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 249 | `Stage 21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 250 | `stage-21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 255 | `Stage 22` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 256 | `stage-22` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 303 | `stage-21` | hand-written |
| EHG_Engineer | docs/eva/v1-build-scope-definition.md | 304 | `stage-22` | hand-written |
| EHG_Engineer | docs/findings/eva-vision-vs-reality-gaps.md | 27 | `Stage 25` | hand-written |
| EHG_Engineer | docs/findings/eva-vision-vs-reality-gaps.md | 28 | `Stage 25` | hand-written |
| EHG_Engineer | docs/findings/eva-vision-vs-reality-gaps.md | 40 | `Stage 25` | hand-written |
| EHG_Engineer | docs/findings/eva-vision-vs-reality-gaps.md | 64 | `Stage 25` | hand-written |
| EHG_Engineer | docs/governance/chairman-decision-surfaces.md | 107 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/61_venture_prd_generation.md | 290 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/testing/eva-stage-regression-guide.md | 55 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/testing/eva-stage-regression-guide.md | 151 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/testing/eva-stage-regression-guide.md | 257 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/testing/eva-stage-regression-guide.md | 257 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/backlog.yaml | 35 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/backlog.yaml | 134 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/backlog.yaml | 354 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-003.md | 19 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-005.md | 42 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-005.md | 43 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-005.md | 44 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-005.md | 45 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-005.md | 46 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-005.md | 47 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-006.md | 23 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-007.md | 22 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-007.md | 23 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-007.md | 24 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-007.md | 28 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-008.md | 42 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-008.md | 43 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-008.md | 44 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-008.md | 45 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-008.md | 46 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-008.md | 47 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-009.md | 42 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-009.md | 43 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-009.md | 44 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-009.md | 45 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-009.md | 46 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-009.md | 47 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-011.md | 42 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-011.md | 43 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-011.md | 44 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-011.md | 45 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-011.md | 46 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-011.md | 47 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-012.md | 22 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-012.md | 23 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-012.md | 24 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-012.md | 25 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-012.md | 26 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-012.md | 27 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-014.md | 19 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-014.md | 42 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-014.md | 43 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-014.md | 44 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-014.md | 45 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-014.md | 46 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-014.md | 47 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-015.md | 42 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-015.md | 43 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-015.md | 44 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-015.md | 45 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-015.md | 46 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/backlog/issues/wf-015.md | 47 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/00-overview.md | 86 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/00-overview.md | 212 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/00-overview.md | 213 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/00-overview.md | 213 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/01-foundation-infrastructure.md | 473 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/01-foundation-infrastructure.md | 478 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/04-reality-gates.md | 213 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/04-reality-gates.md | 213 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/04-reality-gates.md | 213 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/04-reality-gates.md | 213 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/04-reality-gates.md | 213 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/04-reality-gates.md | 678 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 27 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 27 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 92 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 128 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 394 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 396 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 402 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 537 | `stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 639 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/08-constraint-drift-detection.md | 644 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/guides/running-a-venture.md | 22 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/guides/running-a-venture.md | 22 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/guides/running-a-venture.md | 80 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/guides/running-a-venture.md | 341 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/guides/running-a-venture.md | 343 | `stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/guides/running-a-venture.md | 458 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/README.md | 40 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/chairman-decisions.md | 343 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/chairman-decisions.md | 349 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/filter-triggers.md | 319 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/filter-triggers.md | 507 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 17 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 17 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 21 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 21 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 61 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 62 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 159 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 161 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 170 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/gate-thresholds.md | 239 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md | 340 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md | 344 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md | 375 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md | 394 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md | 395 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md | 396 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md | 404 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md | 411 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/kill-gates.md | 412 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 324 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 363 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 369 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 376 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 383 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 390 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 393 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 393 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 394 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 394 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 400 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 405 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 406 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/promotion-gates.md | 409 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 23 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 23 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 24 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 24 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 25 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 25 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 58 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 61 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 62 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 255 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 261 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 269 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 277 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 285 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 293 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 301 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/reference/sd-requirements.md | 307 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-01-the-truth.md | 320 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-01-the-truth.md | 505 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-03-the-identity.md | 415 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-03-the-identity.md | 416 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-04-the-blueprint.md | 210 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-04-the-blueprint.md | 311 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-04-the-blueprint.md | 485 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 54 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 54 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 63 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 63 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 95 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 122 | `STAGE 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 122 | `STAGE 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 136 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 137 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 148 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 149 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 177 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 232 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 407 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 419 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 489 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 499 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 513 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 517 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 555 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 564 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 579 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 583 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 617 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 618 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 638 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 641 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 671 | `stage21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 677 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 683 | `stage21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 689 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 695 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 696 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 725 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 725 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 726 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-05-the-build-loop.md | 726 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 15 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 15 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 26 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 26 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 36 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 36 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 69 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 69 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 69 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 78 | `STAGE 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 89 | `STAGE 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 89 | `STAGE 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 106 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 107 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 108 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 126 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 130 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 216 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 217 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 231 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 235 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 334 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 339 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 345 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 355 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 359 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 405 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 411 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 428 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 472 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 486 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 487 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 488 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 513 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 536 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 536 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 537 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 537 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 538 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/phase-06-launch-and-learn.md | 538 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 53 | `Stage23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 53 | `Stage24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 57 | `Stage25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 61 | `Stage21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 61 | `Stage22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 104 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 105 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 106 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 107 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 108 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 118 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 122 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 122 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 123 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/cli-venture-lifecycle/stages/README.md | 123 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/overview.md | 45 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 35 | `stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 35 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 36 | `stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 36 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 37 | `stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 37 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 38 | `stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 38 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 39 | `stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 39 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 43 | `stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/README.md | 43 | `stage-26` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/stage-08.md | 85 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/stage-10.md | 176 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/stage-21.md | 9 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/stage-22.md | 9 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/stage-23.md | 9 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/stage-24.md | 9 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/stage-25.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/critique/stage-26.md | 9 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/README.md | 80 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/README.md | 81 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/README.md | 87 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/README.md | 88 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/README.md | 89 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/README.md | 96 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-01/implementation-gaps.md | 357 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-01/implementation-gaps.md | 358 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-01/implementation-gaps.md | 359 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-01/implementation-gaps.md | 360 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-07/08_configurability-matrix.md | 160 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-07/10_gaps-backlog.md | 368 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-09/11_acceptance-checklist.md | 141 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-09/11_acceptance-checklist.md | 161 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-15/09_metrics-monitoring.md | 297 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-15/09_metrics-monitoring.md | 567 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-15/09_metrics-monitoring.md | 579 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-15/09_metrics-monitoring.md | 591 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-15/09_metrics-monitoring.md | 613 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-15/09_metrics-monitoring.md | 625 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-21/01_overview.md | 9 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-21/01_overview.md | 18 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-21/README.md | 7 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-21/README.md | 10 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-22/01_overview.md | 9 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-22/01_overview.md | 18 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-22/README.md | 7 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-22/README.md | 10 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-23/01_overview.md | 9 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-23/01_overview.md | 18 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-23/README.md | 7 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-23/README.md | 10 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-24/01_overview.md | 9 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-24/01_overview.md | 18 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-24/README.md | 7 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-24/README.md | 10 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/01_overview.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/01_overview.md | 47 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/01_overview.md | 77 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/01_overview.md | 89 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/01_overview.md | 92 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/01_overview.md | 97 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/01_overview.md | 115 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/01_overview.md | 116 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 29 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 37 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 39 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 41 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 46 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 47 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 56 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 57 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 57 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 62 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 62 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 68 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 70 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 79 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 82 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 90 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 96 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 96 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 99 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 101 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 104 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 104 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 109 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 109 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 114 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 114 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 118 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 129 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 130 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 131 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 134 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 141 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 142 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 147 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 148 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/02_stage-map.md | 156 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md | 123 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md | 125 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md | 125 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md | 132 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md | 138 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md | 144 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md | 195 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/03_canonical-definition.md | 296 | `stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 53 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 76 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 88 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 92 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 96 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 104 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 120 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 132 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 144 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 156 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 174 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 188 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 204 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 216 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 228 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 236 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 238 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 242 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 244 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 244 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 246 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 258 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 262 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 290 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 338 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 339 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 340 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 341 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 342 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/04_current-assessment.md | 343 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 42 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 42 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 61 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 72 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 90 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 136 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 161 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 179 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 221 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 301 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 301 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 304 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 304 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 308 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 328 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 385 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 385 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 460 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 488 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 490 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 490 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 491 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 546 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 556 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 559 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 559 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 571 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 617 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 646 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 646 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 646 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 650 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 659 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 660 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 666 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 681 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 707 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/05_professional-sop.md | 725 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/06_agent-orchestration.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/06_agent-orchestration.md | 25 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/06_agent-orchestration.md | 25 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/06_agent-orchestration.md | 50 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/06_agent-orchestration.md | 88 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/06_agent-orchestration.md | 304 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/06_agent-orchestration.md | 369 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/06_agent-orchestration.md | 423 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/06_agent-orchestration.md | 490 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 23 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 23 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 27 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 27 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 28 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 28 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 28 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 28 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 29 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 29 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 29 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 29 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 30 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 30 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 30 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 30 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 31 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 31 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 32 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 32 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 54 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 58 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 83 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 84 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 119 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 120 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 128 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 129 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 133 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 166 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 167 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 206 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 212 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 212 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 213 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 216 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 217 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 221 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 221 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 223 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 238 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 239 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 240 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 241 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 245 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 246 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 248 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 249 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 253 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 281 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 283 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 283 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 287 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 301 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 301 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 305 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 307 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 309 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 309 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 313 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 315 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 317 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 327 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 329 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 329 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 331 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 345 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 345 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 377 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 377 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 388 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 388 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 399 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 410 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 437 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/07_recursion-blueprint.md | 445 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/README.md | 7 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/dossiers/stage-25/README.md | 10 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/generation-summary.md | 103 | `stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/phase7-orbit-verification.md | 26 | `Stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/phase7-orbit-verification.md | 95 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/sop-index.md | 50 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/sop-index.md | 51 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/sop-index.md | 52 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/sop-index.md | 53 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/sop-index.md | 54 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/sop-index.md | 55 | `Stage 26` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/README.md | 101 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/README.md | 102 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/README.md | 104 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/README.md | 114 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/README.md | 115 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/README.md | 116 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/README.md | 118 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/README.md | 164 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-20-security-and-performance.md | 40 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-20-security-and-performance.md | 132 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-20-security-and-performance.md | 132 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 114 | `Stage21Viewer.tsx` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 9 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 11 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 11 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 20 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 40 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 113 | `Stage21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 131 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 134 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-21-qa-and-uat.md | 134 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 112 | `Stage22Viewer.tsx` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 9 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 11 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 11 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 20 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 39 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 40 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 111 | `Stage22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 128 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 130 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 130 | `stage-21` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 131 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-22-deployment-and-infrastructure.md | 131 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 112 | `Stage23Viewer.tsx` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 9 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 11 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 11 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 20 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 39 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 40 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 111 | `Stage23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 127 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 129 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 129 | `stage-22` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 130 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-23-production-launch.md | 130 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 111 | `Stage24Viewer.tsx` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 9 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 11 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 11 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 20 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 39 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 40 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 110 | `Stage24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 127 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 129 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 129 | `stage-23` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 130 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-24-analytics-and-feedback.md | 130 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 116 | `Stage25Viewer.tsx` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 11 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 11 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 21 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 40 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 115 | `Stage25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 132 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 134 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stages/stage-25-optimization-and-scale.md | 134 | `stage-24` | hand-written |
| EHG_Engineer | docs/guides/workflow/stage_reviews/stage-04/05_outcome_log.md | 97 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 28 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 28 | `stage-25` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 199 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 214 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 218 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 220 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 308 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 308 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 308 | `Stage 23` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 308 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 308 | `Stage 21` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 406 | `Stage 24` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 431 | `Stage 22` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 432 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-lifecycle-overview.md | 446 | `Stage 25` | hand-written |
| EHG_Engineer | docs/guides/workflow/venture-stage-governance.md | 237 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/5-10x-value-methodology-vision.md | 45 | `stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-architecture.md | 328 | `stage22` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-architecture.md | 328 | `stage25` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-vision.md | 27 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-vision.md | 27 | `stage-22` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-vision.md | 28 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-vision.md | 28 | `stage-25` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-vision.md | 180 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-vision.md | 187 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-vision.md | 337 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-vision.md | 411 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/chairman-web-ui-vision.md | 474 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 66 | `Stage22Renderer.tsx` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 67 | `Stage25Renderer.tsx` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 103 | `Stage22Renderer.tsx` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 104 | `Stage23MarketingRenderer.tsx` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 105 | `Stage24LaunchReadinessRenderer.tsx` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 106 | `Stage25LaunchExecutionRenderer.tsx` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 47 | `stage-23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 48 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 49 | `stage-25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 55 | `stage-21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 56 | `stage-23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 57 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 58 | `stage-25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 129 | `stage-23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 130 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 131 | `stage-25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 138 | `stage-21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 139 | `stage-23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 140 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 141 | `stage-25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 298 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 300 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 336 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 336 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 336 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 368 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 369 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 370 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 371 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-architecture.md | 386 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 19 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 39 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 77 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 80 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 81 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 82 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 104 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 105 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 124 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 141 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 150 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 156 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 187 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 273 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 273 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 273 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 302 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-pipeline-redesign-vision.md | 306 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 147 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 147 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 210 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 213 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 269 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 353 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 378 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 461 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 506 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 507 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 508 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 509 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 625 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 626 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 629 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 629 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 650 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 651 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 651 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 652 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 652 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 653 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 653 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 693 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 696 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 847 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 870 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 889 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 984 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 988 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1068 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1070 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1072 | `stage-21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1084 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1084 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1086 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1088 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1090 | `stage-22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1092 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1109 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1113 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1113 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1115 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1117 | `stage-23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1120 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1127 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1134 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1136 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1136 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1138 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1140 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1147 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1156 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1158 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1160 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1160 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1162 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1164 | `stage-25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1248 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1248 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1288 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1605 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1760 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1761 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1762 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1763 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1764 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1775 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 1778 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 2592 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 2598 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 2599 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 2600 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-platform-architecture.md | 2601 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-stage-pipeline-artifact-unification-vision.md | 190 | `stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 140 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 141 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 289 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 303 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 329 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 366 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 407 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 407 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 415 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 426 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 447 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 506 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 534 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 538 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 540 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 547 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 567 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 624 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 624 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 640 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 641 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 647 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 649 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 714 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 720 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 724 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 724 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 725 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 726 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 737 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 787 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 798 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 808 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 810 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 820 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 825 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 941 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 942 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 943 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/eva-venture-lifecycle-vision.md | 954 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/explore-opportunities-stage-zero-vision.md | 18 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/explore-opportunities-stage-zero-vision.md | 18 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/mental-models-integration-vision.md | 148 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-convert-stage-visual-001-plan.md | 5 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-convert-stage-visual-001-plan.md | 14 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-convert-stage-visual-001-plan.md | 18 | `stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-convert-stage-visual-001-plan.md | 22 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-convert-stage-visual-001-plan.md | 28 | `stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-convert-stage-visual-001-plan.md | 29 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-convert-stage-visual-001-plan.md | 35 | `stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-convert-stage-visual-001-plan.md | 36 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-post-build-lifecycle-001-plan.md | 14 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-post-build-lifecycle-001-plan.md | 19 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-post-build-lifecycle-001-plan.md | 27 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-post-build-lifecycle-001-plan.md | 28 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-feat-post-build-lifecycle-001-plan.md | 34 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-fix-fix-stage-deployment-001-plan.md | 5 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-fix-fix-stage-deployment-001-plan.md | 14 | `stage-21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-fix-fix-stage-deployment-001-plan.md | 14 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-fix-fix-stage-deployment-001-plan.md | 14 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-fix-fix-stage-deployment-001-plan.md | 17 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-fix-fix-stage-deployment-001-plan.md | 25 | `stage-21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-fix-fix-stage-skip-001-plan.md | 5 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-fix-fix-stage-skip-001-plan.md | 14 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-fix-fix-stage-skip-001-plan.md | 17 | `stage-21` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-infra-unblock-portfolio-wide-001-plan.md | 18 | `Stage-25` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-infra-unblock-portfolio-wide-001-plan.md | 18 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-infra-unblock-portfolio-wide-001-plan.md | 23 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-infra-unblock-portfolio-wide-001-plan.md | 32 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-infra-venture-stage-definition-001-plan.md | 17 | `stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-infra-venture-stage-definition-001-plan.md | 17 | `stage 22` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-infra-venture-stage-definition-001-plan.md | 20 | `stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/sd-leo-infra-venture-stage-definition-001-plan.md | 34 | `stage 23` | hand-written |
| EHG_Engineer | docs/plans/archived/situational-modeling-engine-architecture.md | 130 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/situational-modeling-engine-architecture.md | 327 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/situational-modeling-engine-vision.md | 67 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/situational-modeling-engine-vision.md | 105 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/situational-modeling-engine-vision.md | 177 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/venture-artifact-pipeline-wiring-vision.md | 32 | `stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/venture-detail-page-redesign-vision.md | 130 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/archived/venture-exit-readiness-architecture.md | 304 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/archived/venture-exit-readiness-architecture.md | 306 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 343 | `Stage22.tsx` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 344 | `Stage25.tsx` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 1611 | `Stage22.tsx` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 1612 | `Stage25.tsx` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 389 | `stage22` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 389 | `stage25` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 399 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 400 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 1175 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-architecture-v2.md | 1185 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-vision-v2.md | 162 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/chairman-web-ui-vision-v2.md | 174 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4399 | `Stage21QaUat.tsx` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4598 | `Stage22Deployment.tsx` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4815 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5056 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5267 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5284 | `Stage25Viewer.tsx` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 125 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 125 | `stage-21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 130 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 130 | `stage-22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 135 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 135 | `stage-23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 138 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 138 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 141 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 141 | `stage-25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 265 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 292 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4022 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4028 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4132 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4139 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4143 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4210 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4231 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4239 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4263 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4332 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4341 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4350 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4350 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4360 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4366 | `stage-21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4392 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4396 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4398 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4410 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4410 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4410 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4414 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4415 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4416 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4416 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4418 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4420 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4420 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4429 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4429 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4429 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4431 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4445 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4445 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4445 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4453 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4453 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4455 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4457 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4461 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4465 | `stage-21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4530 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4537 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4549 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4551 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4553 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4554 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4558 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4564 | `stage-22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4580 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4581 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4595 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4597 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4616 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4616 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4618 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4620 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4632 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4634 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4634 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4638 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4650 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4660 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4660 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4660 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4660 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4662 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4662 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4662 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4662 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4662 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4664 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4668 | `stage-22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4750 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4751 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4763 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4769 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4771 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4772 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4773 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4774 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4778 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4782 | `stage-23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4784 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4784 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4806 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4817 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4857 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4857 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4859 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4861 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4861 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4861 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4861 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4863 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4877 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4883 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4891 | `stage-23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4919 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4954 | `stage22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4958 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4959 | `stage22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4960 | `stage22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4961 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4963 | `stage22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4964 | `stage22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4967 | `stage22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4968 | `stage22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4997 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 4999 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5010 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5010 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5012 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5012 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5013 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5015 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5015 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5019 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5023 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5025 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5047 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5049 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5054 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5058 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5095 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5095 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5095 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5097 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5097 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5097 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5103 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5103 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5107 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5113 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5117 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5121 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5127 | `stage-24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5147 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5191 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5201 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5202 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5205 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5207 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5214 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5214 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5216 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5216 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5217 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5218 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5219 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5223 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5227 | `stage-25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5229 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5262 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5269 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5306 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5308 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5310 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5310 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5316 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5324 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5340 | `stage-25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5442 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5455 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5457 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5477 | `Stage 23` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5477 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/cli-vs-gui-stage-analysis.md | 5477 | `Stage 25` | hand-written |
| EHG_Engineer | docs/plans/vision-architecture-next-steps.md | 311 | `Stage 21` | hand-written |
| EHG_Engineer | docs/plans/vision-architecture-next-steps.md | 318 | `Stage 22` | hand-written |
| EHG_Engineer | docs/plans/vision-architecture-next-steps.md | 318 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/vision-architecture-next-steps.md | 318 | `Stage 24` | hand-written |
| EHG_Engineer | docs/plans/vision-architecture-next-steps.md | 319 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/brainstorm-metadata-convention.md | 28 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | docs/reference/brainstorm-metadata-convention.md | 73 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | docs/reference/brainstorm-metadata-convention.md | 72 | `stage_number": 22` | hand-written |
| EHG_Engineer | docs/reference/brainstorm-metadata-convention.md | 97 | `stage_number": 22` | hand-written |
| EHG_Engineer | docs/reference/brainstorm-metadata-convention.md | 98 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/brainstorm-metadata-convention.md | 99 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/launch-mode-policy.md | 44 | `stage-24` | hand-written |
| EHG_Engineer | docs/reference/launch-mode-policy.md | 61 | `stage-24` | hand-written |
| EHG_Engineer | docs/reference/marketlens-owned-audience-loop.md | 32 | `Stage-22` | hand-written |
| EHG_Engineer | docs/reference/prompts/triangulation-scaffolding-remediation-review.md | 151 | `Stage 21` | hand-written |
| EHG_Engineer | docs/reference/research/stages/21_brief.md | 9 | `Stage 21` | hand-written |
| EHG_Engineer | docs/reference/research/stages/22_brief.md | 9 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/research/stages/23_brief.md | 9 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/research/stages/24_brief.md | 9 | `Stage 24` | hand-written |
| EHG_Engineer | docs/reference/research/stages/25_brief.md | 9 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/research/stages/26_brief.md | 9 | `Stage 26` | hand-written |
| EHG_Engineer | docs/reference/schema/engineer/database-schema-overview.md | 792 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/schema/engineer/database-schema-overview.md | 1608 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/venture-stage-marketing-map.md | 72 | `stage 22` | hand-written |
| EHG_Engineer | docs/reference/venture-stage-marketing-map.md | 73 | `stage 21` | hand-written |
| EHG_Engineer | docs/reference/venture-stage-marketing-map.md | 74 | `stage 24` | hand-written |
| EHG_Engineer | docs/reference/venture-stage-marketing-map.md | 75 | `stage 25` | hand-written |
| EHG_Engineer | docs/reference/venture-stage-marketing-map.md | 75 | `stage 26` | hand-written |
| EHG_Engineer | docs/reference/venture-stage-marketing-map.md | 94 | `stage-21` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 312 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 367 | `Stage26` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 535 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 727 | `Stage 24` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1048 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1049 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1067 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1092 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1098 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1099 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1100 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1101 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1172 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1185 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1189 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v2-chairman-os.md | 1200 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v3-the-asset-factory.md | 180 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v3-the-asset-factory.md | 878 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v3.4-addendum.md | 137 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/00-vision-v3.4-addendum.md | 289 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-oath-v3.md | 158 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-ritual-specification.md | 288 | `Stage 21` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-ritual-specification.md | 289 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-ritual-specification.md | 290 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-ritual-specification.md | 291 | `Stage 24` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-ritual-specification.md | 292 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-sd-structure.md | 492 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-virtual-bunker-addendum.md | 48 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-virtual-bunker-addendum.md | 48 | `stage-23` | hand-written |
| EHG_Engineer | docs/reference/vision/genesis-virtual-bunker-addendum.md | 495 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 147 | `STAGE-21` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 148 | `STAGE-22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 149 | `STAGE-23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 150 | `STAGE-24` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 151 | `STAGE-25` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 893 | `STAGE-21` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 894 | `STAGE-22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 894 | `STAGE-23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 894 | `STAGE-24` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 895 | `STAGE-25` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2061 | `STAGE-21` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2065 | `STAGE-21` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2066 | `stage-21` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2067 | `Stage 21` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2069 | `Stage 21` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2073 | `Stage 21` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2117 | `STAGE-22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2121 | `STAGE-22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2122 | `stage-22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2123 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2125 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2129 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2132 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2171 | `STAGE-21` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2175 | `STAGE-23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2179 | `STAGE-23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2180 | `stage-23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2181 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2183 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2187 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2227 | `STAGE-22` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2231 | `STAGE-24` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2235 | `STAGE-24` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2236 | `stage-24` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2237 | `Stage 24` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2239 | `Stage 24` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2243 | `Stage 24` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2283 | `STAGE-23` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2287 | `STAGE-25` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2291 | `STAGE-25` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2292 | `stage-25` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2293 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2295 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2299 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2302 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/route-audit-sd-structure.md | 2340 | `STAGE-24` | hand-written |
| EHG_Engineer | docs/reference/vision/simulation-chamber-architecture.md | 623 | `Stage 22` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/01-database-schema.md | 1937 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/01-database-schema.md | 1999 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/01-database-schema.md | 2004 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/01-database-schema.md | 2041 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/04-eva-orchestration.md | 192 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/04-eva-orchestration.md | 2049 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/04-eva-orchestration.md | 2057 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/05-user-stories.md | 189 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 20 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 20 | `stage-25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 23 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 23 | `stage-25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 47 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 49 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 68 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 72 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 72 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 96 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 98 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 152 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 191 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 192 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 222 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 252 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/07-operational-handoff.md | 461 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/13-red-team-audit-prompt.md | 206 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/README.md | 59 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/README.md | 230 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/README.md | 241 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/README.md | 244 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/specs/README.md | 456 | `Stage 25` | hand-written |
| EHG_Engineer | docs/reference/vision/venture-engine-golden-nuggets-plan.md | 221 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/venture-engine-golden-nuggets-plan.md | 1013 | `Stage 23` | hand-written |
| EHG_Engineer | docs/reference/vision/venture-engine-golden-nuggets-plan.md | 1132 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 200 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 205 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 221 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 145 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 157 | `stage-21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 158 | `stage-22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 174 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 187 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 188 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 189 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 190 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 190 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 191 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 191 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 193 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 202 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 211 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 216 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 217 | `stage-24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 218 | `stage-25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 220 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 221 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 226 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 227 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 235 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 237 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 245 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 252 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 264 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/claude-opinion.md | 277 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/consensus.md | 19 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/consensus.md | 20 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/consensus.md | 21 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/consensus.md | 103 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/consensus.md | 103 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/consensus.md | 107 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/consensus.md | 132 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/consensus.md | 149 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/consensus.md | 149 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/gemini-opinion.md | 139 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/gemini-opinion.md | 142 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/gemini-opinion.md | 149 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/gemini-opinion.md | 150 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/gemini-opinion.md | 153 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/gemini-opinion.md | 154 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/gemini-opinion.md | 177 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/gemini-opinion.md | 177 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 49 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 62 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 42 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 45 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 55 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 58 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 59 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 145 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 161 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/ground-truth.md | 168 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 147 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 148 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 150 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 150 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 154 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 159 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 160 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 164 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 165 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 181 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/openai-opinion.md | 192 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 115 | `stage-21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 116 | `stage-22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 118 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 126 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 127 | `stage-24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 128 | `stage-25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 130 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 130 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 130 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 168 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 225 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 226 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 230 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 231 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 232 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 237 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 239 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 595 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 599 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-1-high-level/prompt.md | 600 | `stage-22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 146 | `Stage21QaUat.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 148 | `Stage21QaUat.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 177 | `Stage22Deployment.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 179 | `Stage22Deployment.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 106 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 106 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 146 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 150 | `stage-21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 177 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 181 | `stage-22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 212 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 212 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 214 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 223 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 223 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 238 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 247 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 248 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 260 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 261 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/claude-opinion.md | 295 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 24 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 40 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 40 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 40 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 52 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 53 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 67 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 85 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 101 | `stage-21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 102 | `stage-22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 115 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 166 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/consensus.md | 177 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/gemini-opinion.md | 139 | `Stage21BuildReview.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/gemini-opinion.md | 164 | `Stage22ReleaseReadiness.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/gemini-opinion.md | 118 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/gemini-opinion.md | 144 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/gemini-opinion.md | 161 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/gemini-opinion.md | 182 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/gemini-opinion.md | 183 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/gemini-opinion.md | 195 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 38 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 46 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 51 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 72 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 73 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 125 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 125 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 256 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 268 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/ground-truth.md | 306 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/openai-opinion.md | 111 | `Stage21QaUat.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/openai-opinion.md | 135 | `Stage22Deployment.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/openai-opinion.md | 111 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/openai-opinion.md | 135 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/openai-opinion.md | 171 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 75 | `Stage21QaUat.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 76 | `Stage22Deployment.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1183 | `Stage21QaUat.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1428 | `Stage22Deployment.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 75 | `stageNumber: 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 76 | `stageNumber: 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 28 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 29 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 65 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 66 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 87 | `stage-21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 88 | `stage-22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1182 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1184 | `stage-21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1189 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1193 | `stage-21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1427 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1429 | `stage-22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1434 | `Stage 22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-5-the-build/prompt.md | 1438 | `stage-22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 16 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 18 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 43 | `Stage23MarketingPreparation.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 48 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 50 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 75 | `Stage24LaunchReadiness.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 80 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 82 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 106 | `Stage25LaunchExecution.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 150 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 193 | `Stage23MarketingPreparation.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 194 | `Stage24LaunchReadiness.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 195 | `Stage25LaunchExecution.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 201 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 202 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 16 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 28 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 28 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 38 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 42 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 48 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 69 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 69 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 69 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 69 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 75 | `stage-24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 80 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 92 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 101 | `stage-25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 103 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 106 | `stage-25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 119 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 119 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 119 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 120 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 120 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 122 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 122 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 132 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 132 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 134 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 138 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 140 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 140 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 140 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 140 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 144 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 146 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 148 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 158 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 162 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 162 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 182 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 182 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 183 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/claude-opinion.md | 203 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 144 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 144 | `Stage23MarketingPreparation.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 145 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 145 | `Stage24LaunchReadiness.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 146 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 146 | `Stage25LaunchExecution.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 20 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 30 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 40 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 55 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 55 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 55 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 56 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 65 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 67 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 69 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 69 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 71 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 73 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 75 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 102 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 105 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 108 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 110 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 129 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 131 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 134 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 138 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 138 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 138 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 138 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 152 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 153 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 154 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 160 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 171 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 179 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 181 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/consensus.md | 181 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 17 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 40 | `Stage23MarketingPreparation.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 46 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 69 | `Stage24LaunchReadiness.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 75 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 97 | `Stage25LaunchExecution.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 16 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 35 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 45 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 53 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 74 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 109 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 109 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 110 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 116 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 116 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 117 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 122 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 123 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/gemini-opinion.md | 125 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 26 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 52 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 18 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 36 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 36 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 37 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 37 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 38 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 38 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 44 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 58 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 66 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 66 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 82 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 86 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 86 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 87 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 87 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 94 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 98 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 102 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 118 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 144 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 159 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 174 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 204 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 204 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 219 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/ground-truth.md | 229 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/openai-opinion.md | 14 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/openai-opinion.md | 38 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/openai-opinion.md | 62 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/openai-opinion.md | 98 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/openai-opinion.md | 99 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/openai-opinion.md | 100 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/openai-opinion.md | 105 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/openai-opinion.md | 106 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 63 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 64 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 65 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 97 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 304 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 591 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 63 | `stageNumber: 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 64 | `stageNumber: 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 65 | `stageNumber: 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 14 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 17 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 18 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 18 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 19 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 20 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 21 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 21 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 24 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 25 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 27 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 27 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 56 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 57 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 58 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 72 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 73 | `stage-24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 74 | `stage-25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 79 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 90 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 96 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 98 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 103 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 107 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 303 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 305 | `stage-24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 310 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 315 | `stage-24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 590 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 592 | `stage-25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 597 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 602 | `stage-25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 954 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 954 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 954 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 961 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 962 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 963 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 963 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 964 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-2-groups/group-6-the-launch/prompt.md | 964 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 23 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 24 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 25 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 53 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 73 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 79 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 141 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 141 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 155 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 156 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 201 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 260 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 270 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 270 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 279 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 280 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 280 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 319 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/claude-opinion.md | 341 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 393 | `Stage21QaUat.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 393 | `Stage21BuildReview.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 394 | `Stage22Deployment.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 394 | `Stage22ReleaseReadiness.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 395 | `Stage23ProductionLaunch.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 395 | `Stage23MarketingPreparation.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 396 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 396 | `Stage24LaunchReadiness.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 397 | `Stage25ScalePlanning.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 397 | `Stage25LaunchExecution.tsx` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 29 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 30 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 52 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 67 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 85 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 87 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 133 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 133 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 135 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 135 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 148 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 149 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 160 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 199 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 328 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 393 | `stage-21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 394 | `stage-22` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 395 | `stage-23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 396 | `stage-24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/consensus.md | 397 | `stage-25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/gemini-opinion.md | 22 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/gemini-opinion.md | 35 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/gemini-opinion.md | 55 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/gemini-opinion.md | 55 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/gemini-opinion.md | 87 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/gemini-opinion.md | 96 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 25 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 26 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 50 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 62 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 101 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 101 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 140 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 140 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 207 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 239 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/ground-truth.md | 242 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/openai-opinion.md | 17 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/openai-opinion.md | 17 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/openai-opinion.md | 18 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/openai-opinion.md | 33 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/openai-opinion.md | 33 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/openai-opinion.md | 55 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/openai-opinion.md | 56 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 23 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 24 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 25 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 83 | `Stage 21` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 93 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 93 | `Stage 24` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 93 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 94 | `Stage 25` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 120 | `Stage 23` | hand-written |
| EHG_Engineer | docs/triangulations/venture-workflow-25-stage/phase-3-synthesis/prompt.md | 129 | `Stage 24` | hand-written |
| EHG_Engineer | docs/ventures/datadistill-calibration-readout-2026-06.md | 18 | `stage 24` | hand-written |
| EHG_Engineer | docs/ventures/datadistill-calibration-readout-2026-06.md | 35 | `stage 22` | hand-written |
| EHG_Engineer | docs/ventures/datadistill-calibration-readout-2026-06.md | 41 | `stage 23` | hand-written |
| EHG_Engineer | docs/wireframes/25-stage-view-wireframes.md | 265 | `Stage 22` | hand-written |
| EHG_Engineer | docs/wireframes/25-stage-view-wireframes.md | 271 | `Stage 23` | hand-written |
| EHG_Engineer | docs/wireframes/25-stage-view-wireframes.md | 382 | `Stage 24` | hand-written |
| EHG_Engineer | docs/wireframes/25-stage-view-wireframes.md | 388 | `Stage 25` | hand-written |
| EHG_Engineer | docs/wireframes/25-stage-view-wireframes.md | 655 | `Stage 21` | hand-written |
| EHG_Engineer | kb/ehg-review/00_unified_vision_2025.md | 83 | `Stage 22` | hand-written |
| EHG_Engineer | kb/ehg-review/04_governance_kpis_prompts.md | 308 | `Stage 24` | hand-written |
| EHG_Engineer | lib/agents/modules/venture-state-machine/stage-gates.js | 999 | `Stage 22` | hand-written |
| EHG_Engineer | lib/agents/modules/venture-state-machine/stage-gates.js | 1085 | `Stage 22` | hand-written |
| EHG_Engineer | lib/agents/venture-ceo-factory.js | 15 | `Stage 26` | hand-written |
| EHG_Engineer | lib/audits/stage-census/corpus-walker.mjs | 2 | `stage 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/corpus-walker.mjs | 17 | `stage-21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/db-sweep.mjs | 2 | `stage 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/db-sweep.mjs | 52 | `stage 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/negative-control.mjs | 11 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | lib/audits/stage-census/negative-control.mjs | 12 | `Stage21VisualAssets.tsx` | hand-written |
| EHG_Engineer | lib/audits/stage-census/negative-control.mjs | 11 | `stage_number: 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/negative-control.mjs | 12 | `stage_number: 22` | hand-written |
| EHG_Engineer | lib/audits/stage-census/negative-control.mjs | 2 | `stage 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/negative-control.mjs | 4 | `stage 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/regex.mjs | 15 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | lib/audits/stage-census/regex.mjs | 15 | `Stage21VisualAssets.tsx` | hand-written |
| EHG_Engineer | lib/audits/stage-census/regex.mjs | 18 | `stage_number = 22` | hand-written |
| EHG_Engineer | lib/audits/stage-census/regex.mjs | 18 | `stage-number: 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/regex.mjs | 2 | `stage 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/regex.mjs | 22 | `Stage 22` | hand-written |
| EHG_Engineer | lib/audits/stage-census/regex.mjs | 22 | `stage22` | hand-written |
| EHG_Engineer | lib/audits/stage-census/regex.mjs | 25 | `stage 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/report-writer.mjs | 8 | `stage-21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/report-writer.mjs | 23 | `Stage 21` | hand-written |
| EHG_Engineer | lib/audits/stage-census/report-writer.mjs | 33 | `stage 21` | hand-written |
| EHG_Engineer | lib/chairman/record-pending-decision.mjs | 283 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/adapters/real-data-adapter.js | 148 | `stage 21` | hand-written |
| EHG_Engineer | lib/eva/adapters/real-data-adapter.js | 164 | `stage 21` | hand-written |
| EHG_Engineer | lib/eva/adapters/real-data-adapter.js | 170 | `stage 21` | hand-written |
| EHG_Engineer | lib/eva/adapters/real-data-adapter.js | 193 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/artifact-persistence-service.js | 782 | `Stage-24` | hand-written |
| EHG_Engineer | lib/eva/artifact-types.js | 41 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/artifact-types.js | 110 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/artifact-types.js | 115 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/artifact-types.js | 139 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/artifact-types.js | 157 | `Stage 24` | hand-written |
| EHG_Engineer | lib/eva/artifact-types.js | 172 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/artifact-types.js | 176 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/artifact-types.js | 241 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/artifact-types.js | 338 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/bridge/integration-test-runner.js | 6 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/bridge/replit-reentry-adapter.js | 110 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/bridge/replit-reentry-adapter.js | 129 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/bridge/replit-reentry-adapter.js | 134 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/bridge/replit-reentry-adapter.js | 152 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/bridge/replit-reentry-adapter.js | 165 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/bridge/replit-reentry-adapter.js | 192 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/bridge/replit-reentry-adapter.js | 214 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/config/venture-default-capabilities.js | 71 | `Stage-25` | hand-written |
| EHG_Engineer | lib/eva/config/venture-default-capabilities.js | 74 | `Stage-25` | hand-written |
| EHG_Engineer | lib/eva/config/venture-default-capabilities.js | 76 | `Stage-25` | hand-written |
| EHG_Engineer | lib/eva/constraint-drift-detector.js | 286 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/contracts/stage-contracts.js | 374 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/contracts/stage-contracts.js | 452 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/contracts/stage-contracts.js | 618 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/contracts/stage-contracts.js | 622 | `stage 21` | hand-written |
| EHG_Engineer | lib/eva/demand-thesis-validator.js | 5 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/demand-thesis-validator.js | 7 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/eva-orchestrator.js | 766 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/eva-orchestrator.js | 768 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/eva-orchestrator.js | 1084 | `stage 23` | hand-written |
| EHG_Engineer | lib/eva/event-bus/handlers/sd-completed.js | 230 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/event-bus/handlers/sd-completed.js | 250 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/event-bus/handlers/sd-completed.js | 371 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/event-bus/handlers/sd-completed.js | 427 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/event-bus/handlers/sd-completed.js | 461 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/event-bus/handlers/sd-completed.js | 463 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/expand-spinoff-evaluator.js | 5 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/launch-workflow/index.js | 14 | `stage 23` | hand-written |
| EHG_Engineer | lib/eva/launch-workflow/index.js | 49 | `stage 22` | hand-written |
| EHG_Engineer | lib/eva/launch-workflow/index.js | 49 | `stage 21` | hand-written |
| EHG_Engineer | lib/eva/launch-workflow/index.js | 80 | `stage_21` | hand-written |
| EHG_Engineer | lib/eva/launch-workflow/index.js | 81 | `stage_24` | hand-written |
| EHG_Engineer | lib/eva/launch-workflow/index.js | 82 | `stage_21` | hand-written |
| EHG_Engineer | lib/eva/launch-workflow/index.js | 82 | `stage_24` | hand-written |
| EHG_Engineer | lib/eva/launch-workflow/index.js | 221 | `stage 22` | hand-written |
| EHG_Engineer | lib/eva/launch-workflow/index.js | 221 | `stage 21` | hand-written |
| EHG_Engineer | lib/eva/legal-doc-producer.js | 10 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/legal-doc-producer.js | 101 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/lifecycle/bind-criterion-checker.js | 28 | `stage_number: 24` | hand-written |
| EHG_Engineer | lib/eva/lifecycle/bind-criterion-checker.js | 29 | `stage_number: 24` | hand-written |
| EHG_Engineer | lib/eva/lifecycle/bind-criterion-checker.js | 30 | `stage_number: 24` | hand-written |
| EHG_Engineer | lib/eva/lifecycle/exit-gate-verifiers.js | 234 | `stage_number=26` | hand-written |
| EHG_Engineer | lib/eva/lifecycle/exit-gate-verifiers.js | 151 | `Stage 24` | hand-written |
| EHG_Engineer | lib/eva/lifecycle/exit-gate-verifiers.js | 224 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/lifecycle/exit-gate-verifiers.js | 235 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/lifecycle/exit-gate-verifiers.js | 235 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/lifecycle/exit-gate-verifiers.js | 743 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/lifecycle-sd-bridge.js | 1375 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/lifecycle-sd-bridge.js | 1385 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/orchestrator-trigger-types.js | 43 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/post-lifecycle-decisions.js | 6 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/post-lifecycle-decisions.js | 53 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/post-lifecycle-decisions.js | 58 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/post-lifecycle-decisions.js | 59 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/post-lifecycle-decisions.js | 74 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/post-lifecycle-decisions.js | 454 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/quality-findings/sandbox-driver.js | 14 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-engine.js | 764 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 557 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 1028 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 1036 | `stage21` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 1036 | `stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 1556 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 1564 | `stage21` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 1564 | `stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 2968 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 3025 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-execution-worker.js | 3025 | `Stage 24` | hand-written |
| EHG_Engineer | lib/eva/stage-governance.js | 91 | `stage 24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 47 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 47 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 50 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 51 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 52 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 52 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 52 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 52 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 53 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 56 | `stage 24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 57 | `stage-24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 57 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 58 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 59 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 60 | `stage-24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 61 | `stage 25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 62 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 64 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 65 | `stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 67 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 69 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 69 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 70 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 71 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 78 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 79 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 80 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 80 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 80 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 82 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 100 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 101 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 102 | `stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 103 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 137 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 138 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 139 | `stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 139 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 140 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 142 | `stage-24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 144 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/index.js | 146 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js | 6 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js | 8 | `stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js | 11 | `stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js | 13 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js | 14 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.js | 76 | `stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/README.md | 21 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/README.md | 32 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/README.md | 33 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/README.md | 34 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/README.md | 35 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/README.md | 36 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/README.md | 37 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js | 150 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js | 534 | `Stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js | 534 | `Stage26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-acquirability.js | 3 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-acquirability.js | 3 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-acquirability.js | 10 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-acquirability.js | 37 | `Stage21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 3 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 3 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 5 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 7 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 8 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 22 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 23 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 47 | `Stage21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 49 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 57 | `Stage21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 64 | `Stage21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-quality-assurance.js | 69 | `Stage21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js | 2 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-21-visual-assets.js | 21 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-acquirability.js | 3 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-acquirability.js | 4 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-acquirability.js | 5 | `Stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-acquirability.js | 8 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-acquirability.js | 12 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-acquirability.js | 21 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-acquirability.js | 28 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-acquirability.js | 36 | `Stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 3 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 4 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 4 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 5 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 7 | `Stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 7 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 8 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 9 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 13 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 20 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 24 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 25 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 48 | `Stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 50 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 50 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 58 | `Stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 62 | `Stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 67 | `Stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 82 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-build-review.js | 130 | `Stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js | 2 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js | 7 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js | 28 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js | 338 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-22-distribution-setup.js | 926 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js | 157 | `stage_number: 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js | 2 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js | 46 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js | 66 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js | 153 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js | 225 | `stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js | 226 | `stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-24-go-live.js | 2 | `Stage 24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-24-go-live.js | 8 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-24-go-live.js | 9 | `Stage 24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-24-go-live.js | 10 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-24-go-live.js | 13 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-24-go-live.js | 50 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-24-go-live.js | 57 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-24-go-live.js | 63 | `stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-24-go-live.js | 263 | `stage-24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 2 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 12 | `stage-24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 255 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 271 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 285 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 298 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 417 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 420 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 429 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 432 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 436 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-acquirability-review.js | 444 | `Stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-post-launch-review.js | 2 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-post-launch-review.js | 10 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-post-launch-review.js | 21 | `stage 24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-post-launch-review.js | 22 | `stage 24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-25-post-launch-review.js | 34 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 219 | `Stage26GrowthPlaybook.tsx` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 2 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 3 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 4 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 4 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 5 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 14 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 15 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 34 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 88 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 112 | `stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 117 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 241 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook.js | 242 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/index.js | 133 | `stage26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/index.js | 155 | `stage21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/index.js | 156 | `stage22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/index.js | 157 | `stage23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/index.js | 158 | `stage24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/index.js | 159 | `stage25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/index.js | 160 | `stage26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-01.js | 13 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-02.js | 166 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-19.js | 10 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-20.js | 79 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-20.js | 82 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-21.js | 2 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-21.js | 8 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-21.js | 12 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-21.js | 15 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-22.js | 2 | `Stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-22.js | 9 | `stage 22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-22.js | 11 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-22.js | 15 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-22.js | 18 | `stage-22` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-23.js | 2 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-23.js | 8 | `Stage 23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-23.js | 15 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-23.js | 19 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-23.js | 38 | `stage-23` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-24.js | 2 | `Stage 24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-24.js | 7 | `stage-24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-24.js | 10 | `stage-24` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-25.js | 2 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-25.js | 7 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-25.js | 10 | `stage-25` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-26.js | 2 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-26.js | 7 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-templates/stage-26.js | 10 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/stage-zero/profile-service.js | 511 | `stage 26` | hand-written |
| EHG_Engineer | lib/eva/stage-zero/stage-of-death-predictor.js | 139 | `stage 25` | hand-written |
| EHG_Engineer | lib/eva/stage-zero/thesis-contract.js | 322 | `stage 24` | hand-written |
| EHG_Engineer | lib/eva/template-extractor.js | 5 | `Stage 25` | hand-written |
| EHG_Engineer | lib/eva/template-extractor.js | 55 | `stage 26` | hand-written |
| EHG_Engineer | lib/eva/venture-intake-gates.js | 218 | `stage-26` | hand-written |
| EHG_Engineer | lib/eva/venture-monitor.js | 271 | `Stage-25` | hand-written |
| EHG_Engineer | lib/eva/venture-monitor.js | 478 | `Stage 26` | hand-written |
| EHG_Engineer | lib/eva/workers/stage-advance-worker.js | 68 | `stage 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/lifecycle-terminal-orchestrator.test.js | 46 | `stageNumber: 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/lifecycle-terminal-orchestrator.test.js | 56 | `stageNumber: 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/lifecycle-terminal-orchestrator.test.js | 66 | `stageNumber: 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/lifecycle-terminal-orchestrator.test.js | 76 | `stageNumber: 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/lifecycle-terminal-orchestrator.test.js | 89 | `stageNumber: 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/lifecycle-terminal-orchestrator.test.js | 108 | `stageNumber: 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/lifecycle-terminal-orchestrator.test.js | 120 | `stageNumber: 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/lifecycle-terminal-orchestrator.test.js | 138 | `stageNumber: 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/lifecycle-terminal-orchestrator.test.js | 154 | `stageNumber: 26` | hand-written |
| EHG_Engineer | lib/eva/__tests__/stage-21-skip-idempotent.test.js | 2 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/__tests__/stage-21-skip-idempotent.test.js | 24 | `stage-21` | hand-written |
| EHG_Engineer | lib/eva/__tests__/stage-21-visual-assets-preconditions.test.js | 2 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/__tests__/stage-21-visual-assets-preconditions.test.js | 11 | `Stage 21` | hand-written |
| EHG_Engineer | lib/eva/__tests__/stage-21-visual-assets-preconditions.test.js | 28 | `stage-21` | hand-written |
| EHG_Engineer | lib/marketing/organic-channel-provisioning.js | 6 | `Stage-22` | hand-written |
| EHG_Engineer | lib/marketing/organic-channel-provisioning.js | 16 | `Stage 22` | hand-written |
| EHG_Engineer | lib/proving-companion/stage-config.js | 235 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | lib/proving-companion/stage-config.js | 246 | `Stage21VisualAssets.tsx` | hand-written |
| EHG_Engineer | lib/proving-companion/stage-config.js | 257 | `Stage23LaunchReadiness.tsx` | hand-written |
| EHG_Engineer | lib/proving-companion/stage-config.js | 268 | `Stage24GoLive.tsx` | hand-written |
| EHG_Engineer | lib/proving-companion/stage-config.js | 279 | `Stage25PostLaunchReview.tsx` | hand-written |
| EHG_Engineer | lib/proving-companion/stage-config.js | 290 | `Stage26GrowthPlaybook.tsx` | hand-written |
| EHG_Engineer | lib/sub-agents/analytics.js | 11 | `Stage 24` | hand-written |
| EHG_Engineer | lib/sub-agents/launch.js | 11 | `Stage 23` | hand-written |
| EHG_Engineer | lib/venture-provisioning/exec-boundary-readiness.js | 14 | `Stage-22` | hand-written |
| EHG_Engineer | lib/venture-provisioning/exec-boundary-readiness.js | 49 | `stage 23` | hand-written |
| EHG_Engineer | scripts/audits/stage-21-26-census.mjs | 3 | `Stage 21` | hand-written |
| EHG_Engineer | scripts/audits/stage-21-26-census.mjs | 7 | `stage 21` | hand-written |
| EHG_Engineer | scripts/audits/stage-21-26-census.mjs | 11 | `stage-21` | hand-written |
| EHG_Engineer | scripts/audits/stage-21-26-census.mjs | 34 | `stage-21` | hand-written |
| EHG_Engineer | scripts/canary/canary-core.mjs | 21 | `stage 23` | hand-written |
| EHG_Engineer | scripts/chairman-decisions.mjs | 145 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/chairman-product-review-packet.js | 4 | `stage-23` | hand-written |
| EHG_Engineer | scripts/chairman-seed-data.js | 167 | `Stage 22` | hand-written |
| EHG_Engineer | scripts/eva/validators/gate-type-claim-validator.mjs | 8 | `stage_number: 22` | hand-written |
| EHG_Engineer | scripts/eva-decisions.js | 312 | `stage-22` | hand-written |
| EHG_Engineer | scripts/generate-stage-config.cjs | 118 | `stage 21` | hand-written |
| EHG_Engineer | scripts/harness/s20-run.mjs | 35 | `stage 26` | hand-written |
| EHG_Engineer | scripts/harness/s20-run.mjs | 67 | `Stage-21` | hand-written |
| EHG_Engineer | scripts/lib/stage-worker-watch.test.js | 25 | `stage-21` | hand-written |
| EHG_Engineer | scripts/lib/stage-worker-watch.test.js | 61 | `stage-21` | hand-written |
| EHG_Engineer | scripts/lint/venture-artifacts-write-lint.mjs | 54 | `stage24` | hand-written |
| EHG_Engineer | scripts/lint-repo-resolution-drift.mjs | 63 | `stage23` | hand-written |
| EHG_Engineer | scripts/modules/handoff/executors/plan-to-lead/gates/cross-repo-stage-config-drift.test.js | 111 | `stage_number = 21` | hand-written |
| EHG_Engineer | scripts/modules/handoff/executors/plan-to-lead/gates/cross-repo-stage-config-drift.test.js | 145 | `stage_number = 22` | hand-written |
| EHG_Engineer | scripts/modules/implementation-fidelity/sections/backend-leaf-detection.js | 96 | `Stage24GoLive.tsx` | hand-written |
| EHG_Engineer | scripts/modules/implementation-fidelity/sections/backend-leaf-detection.js | 98 | `STAGE24` | hand-written |
| EHG_Engineer | scripts/modules/implementation-fidelity/sections/backend-leaf-detection.js | 98 | `STAGE24` | hand-written |
| EHG_Engineer | scripts/modules/implementation-fidelity/sections/design-fidelity.js | 211 | `Stage24GoLive.tsx` | hand-written |
| EHG_Engineer | scripts/modules/implementation-fidelity/sections/design-fidelity.js | 212 | `STAGE24` | hand-written |
| EHG_Engineer | scripts/modules/implementation-fidelity/sections/design-fidelity.js | 212 | `STAGE24` | hand-written |
| EHG_Engineer | scripts/modules/sd-creation/genesis-v31/sd-definitions.js | 124 | `Stage 22` | hand-written |
| EHG_Engineer | scripts/modules/sd-type-classifier.js | 163 | `Stage 21` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/index.js | 8 | `stage-21` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/index.js | 9 | `stage-22` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/index.js | 10 | `stage-23` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/insert-stories.js | 9 | `stage-21` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/insert-stories.js | 10 | `stage-22` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/insert-stories.js | 11 | `stage-23` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/insert-stories.js | 37 | `Stage 24` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/insert-stories.js | 108 | `Stage 21` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/insert-stories.js | 117 | `Stage 24` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/insert-stories.js | 117 | `Stage 25` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/insert-stories.js | 137 | `Stage 24` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-21-stories.js | 85 | `stage_number: 21` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-21-stories.js | 2 | `Stage 21` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-21-stories.js | 5 | `stage-21` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-22-stories.js | 83 | `stage_number: 22` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-22-stories.js | 2 | `Stage 22` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-22-stories.js | 5 | `stage-22` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-22-stories.js | 165 | `Stage 21` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-23-stories.js | 89 | `stage_number: 23` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-23-stories.js | 2 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-23-stories.js | 5 | `stage-23` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-23-stories.js | 31 | `Stage 24` | hand-written |
| EHG_Engineer | scripts/modules/user-stories-d6/stage-23-stories.js | 280 | `Stage 21` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 7 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 29 | `stage-22` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 29 | `stage-25` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 69 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 73 | `Stage 22` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 73 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 76 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 81 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 81 | `Stage 22` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 89 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 98 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 98 | `Stage 24` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 107 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/one-time/fix-eva-remediation-quality.cjs | 112 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/workflow-docs-generator/backlog.js | 74 | `Stage 23` | hand-written |
| EHG_Engineer | scripts/workflow-docs-generator/backlog.js | 131 | `stage-22` | hand-written |
| EHG_Engineer | scripts/workflow-docs-generator/backlog.js | 228 | `Stage 26` | hand-written |
| EHG_Engineer | scripts/workflow-docs-generator/critiques.js | 63 | `Stage 23` | hand-written |
| EHG_Engineer | server/index.js | 66 | `stage24` | hand-written |
| EHG_Engineer | server/index.js | 268 | `Stage 24` | hand-written |
| EHG_Engineer | server/index.js | 269 | `stage24` | hand-written |
| EHG_Engineer | server/routes/stage19.js | 262 | `Stage-21` | hand-written |
| EHG_Engineer | server/routes/stage24.js | 68 | `stage_number: 24` | hand-written |
| EHG_Engineer | server/routes/stage24.js | 2 | `Stage 24` | hand-written |
| EHG_Engineer | server/routes/stage24.js | 4 | `stage24` | hand-written |
| EHG_Engineer | server/routes/stage24.js | 11 | `stage24` | hand-written |
| EHG_Engineer | server/routes/stage24.js | 21 | `stage24` | hand-written |
| EHG_Engineer | server/routes/stage24.js | 77 | `stage24` | hand-written |
| EHG_Engineer | supabase/migrations/20260215_chairman_decision_taxonomy_enforcement.sql | 14 | `Stage 21` | hand-written |
| EHG_Engineer | supabase/migrations/20260215_chairman_decision_taxonomy_enforcement.sql | 15 | `Stage 22` | hand-written |
| EHG_Engineer | supabase/migrations/20260215_chairman_decision_taxonomy_enforcement.sql | 16 | `Stage 23` | hand-written |
| EHG_Engineer | supabase/migrations/20260215_chairman_decision_taxonomy_enforcement.sql | 17 | `Stage 25` | hand-written |
| EHG_Engineer | supabase/migrations/20260329_extend_lifecycle_to_26_stages.sql | 10 | `Stage 26` | hand-written |
| EHG_Engineer | supabase/migrations/20260329_extend_lifecycle_to_26_stages.sql | 17 | `stage 26` | hand-written |
| EHG_Engineer | supabase/migrations/20260329_extend_lifecycle_to_26_stages.sql | 39 | `stage 26` | hand-written |
| EHG_Engineer | supabase/migrations/20260329_extend_lifecycle_to_26_stages.sql | 49 | `stage 26` | hand-written |
| EHG_Engineer | supabase/migrations/20260329_extend_lifecycle_to_26_stages.sql | 101 | `stage 26` | hand-written |
| EHG_Engineer | tests/database/stage-census-negative-control.db.test.js | 23 | `stage 21` | hand-written |
| EHG_Engineer | tests/database/stage-census-regex-hazard.db.test.js | 27 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | tests/database/stage-census-regex-hazard.db.test.js | 27 | `Stage21VisualAssets.tsx` | hand-written |
| EHG_Engineer | tests/ddl/thesis-kill-instrument-ddl.db.test.js | 119 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/ddl/ventures-canonical-writer-choke-ddl.db.test.js | 277 | `stage24` | hand-written |
| EHG_Engineer | tests/ddl/ventures-canonical-writer-choke-ddl.db.test.js | 296 | `stage24` | hand-written |
| EHG_Engineer | tests/e2e/edge-cases/empty-state-tests.spec.ts | 308 | `stage 25` | hand-written |
| EHG_Engineer | tests/e2e/edge-cases/empty-state-tests.spec.ts | 448 | `stage 26` | hand-written |
| EHG_Engineer | tests/e2e/venture-launch/protocol-validation.spec.ts | 289 | `Stage 23` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/full-journey.spec.ts | 89 | `Stage 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/full-journey.spec.ts | 219 | `Stage 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/full-journey.spec.ts | 239 | `Stage 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 12 | `Stage 21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 13 | `stage-22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 16 | `Stage 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 17 | `stage-21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 80 | `Stage 21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 507 | `STAGE 21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 508 | `stage-22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 511 | `Stage 21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 513 | `stage-22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 547 | `stage-22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 552 | `stage-22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 560 | `stage-22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 587 | `STAGE 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 588 | `stage-21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 589 | `stage 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 591 | `Stage 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 593 | `stage-21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 593 | `stage 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase5-the-build-loop.spec.ts | 616 | `stage-21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 8 | `Stage 21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 9 | `Stage 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 10 | `Stage 23` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 11 | `Stage 24` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 12 | `Stage 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 86 | `STAGE 21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 88 | `Stage 21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 90 | `Stage 21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 97 | `Stage 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 97 | `Stage 23` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 101 | `Stage 21` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 219 | `STAGE 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 221 | `Stage 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 223 | `Stage 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 229 | `Stage 22` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 302 | `STAGE 23` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 304 | `Stage 23` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 309 | `Stage 23` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 387 | `STAGE 24` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 389 | `Stage 24` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 390 | `Stage 24` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 483 | `STAGE 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 485 | `Stage 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 486 | `Stage 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 545 | `Stage 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 547 | `Stage 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 548 | `Stage 25` | hand-written |
| EHG_Engineer | tests/e2e/venture-lifecycle/phase6-launch-and-learn.spec.ts | 582 | `Stage 25` | hand-written |
| EHG_Engineer | tests/eva/brainstorm-pre-check.test.js | 10 | `stageNumber: 22` | hand-written |
| EHG_Engineer | tests/eva/brainstorm-pre-check.test.js | 15 | `stageNumber: 26` | hand-written |
| EHG_Engineer | tests/eva/brainstorm-pre-check.test.js | 47 | `stage_number: 22` | hand-written |
| EHG_Engineer | tests/eva/brainstorm-pre-check.test.js | 48 | `stage_number: 26` | hand-written |
| EHG_Engineer | tests/eva/launch-workflow.test.js | 95 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/eva/launch-workflow.test.js | 96 | `stage_number: 24` | hand-written |
| EHG_Engineer | tests/eva/launch-workflow.test.js | 136 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/eva/launch-workflow.test.js | 137 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/eva/launch-workflow.test.js | 179 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/eva/validators/gate-type-claim-validator.test.js | 10 | `stageNumber: 22` | hand-written |
| EHG_Engineer | tests/eva/validators/gate-type-claim-validator.test.js | 15 | `stageNumber: 23` | hand-written |
| EHG_Engineer | tests/eva/validators/gate-type-claim-validator.test.js | 21 | `stageNumber: 26` | hand-written |
| EHG_Engineer | tests/eva/validators/gate-type-claim-validator.test.js | 44 | `stageNumber: 22` | hand-written |
| EHG_Engineer | tests/eva/validators/gate-type-claim-validator.test.js | 45 | `stageNumber: 23` | hand-written |
| EHG_Engineer | tests/eva/validators/gate-type-claim-validator.test.js | 46 | `stageNumber: 26` | hand-written |
| EHG_Engineer | tests/eva/validators/gate-type-claim-validator.test.js | 51 | `stage_number: 22` | hand-written |
| EHG_Engineer | tests/eva/validators/gate-type-claim-validator.test.js | 62 | `stage_number: 26` | hand-written |
| EHG_Engineer | tests/eva/validators/gate-type-claim-validator.test.js | 71 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 723 | `Stage 21` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 733 | `Stage 22` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 761 | `Stage 23` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 787 | `Stage 24` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 824 | `Stage 25` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 931 | `stage 25` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 934 | `stage 24` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 937 | `stage 23` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 940 | `stage 22` | hand-written |
| EHG_Engineer | tests/helpers/llm-mock-factory.js | 943 | `stage 21` | hand-written |
| EHG_Engineer | tests/integration/chairman-decision-api.test.js | 244 | `stageNumber: 22` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1132 | `Stage 21` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1135 | `stage-21` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1144 | `Stage 21` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1149 | `Stage 22` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1152 | `stage-22` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1161 | `Stage 22` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1161 | `Stage 21` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1166 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1170 | `stage-23` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1187 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1191 | `stage-24` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1191 | `stage-24` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1192 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1192 | `stage-23` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1193 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1195 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1206 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1220 | `Stage 25` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1223 | `stage 25` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1224 | `stage-25` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1227 | `stage24` | hand-written |
| EHG_Engineer | tests/integration/eva/analysis-steps.test.js | 1249 | `stage24` | hand-written |
| EHG_Engineer | tests/integration/eva/can-auto-advance-equivalence.test.js | 46 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/integration/eva/can-auto-advance-equivalence.test.js | 47 | `stage_number: 22` | hand-written |
| EHG_Engineer | tests/integration/eva/can-auto-advance-equivalence.test.js | 48 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/integration/eva/can-auto-advance-equivalence.test.js | 49 | `stage_number: 24` | hand-written |
| EHG_Engineer | tests/integration/eva/can-auto-advance-equivalence.test.js | 50 | `stage_number: 25` | hand-written |
| EHG_Engineer | tests/integration/eva/can-auto-advance-equivalence.test.js | 51 | `stage_number: 26` | hand-written |
| EHG_Engineer | tests/integration/eva/chairman-product-review-gate-realdb.test.js | 3 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/chairman-product-review-gate-realdb.test.js | 28 | `stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/chairman-product-review-gate-realdb.test.js | 207 | `stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 20 | `Stage 22` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 21 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 22 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 23 | `Stage 25` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 24 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 661 | `Stage 22` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 662 | `Stage 22` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 666 | `Stage 22` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 684 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 685 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 689 | `stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 709 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 710 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 755 | `Stage 25` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 756 | `Stage 25` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 775 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/phase-a-e2e.integration.test.js | 777 | `stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 77 | `Stage 21` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 79 | `Stage 22` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 81 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 83 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 85 | `Stage 25` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 499 | `Stage 21` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 510 | `Stage 22` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 527 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 527 | `Stage 22` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 538 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 538 | `Stage 23` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 539 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 541 | `stage23` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 544 | `stage-24` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 557 | `Stage 25` | hand-written |
| EHG_Engineer | tests/integration/eva/stage-chain.test.js | 557 | `Stage 24` | hand-written |
| EHG_Engineer | tests/integration/eva-run-cli.test.js | 87 | `stage 25` | hand-written |
| EHG_Engineer | tests/integration/eva-run-cli.test.js | 97 | `stage 26` | hand-written |
| EHG_Engineer | tests/integration/kill-venture-rpc.test.js | 96 | `stage23` | hand-written |
| EHG_Engineer | tests/integration/kill-venture-rpc.test.js | 237 | `stage23` | hand-written |
| EHG_Engineer | tests/integration/kill-venture-rpc.test.js | 268 | `stage 23` | hand-written |
| EHG_Engineer | tests/integration/kill-venture-rpc.test.js | 296 | `stage 23` | hand-written |
| EHG_Engineer | tests/integration/legal-doc-producer-activation.test.js | 12 | `stage-23` | hand-written |
| EHG_Engineer | tests/integration/legal-doc-producer-activation.test.js | 16 | `Stage-23` | hand-written |
| EHG_Engineer | tests/integration/legal-doc-producer-activation.test.js | 24 | `stage-23` | hand-written |
| EHG_Engineer | tests/integration/legal-doc-producer-activation.test.js | 81 | `Stage-23` | hand-written |
| EHG_Engineer | tests/integration/legal-doc-producer-activation.test.js | 107 | `Stage-23` | hand-written |
| EHG_Engineer | tests/lib/eva/stage-governance.test.js | 35 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/lib/eva/stage-governance.test.js | 36 | `stage_number: 22` | hand-written |
| EHG_Engineer | tests/lib/eva/stage-governance.test.js | 37 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/lib/eva/stage-governance.test.js | 38 | `stage_number: 24` | hand-written |
| EHG_Engineer | tests/lib/eva/stage-governance.test.js | 39 | `stage_number: 25` | hand-written |
| EHG_Engineer | tests/lib/eva/stage-governance.test.js | 40 | `stage_number: 26` | hand-written |
| EHG_Engineer | tests/unit/chairman/decision-freshness.test.js | 20 | `Stage 21` | hand-written |
| EHG_Engineer | tests/unit/chairman-decision-layman.test.js | 84 | `Stage 22` | hand-written |
| EHG_Engineer | tests/unit/database/migrations/advance-venture-gate-type-ssot.db.test.js | 195 | `stage 23` | hand-written |
| EHG_Engineer | tests/unit/database/migrations/advance-venture-gate-type-ssot.db.test.js | 202 | `stage 24` | hand-written |
| EHG_Engineer | tests/unit/database/migrations/fix-build-deviation-record-case-mismatch.db.test.js | 34 | `Stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/adapters/real-data-adapter.test.js | 118 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/adapters/real-data-adapter.test.js | 133 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/adapters/real-data-adapter.test.js | 139 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-type-producer-parity.test.js | 54 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 8 | `stage-25` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 25 | `Stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 35 | `stage-25` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 60 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 61 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 62 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 64 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 68 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 69 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 70 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/artifact-types.test.js | 71 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/autonomy-reserved-gates.test.js | 113 | `stage_number: 22` | hand-written |
| EHG_Engineer | tests/unit/eva/bind-criterion-checker.test.js | 142 | `stage_number: 24` | hand-written |
| EHG_Engineer | tests/unit/eva/census-unbounded-retry.test.js | 33 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/census-unbounded-retry.test.js | 37 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/census-unbounded-retry.test.js | 41 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/census-unbounded-retry.test.js | 58 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-decision-watcher.test.js | 221 | `stageNumber: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-decision-watcher.test.js | 254 | `stageNumber: 22` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-decision-watcher.test.js | 315 | `stageNumber: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-decision-watcher.test.js | 344 | `stageNumber: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-decision-watcher.test.js | 516 | `stageNumber: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-decision-watcher.test.js | 854 | `stageNumber: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-decision-watcher.test.js | 878 | `stageNumber: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-decision-watcher.test.js | 884 | `stageNumber: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-decision-watcher.test.js | 687 | `Stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-product-review.test.js | 49 | `stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/chairman-product-review.test.js | 66 | `Stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/demand-thesis-validator.test.js | 52 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/describe-artifact-gap.test.js | 79 | `stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/describe-artifact-gap.test.js | 80 | `stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/describe-artifact-gap.test.js | 101 | `stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva/describe-artifact-gap.test.js | 115 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/downstream-operating-model-propagation.test.js | 49 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/downstream-operating-model-propagation.test.js | 56 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/downstream-operating-model-propagation.test.js | 63 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/emergency-gate-unblock.test.js | 95 | `Stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/eva-orchestrator.test.js | 256 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/eva-orchestrator.test.js | 272 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/exit/stage-24-acquirability-review.test.js | 2 | `Stage 24` | hand-written |
| EHG_Engineer | tests/unit/eva/exit/stage-24-acquirability-review.test.js | 4 | `stage-25` | hand-written |
| EHG_Engineer | tests/unit/eva/exit/stage-24-acquirability-review.test.js | 13 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/exit/stage-24-acquirability-review.test.js | 23 | `stage-25` | hand-written |
| EHG_Engineer | tests/unit/eva/exit/stage-24-acquirability-review.test.js | 245 | `stage-25` | hand-written |
| EHG_Engineer | tests/unit/eva/expand-spinoff-evaluator.test.js | 75 | `stage_number: 25` | hand-written |
| EHG_Engineer | tests/unit/eva/expand-spinoff-evaluator.test.js | 172 | `Stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva/expand-spinoff-evaluator.test.js | 180 | `Stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva/forward-gate.test.js | 214 | `stageNumber: 22` | hand-written |
| EHG_Engineer | tests/unit/eva/gate-bar-regime.test.js | 50 | `stage_number: 25` | hand-written |
| EHG_Engineer | tests/unit/eva/gate-bar-regime.test.js | 90 | `stage_number: 24` | hand-written |
| EHG_Engineer | tests/unit/eva/gate-retry-guard.test.js | 116 | `stageNumber: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/gate-retry-guard.test.js | 127 | `stageNumber: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/gate-retry-guard.test.js | 143 | `stageNumber: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/gate-retry-guard.test.js | 153 | `stageNumber: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/gate-retry-guard.test.js | 159 | `stageNumber: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/gate-retry-guard.test.js | 166 | `stageNumber: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/gate-retry-guard.test.js | 172 | `stageNumber: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/post-lifecycle-decisions.test.js | 68 | `Stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva/post-lifecycle-decisions.test.js | 85 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/quality-findings/finding-shape.test.js | 54 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/quality-findings/finding-shape.test.js | 89 | `stage_number: 22` | hand-written |
| EHG_Engineer | tests/unit/eva/s19-decomposition-coverage.test.js | 10 | `Stage 24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-02-registration.test.js | 10 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-24-go-live-launch-mode.test.js | 1 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-24-go-live-launch-mode.test.js | 3 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-artifact-precondition.test.js | 65 | `stage 22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 102 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 103 | `stage_number: 22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 104 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 105 | `stage_number: 24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 106 | `stage_number: 25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 107 | `stage_number: 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 222 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 229 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 237 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 253 | `stage_number: 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contract-connectivity.test.js | 264 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contracts.test.js | 38 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contracts.test.js | 117 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contracts.test.js | 117 | `stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contracts.test.js | 129 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contracts.test.js | 129 | `stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contracts.test.js | 137 | `stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contracts.test.js | 138 | `Stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contracts.test.js | 214 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-contracts.test.js | 226 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-engine-lifecycle-terminal.test.js | 51 | `stageNumber: 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker-high-consequence-mint.test.js | 6 | `stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker-product-review-gate.test.js | 3 | `Stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker-product-review-gate.test.js | 98 | `Stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker-product-review-gate.test.js | 110 | `Stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker-venture-parked-override-guard.test.js | 157 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker-venture-parked-override-guard.test.js | 222 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker.test.js | 149 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker.test.js | 150 | `stage_number: 24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker.test.js | 151 | `stage_number: 25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker.test.js | 260 | `stageNumber: 25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-execution-worker.test.js | 251 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-governance.test.js | 24 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-governance.test.js | 31 | `stage_number: 24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-governance.test.js | 32 | `stage_number: 25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-governance.test.js | 132 | `Stage 24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-policy-halt-guards.test.js | 166 | `stageNumber: 21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-policy-halt-guards.test.js | 9 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-policy-halt-guards.test.js | 76 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-policy-halt-guards.test.js | 157 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/prelaunch-growth-playbook.test.js | 126 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-21-quality-assurance.test.js | 10 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-21-quality-assurance.test.js | 12 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-21-visual-assets.test.js | 2 | `Stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-21-visual-assets.test.js | 13 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-21-visual-assets.test.js | 34 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-21-visual-assets.test.js | 114 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-21-visual-assets.test.js | 197 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-21-visual-assets.test.js | 335 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-22-build-review.test.js | 8 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-22-build-review.test.js | 10 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-22-distribution-setup.test.js | 2 | `Stage 22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-22-distribution-setup.test.js | 16 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-22-distribution-setup.test.js | 54 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-22-distribution-setup.test.js | 423 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-22-distribution-setup.test.js | 761 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-23-growth-categories.test.js | 11 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-23-growth-categories.test.js | 21 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-26-growth-playbook.test.js | 2 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-26-growth-playbook.test.js | 58 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-26-growth-playbook.test.js | 64 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-26-growth-playbook.test.js | 111 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-26-growth-playbook.test.js | 139 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-26-growth-playbook.test.js | 189 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-26-growth-playbook.test.js | 191 | `Stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 2 | `Stage 22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 4 | `Stage 22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 4 | `Stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 7 | `stage 22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 8 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 9 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 9 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 18 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 19 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 24 | `stage 22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 24 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 25 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/analysis-steps/stage-precondition-whole-stage-key-invariant.test.js | 25 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/index.test.js | 23 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/index.test.js | 76 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/index.test.js | 112 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/index.test.js | 112 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/index.test.js | 113 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/index.test.js | 114 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/index.test.js | 114 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21-creative-handoff.test.js | 7 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 2 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 2 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 6 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 7 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 8 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 10 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 10 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 11 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 12 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 13 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 17 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 27 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 28 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 29 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 34 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 38 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 42 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 46 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 47 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-21.test.js | 48 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22-spend-approval.test.js | 11 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 2 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 2 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 6 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 7 | `stage 22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 8 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 10 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 10 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 11 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 12 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 13 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 17 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 26 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 27 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 28 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 33 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 37 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 41 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 45 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 46 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-22.test.js | 47 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js | 4 | `Stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js | 5 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js | 22 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js | 29 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js | 159 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23-launch-readiness-fr1-4-6.test.js | 292 | `stage 23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 2 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 2 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 4 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 6 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 6 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 7 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 8 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 9 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 13 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 23 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 24 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 25 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 30 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 34 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 38 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 42 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-23.test.js | 43 | `stage23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24-routing.test.js | 9 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24-routing.test.js | 21 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24-routing.test.js | 29 | `Stage 24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24-routing.test.js | 113 | `Stage 24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24-routing.test.js | 114 | `Stage 24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24-routing.test.js | 209 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24-routing.test.js | 215 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24-routing.test.js | 217 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24-routing.test.js | 218 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 2 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 2 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 4 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 6 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 6 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 7 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 8 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 9 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 13 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 21 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 22 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 23 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 28 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 32 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 36 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 40 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-24.test.js | 41 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 2 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 2 | `stage-25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 4 | `stage-25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 6 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 6 | `stage-25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 7 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 8 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 9 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 13 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 22 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 23 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 24 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 29 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 33 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 37 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 41 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 42 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-25.test.js | 43 | `stage25` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 2 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 2 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 4 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 6 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 6 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 7 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 8 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 9 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 13 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 22 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 23 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 24 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 29 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 33 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 37 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 41 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 42 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-templates/stage-26.test.js | 43 | `stage26` | hand-written |
| EHG_Engineer | tests/unit/eva/stage-zero/posture-successor.test.js | 184 | `stage 26` | hand-written |
| EHG_Engineer | tests/unit/eva/template-extractor.test.js | 97 | `Stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva/template-extractor.test.js | 106 | `Stage 25` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 20 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 20 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 21 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 21 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 246 | `Stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 248 | `Stage 21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 250 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 254 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 264 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 275 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 284 | `Stage 22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 286 | `Stage 22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 288 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 292 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 301 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 313 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 340 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 342 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 344 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 346 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 361 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 396 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 404 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 412 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 448 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 449 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 460 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 461 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 475 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 476 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 489 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/eva-build-loop-templates.test.js | 490 | `stage22` | hand-written |
| EHG_Engineer | tests/unit/eva-decisions-verb-alignment.test.js | 87 | `stage-22` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 5 | `Stage24GoLive.tsx` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 15 | `Stage24GoLive.tsx` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 33 | `Stage24GoLive.tsx` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 55 | `Stage24GoLive.tsx` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 4 | `STAGE24` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 4 | `STAGE24` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 5 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 15 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 16 | `Stage-23` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 17 | `Stage-24` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 20 | `STAGE24` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 33 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/gate2-backend-serves-ui.test.js | 33 | `Stage24` | hand-written |
| EHG_Engineer | tests/unit/governance/stage-gate-predicate-paired-controls.test.js | 14 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/governance/stage-gate-predicate-paired-controls.test.js | 16 | `stage 24` | hand-written |
| EHG_Engineer | tests/unit/governance/stage-gate-predicate-paired-controls.test.js | 90 | `stage 24` | hand-written |
| EHG_Engineer | tests/unit/governance/stage-gate-predicate.test.js | 199 | `stage 24` | hand-written |
| EHG_Engineer | tests/unit/handoff/gates/db-content-parity-gate.test.js | 105 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/handoff/gates/db-content-parity-gate.test.js | 111 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/harness/prmerge-exact-match.test.js | 161 | `stage-25` | hand-written |
| EHG_Engineer | tests/unit/learning/class-escalation.test.js | 88 | `stage24` | hand-written |
| EHG_Engineer | tests/unit/monitor-venture-run-validate.test.js | 28 | `stage-23` | hand-written |
| EHG_Engineer | tests/unit/monitor-venture-run-validate.test.js | 42 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/monitor-venture-run-validate.test.js | 43 | `stage-26` | hand-written |
| EHG_Engineer | tests/unit/proving-companion/artifact-integrity-anyof.test.js | 2 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/proving-companion/artifact-integrity-anyof.test.js | 30 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/scope-inheritance/prd-validators.test.js | 130 | `stage21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-classify.test.js | 20 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-corpus-walker.test.js | 23 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-corpus-walker.test.js | 27 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-corpus-walker.test.js | 34 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-corpus-walker.test.js | 23 | `Stage 22` | hand-written |
| EHG_Engineer | tests/unit/stage-census-corpus-walker.test.js | 33 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-corpus-walker.test.js | 34 | `Stage22` | hand-written |
| EHG_Engineer | tests/unit/stage-census-corpus-walker.test.js | 44 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-corpus-walker.test.js | 45 | `stage 22` | hand-written |
| EHG_Engineer | tests/unit/stage-census-corpus-walker.test.js | 53 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-forbidden-escapes.test.js | 17 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 9 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 10 | `Stage21VisualAssets.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 11 | `Stage23SomethingElse.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 20 | `Stage21VisualAssets.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 28 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 9 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 10 | `stage_number: 22` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 11 | `stage_number: 23` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 20 | `stage_number: 22` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 23 | `stage_number=21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 28 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 30 | `stage_number=22` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 18 | `stage 21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-negative-control.test.js | 26 | `stage 22` | hand-written |
| EHG_Engineer | tests/unit/stage-census-report-writer.test.js | 11 | `Stage22DistributionSetup.tsx` | hand-written |
| EHG_Engineer | tests/unit/stage-census-report-writer.test.js | 11 | `stage_number: 21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-report-writer.test.js | 34 | `stage_number=21` | hand-written |
| EHG_Engineer | tests/unit/stage-census-report-writer.test.js | 18 | `stage-21` | hand-written |
| EHG_Engineer | tests/unit/stage-config/venture-stage-definition-consistency.db.test.js | 87 | `stage 23` | hand-written |
| EHG_Engineer | tests/unit/sub-agents/design-backend-only-diff.test.js | 57 | `stage-24` | hand-written |
| EHG_Engineer | tests/unit/venture-provisioning/exec-boundary-readiness.test.js | 475 | `stage 23` | hand-written |
| EHG_Engineer | tests/venture-gate-binding.test.js | 191 | `stage-21` | hand-written |
| EHG_Engineer | tests/venture-gate-binding.test.js | 194 | `stage-21` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/logic.ts | 2 | `STAGE24` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/logic.ts | 2 | `Stage-24` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/logic.ts | 19 | `Stage-23` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 8 | `Stage24GoLive.tsx` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 10 | `Stage23LaunchReadiness.tsx` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 2 | `Stage-24` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 3 | `STAGE24` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 5 | `stage24` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 6 | `Stage-23` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 9 | `Stage-23` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 12 | `Stage-23` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 47 | `Stage-23` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 90 | `Stage-23` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 105 | `Stage-23` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 116 | `Stage-23` | hand-written |
| ehg | app/api/stage24/[ventureId]/go-live/route.ts | 205 | `Stage-23` | hand-written |
| ehg | COMPREHENSIVE_TEST_FINDINGS.md | 37 | `Stage 21` | hand-written |
| ehg | docs/adr/ADR-001-vision-v2-stage-architecture.md | 40 | `Stage 23` | hand-written |
| ehg | docs/adr/ADR-001-vision-v2-stage-architecture.md | 45 | `Stage 22` | hand-written |
| ehg | docs/app/ventures/design/COMPONENT_GAPS.md | 72 | `Stage 21` | hand-written |
| ehg | docs/app/ventures/design/COPY_DECK.md | 89 | `Stage 21` | hand-written |
| ehg | docs/app/ventures/design/SPEC_WIREFRAMES.md | 24 | `Stage 21` | hand-written |
| ehg | docs/app/ventures/design/SPEC_WIREFRAMES.md | 124 | `Stage 21` | hand-written |
| ehg | docs/app/ventures/design/SPEC_WIREFRAMES.md | 180 | `Stage 21` | hand-written |
| ehg | docs/app/ventures/prd/00-VENTURES-SPEC.md | 108 | `Stage 21` | hand-written |
| ehg | docs/app/ventures/prd/05-Data-Sources-Map.md | 593 | `Stage 21` | hand-written |
| ehg | docs/app/ventures/prd/06-Progression-Policy.md | 164 | `Stage 21` | hand-written |
| ehg | docs/app/ventures/prd/09-Open-Questions.md | 81 | `Stage 21` | hand-written |
| ehg | docs/design-system/venture-stage-design-standards.md | 160 | `Stage 25` | hand-written |
| ehg | docs/learnings/25-stage-renderer-learnings.md | 235 | `stage 25` | hand-written |
| ehg | docs/learnings/25-stage-renderer-learnings.md | 237 | `Stage 23` | hand-written |
| ehg | docs/learnings/25-stage-renderer-learnings.md | 238 | `Stage 25` | hand-written |
| ehg | docs/research/stages/21_brief.md | 1 | `Stage 21` | hand-written |
| ehg | docs/research/stages/22_brief.md | 1 | `Stage 22` | hand-written |
| ehg | docs/research/stages/23_brief.md | 1 | `Stage 23` | hand-written |
| ehg | docs/research/stages/24_brief.md | 1 | `Stage 24` | hand-written |
| ehg | docs/research/stages/25_brief.md | 1 | `Stage 25` | hand-written |
| ehg | docs/research/stages/26_brief.md | 1 | `Stage 26` | hand-written |
| ehg | docs/VENTURE_LAUNCH_PROTOCOL.md | 70 | `Stage 21` | hand-written |
| ehg | docs/VENTURE_LAUNCH_PROTOCOL.md | 118 | `Stage 21` | hand-written |
| ehg | docs/VENTURE_LAUNCH_PROTOCOL.md | 119 | `Stage 22` | hand-written |
| ehg | docs/VENTURE_LAUNCH_PROTOCOL.md | 120 | `Stage 23` | hand-written |
| ehg | docs/VENTURE_LAUNCH_PROTOCOL.md | 123 | `Stage 24` | hand-written |
| ehg | docs/VENTURE_LAUNCH_PROTOCOL.md | 124 | `Stage 25` | hand-written |
| ehg | docs/VENTURE_LAUNCH_PROTOCOL.md | 148 | `Stage 21` | hand-written |
| ehg | docs/workflow/backlog/backlog.yaml | 35 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/backlog.yaml | 134 | `stage-22` | hand-written |
| ehg | docs/workflow/backlog/backlog.yaml | 354 | `Stage 26` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-003.md | 10 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-005.md | 33 | `Stage 21` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-005.md | 34 | `Stage 22` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-005.md | 35 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-005.md | 36 | `Stage 24` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-005.md | 37 | `Stage 25` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-005.md | 38 | `Stage 26` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-006.md | 14 | `Stage 21` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-007.md | 13 | `Stage 22` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-007.md | 14 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-007.md | 15 | `Stage 24` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-007.md | 19 | `stage-22` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-008.md | 33 | `Stage 21` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-008.md | 34 | `Stage 22` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-008.md | 35 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-008.md | 36 | `Stage 24` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-008.md | 37 | `Stage 25` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-008.md | 38 | `Stage 26` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-009.md | 33 | `Stage 21` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-009.md | 34 | `Stage 22` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-009.md | 35 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-009.md | 36 | `Stage 24` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-009.md | 37 | `Stage 25` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-009.md | 38 | `Stage 26` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-011.md | 33 | `Stage 21` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-011.md | 34 | `Stage 22` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-011.md | 35 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-011.md | 36 | `Stage 24` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-011.md | 37 | `Stage 25` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-011.md | 38 | `Stage 26` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-012.md | 13 | `Stage 21` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-012.md | 14 | `Stage 22` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-012.md | 15 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-012.md | 16 | `Stage 24` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-012.md | 17 | `Stage 25` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-012.md | 18 | `Stage 26` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-014.md | 10 | `Stage 26` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-014.md | 33 | `Stage 21` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-014.md | 34 | `Stage 22` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-014.md | 35 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-014.md | 36 | `Stage 24` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-014.md | 37 | `Stage 25` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-014.md | 38 | `Stage 26` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-015.md | 33 | `Stage 21` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-015.md | 34 | `Stage 22` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-015.md | 35 | `Stage 23` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-015.md | 36 | `Stage 24` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-015.md | 37 | `Stage 25` | hand-written |
| ehg | docs/workflow/backlog/issues/WF-015.md | 38 | `Stage 26` | hand-written |
| ehg | docs/workflow/critique/overview.md | 26 | `Stage 23` | hand-written |
| ehg | docs/workflow/critique/stage-21.md | 1 | `Stage 21` | hand-written |
| ehg | docs/workflow/critique/stage-22.md | 1 | `Stage 22` | hand-written |
| ehg | docs/workflow/critique/stage-23.md | 1 | `Stage 23` | hand-written |
| ehg | docs/workflow/critique/stage-24.md | 1 | `Stage 24` | hand-written |
| ehg | docs/workflow/critique/stage-25.md | 1 | `Stage 25` | hand-written |
| ehg | docs/workflow/critique/stage-26.md | 1 | `Stage 26` | hand-written |
| ehg | docs/workflow/GENERATION_SUMMARY.md | 86 | `stage 23` | hand-written |
| ehg | docs/workflow/metrics/overrides/venture_demo.yaml | 54 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/overrides/venture_demo.yaml | 59 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/resolved/--venture.yaml | 105 | `stage21` | hand-written |
| ehg | docs/workflow/metrics/resolved/--venture.yaml | 110 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/resolved/--venture.yaml | 114 | `stage23` | hand-written |
| ehg | docs/workflow/metrics/resolved/--venture.yaml | 118 | `stage24` | hand-written |
| ehg | docs/workflow/metrics/resolved/--venture.yaml | 122 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/resolved/--venture.yaml | 126 | `stage26` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo.yaml | 105 | `stage21` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo.yaml | 110 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo.yaml | 114 | `stage23` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo.yaml | 118 | `stage24` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo.yaml | 122 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo.yaml | 126 | `stage26` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo_diff.md | 35 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo_diff.md | 36 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo_diff.md | 37 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo_diff.md | 38 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo_diff.md | 39 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/resolved/venture_demo_diff.md | 40 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/thresholds.yaml | 126 | `stage21` | hand-written |
| ehg | docs/workflow/metrics/thresholds.yaml | 132 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/thresholds.yaml | 137 | `stage23` | hand-written |
| ehg | docs/workflow/metrics/thresholds.yaml | 142 | `stage24` | hand-written |
| ehg | docs/workflow/metrics/thresholds.yaml | 147 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/thresholds.yaml | 152 | `stage26` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 106 | `stage21` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 107 | `stage21` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 108 | `stage21` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 109 | `stage21` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 110 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 111 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 112 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 113 | `stage23` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 114 | `stage23` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 115 | `stage23` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 116 | `stage24` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 117 | `stage24` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 118 | `stage24` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 119 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 120 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 121 | `stage25` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 122 | `stage26` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 123 | `stage26` | hand-written |
| ehg | docs/workflow/metrics/thresholds_report.md | 124 | `stage26` | hand-written |
| ehg | docs/workflow/metrics/wave5_QA_report.md | 56 | `stage22` | hand-written |
| ehg | docs/workflow/metrics/wave5_QA_report.md | 61 | `stage25` | hand-written |
| ehg | docs/workflow/sop/20-enhanced-context-loading.md | 51 | `Stage 21` | hand-written |
| ehg | docs/workflow/sop/21-final-pre-flight-check.md | 60 | `stage21` | hand-written |
| ehg | docs/workflow/sop/21-final-pre-flight-check.md | 61 | `stage21` | hand-written |
| ehg | docs/workflow/sop/21-final-pre-flight-check.md | 62 | `stage21` | hand-written |
| ehg | docs/workflow/sop/21-final-pre-flight-check.md | 63 | `stage21` | hand-written |
| ehg | docs/workflow/sop/21-final-pre-flight-check.md | 67 | `Stage 22` | hand-written |
| ehg | docs/workflow/sop/22-iterative-development-loop.md | 47 | `stage22` | hand-written |
| ehg | docs/workflow/sop/22-iterative-development-loop.md | 48 | `stage22` | hand-written |
| ehg | docs/workflow/sop/22-iterative-development-loop.md | 49 | `stage22` | hand-written |
| ehg | docs/workflow/sop/22-iterative-development-loop.md | 52 | `Stage 21` | hand-written |
| ehg | docs/workflow/sop/22-iterative-development-loop.md | 53 | `Stage 23` | hand-written |
| ehg | docs/workflow/sop/22-iterative-development-loop.md | 57 | `Stage 21` | hand-written |
| ehg | docs/workflow/sop/22-iterative-development-loop.md | 83 | `Stage 21` | hand-written |
| ehg | docs/workflow/sop/23-continuous-feedback-loops.md | 48 | `stage23` | hand-written |
| ehg | docs/workflow/sop/23-continuous-feedback-loops.md | 49 | `stage23` | hand-written |
| ehg | docs/workflow/sop/23-continuous-feedback-loops.md | 50 | `stage23` | hand-written |
| ehg | docs/workflow/sop/23-continuous-feedback-loops.md | 53 | `Stage 22` | hand-written |
| ehg | docs/workflow/sop/23-continuous-feedback-loops.md | 54 | `Stage 24` | hand-written |
| ehg | docs/workflow/sop/23-continuous-feedback-loops.md | 58 | `Stage 22` | hand-written |
| ehg | docs/workflow/sop/23-continuous-feedback-loops.md | 84 | `Stage 22` | hand-written |
| ehg | docs/workflow/sop/24-mvp-engine-automated-feedback-iteration.md | 47 | `stage24` | hand-written |
| ehg | docs/workflow/sop/24-mvp-engine-automated-feedback-iteration.md | 48 | `stage24` | hand-written |
| ehg | docs/workflow/sop/24-mvp-engine-automated-feedback-iteration.md | 49 | `stage24` | hand-written |
| ehg | docs/workflow/sop/24-mvp-engine-automated-feedback-iteration.md | 52 | `Stage 23` | hand-written |
| ehg | docs/workflow/sop/24-mvp-engine-automated-feedback-iteration.md | 53 | `Stage 25` | hand-written |
| ehg | docs/workflow/sop/24-mvp-engine-automated-feedback-iteration.md | 57 | `Stage 23` | hand-written |
| ehg | docs/workflow/sop/24-mvp-engine-automated-feedback-iteration.md | 83 | `Stage 23` | hand-written |
| ehg | docs/workflow/sop/25-quality-assurance.md | 54 | `stage25` | hand-written |
| ehg | docs/workflow/sop/25-quality-assurance.md | 55 | `stage25` | hand-written |
| ehg | docs/workflow/sop/25-quality-assurance.md | 56 | `stage25` | hand-written |
| ehg | docs/workflow/sop/25-quality-assurance.md | 59 | `Stage 24` | hand-written |
| ehg | docs/workflow/sop/25-quality-assurance.md | 60 | `Stage 26` | hand-written |
| ehg | docs/workflow/sop/25-quality-assurance.md | 64 | `Stage 24` | hand-written |
| ehg | docs/workflow/sop/25-quality-assurance.md | 90 | `Stage 24` | hand-written |
| ehg | docs/workflow/sop/26-security-compliance-certification.md | 47 | `stage26` | hand-written |
| ehg | docs/workflow/sop/26-security-compliance-certification.md | 48 | `stage26` | hand-written |
| ehg | docs/workflow/sop/26-security-compliance-certification.md | 49 | `stage26` | hand-written |
| ehg | docs/workflow/sop/26-security-compliance-certification.md | 52 | `Stage 25` | hand-written |
| ehg | docs/workflow/sop/26-security-compliance-certification.md | 57 | `Stage 25` | hand-written |
| ehg | docs/workflow/sop/26-security-compliance-certification.md | 83 | `Stage 25` | hand-written |
| ehg | docs/workflow/sop/27-actor-model-saga-transaction-integration.md | 63 | `Stage 26` | hand-written |
| ehg | docs/workflow/sop/27-actor-model-saga-transaction-integration.md | 68 | `Stage 26` | hand-written |
| ehg | docs/workflow/sop/27-actor-model-saga-transaction-integration.md | 94 | `Stage 26` | hand-written |
| ehg | docs/workflow/SOP_INDEX.md | 31 | `Stage 21` | hand-written |
| ehg | docs/workflow/SOP_INDEX.md | 32 | `Stage 22` | hand-written |
| ehg | docs/workflow/SOP_INDEX.md | 33 | `Stage 23` | hand-written |
| ehg | docs/workflow/SOP_INDEX.md | 34 | `Stage 24` | hand-written |
| ehg | docs/workflow/SOP_INDEX.md | 35 | `Stage 25` | hand-written |
| ehg | docs/workflow/SOP_INDEX.md | 36 | `Stage 26` | hand-written |
| ehg | enhanced_prds/00_foundation/database_schema.md | 42 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/20_enhanced_context_loading.md | 34 | `Stage 21` | hand-written |
| ehg | enhanced_prds/20_workflows/21_preflight_check.md | 1 | `Stage 21` | hand-written |
| ehg | enhanced_prds/20_workflows/21_preflight_check.md | 33 | `Stage 21` | hand-written |
| ehg | enhanced_prds/20_workflows/21_preflight_check.md | 34 | `Stage 22` | hand-written |
| ehg | enhanced_prds/20_workflows/22_iterative_dev_loop.md | 1 | `Stage 22` | hand-written |
| ehg | enhanced_prds/20_workflows/22_iterative_dev_loop.md | 33 | `Stage 22` | hand-written |
| ehg | enhanced_prds/20_workflows/22_iterative_dev_loop.md | 34 | `Stage 21` | hand-written |
| ehg | enhanced_prds/20_workflows/23a_feedback_loops.md | 1 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/23a_feedback_loops.md | 233 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/23a_feedback_loops.md | 234 | `Stage 22` | hand-written |
| ehg | enhanced_prds/20_workflows/23a_feedback_loops.md | 234 | `Stage 24` | hand-written |
| ehg | enhanced_prds/20_workflows/23b_feedback_loops_ai.md | 1 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/23b_feedback_loops_ai.md | 342 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/23b_feedback_loops_ai.md | 343 | `Stage 22` | hand-written |
| ehg | enhanced_prds/20_workflows/23b_feedback_loops_ai.md | 343 | `Stage 24` | hand-written |
| ehg | enhanced_prds/20_workflows/23b_feedback_loops_ai.md | 822 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/24_mvp_engine_iteration.md | 1 | `Stage 24` | hand-written |
| ehg | enhanced_prds/20_workflows/24_mvp_engine_iteration.md | 224 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/24_mvp_engine_iteration.md | 240 | `Stage 24` | hand-written |
| ehg | enhanced_prds/20_workflows/24_mvp_engine_iteration.md | 241 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/24_mvp_engine_iteration.md | 241 | `Stage 25` | hand-written |
| ehg | enhanced_prds/20_workflows/25_quality_assurance.md | 1 | `Stage 25` | hand-written |
| ehg | enhanced_prds/20_workflows/25_quality_assurance.md | 273 | `Stage 25` | hand-written |
| ehg | enhanced_prds/20_workflows/25_quality_assurance.md | 274 | `Stage 24` | hand-written |
| ehg | enhanced_prds/20_workflows/25_quality_assurance.md | 274 | `Stage 26` | hand-written |
| ehg | enhanced_prds/20_workflows/26_security_compliance.md | 1 | `Stage 26` | hand-written |
| ehg | enhanced_prds/20_workflows/26_security_compliance.md | 6 | `Stage 26` | hand-written |
| ehg | enhanced_prds/20_workflows/26_security_compliance.md | 248 | `Stage 26` | hand-written |
| ehg | enhanced_prds/20_workflows/26_security_compliance.md | 249 | `Stage 25` | hand-written |
| ehg | enhanced_prds/20_workflows/27_actor_model_saga.md | 326 | `Stage 26` | hand-written |
| ehg | enhanced_prds/20_workflows/32b_customer_success_ai.md | 6 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/32b_customer_success_ai.md | 921 | `Stage 23` | hand-written |
| ehg | enhanced_prds/20_workflows/61_venture_prd_generation.md | 213 | `Stage 26` | hand-written |
| ehg | enhanced_prds/30_agents/ai_ceo_agent.md | 57 | `Stage 23` | hand-written |
| ehg | enhanced_prds/30_agents/ai_ceo_agent.md | 102 | `Stage 23` | hand-written |
| ehg | eslint.config.js | 209 | `Stage25ScalePlanning.tsx` | hand-written |
| ehg | eslint.config.js | 217 | `Stage25QualityAssurance.tsx` | hand-written |
| ehg | eslint.config.js | 218 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| ehg | eslint.config.js | 220 | `Stage23ProductionLaunch.tsx` | hand-written |
| ehg | eslint.config.js | 221 | `Stage21QaUat.tsx` | hand-written |
| ehg | eslint.config.js | 240 | `Stage23CustomerAcquisition.tsx` | hand-written |
| ehg | eslint.config.js | 241 | `Stage24MVPEngineIteration.tsx` | hand-written |
| ehg | eslint.config.js | 244 | `Stage22Deployment.tsx` | hand-written |
| ehg | eslint.config.js | 277 | `Stage23ContinuousFeedbackLoops.tsx` | hand-written |
| ehg | scripts/generate-workflow-docs.js | 265 | `Stage 23` | hand-written |
| ehg | scripts/generate-workflow-docs.js | 563 | `Stage 23` | hand-written |
| ehg | scripts/generate-workflow-docs.js | 620 | `stage-22` | hand-written |
| ehg | scripts/generate-workflow-docs.js | 717 | `Stage 26` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 47 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 48 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 49 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 50 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 51 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 52 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 129 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 130 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 131 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 132 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 133 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 134 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 152 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 153 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 154 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 155 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 156 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_COMPLETE.md | 157 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 79 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 80 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 81 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 82 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 83 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 84 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 85 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 86 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 87 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 88 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 89 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_E2E_TESTING_COMPLETE.md | 90 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 48 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 49 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 50 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 51 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 52 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 53 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 143 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 144 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 145 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 146 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 147 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 148 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 154 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 155 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 156 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 157 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 158 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_FINAL_REPORT.md | 159 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 43 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 44 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 45 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 46 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 47 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 48 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 99 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 100 | `stage-21` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 101 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 102 | `stage-22` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 103 | `stage-23` | hand-written |
| ehg | SPRINT4_PHASE1_TESTING_RESULTS.md | 104 | `stage-23` | hand-written |
| ehg | src/components/chairman-v3/DecisionGateDetailSheet.tsx | 139 | `stage22` | hand-written |
| ehg | src/components/chairman-v3/DecisionGateDetailSheet.tsx | 139 | `stage25` | hand-written |
| ehg | src/components/chairman-v3/DecisionGateDetailSheet.tsx | 143 | `stage22` | hand-written |
| ehg | src/components/chairman-v3/DecisionGateDetailSheet.tsx | 144 | `stage25` | hand-written |
| ehg | src/components/chairman-v3/decisions/DecisionActions.tsx | 27 | `stage22` | hand-written |
| ehg | src/components/chairman-v3/decisions/DecisionActions.tsx | 27 | `stage25` | hand-written |
| ehg | src/components/chairman-v3/decisions/DecisionActions.tsx | 90 | `stage22` | hand-written |
| ehg | src/components/chairman-v3/decisions/DecisionActions.tsx | 96 | `stage25` | hand-written |
| ehg | src/components/chairman-v3/decisions/DecisionActions.tsx | 207 | `stage25` | hand-written |
| ehg | src/components/chairman-v3/decisions/DecisionActions.tsx | 211 | `stage22` | hand-written |
| ehg | src/components/chairman-v3/decisions/RejectVentureDialog.tsx | 2 | `Stage 23` | hand-written |
| ehg | src/components/chairman-v3/gates/LaunchGateRenderer.tsx | 2 | `Stage 24` | hand-written |
| ehg | src/components/chairman-v3/gates/Stage23Renderer.tsx | 2 | `Stage 23` | hand-written |
| ehg | src/components/chairman-v3/operations/OperationsDashboard.tsx | 36 | `stage 26` | hand-written |
| ehg | src/components/chairman-v3/settings/WebAuthnRegistration.tsx | 101 | `Stage 24` | hand-written |
| ehg | src/components/settings/AlertConfiguration.tsx | 26 | `Stage 21` | hand-written |
| ehg | src/components/settings/AlertConfiguration.tsx | 27 | `Stage 22` | hand-written |
| ehg | src/components/settings/AlertConfiguration.tsx | 28 | `Stage 23` | hand-written |
| ehg | src/components/settings/AlertConfiguration.tsx | 29 | `Stage 24` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 2 | `Stage 25` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 5 | `stage-25` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 43 | `Stage 24` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 45 | `Stage 24` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 45 | `Stage 25` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 45 | `Stage 24` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 45 | `Stage 25` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 56 | `Stage 24` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 67 | `Stage 24` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 67 | `Stage 25` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 67 | `Stage 23` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 67 | `Stage 24` | hand-written |
| ehg | src/components/stages/PostLaunchNoDataAlert.tsx | 67 | `Stage 25` | hand-written |
| ehg | src/components/stages/Stage20CodeQuality.tsx | 114 | `Stage 21` | hand-written |
| ehg | src/components/stages/Stage20CodeQuality.tsx | 166 | `Stage 21` | hand-written |
| ehg | src/components/stages/Stage20CodeQuality.tsx | 188 | `Stage 21` | hand-written |
| ehg | src/components/stages/Stage20CodeQuality.tsx | 189 | `Stage 21` | hand-written |
| ehg | src/components/stages/Stage20OverrideModal.tsx | 74 | `Stage 21` | hand-written |
| ehg | src/components/stages/Stage22BuildReview.tsx | 2 | `Stage 22` | hand-written |
| ehg | src/components/stages/Stage22BuildReview.tsx | 6 | `stage-22` | hand-written |
| ehg | src/components/stages/Stage22BuildReview.tsx | 75 | `Stage 22` | hand-written |
| ehg | src/components/stages/Stage23LaunchReadiness.tsx | 47 | `stage24` | hand-written |
| ehg | src/components/stages/Stage23LaunchReadiness.tsx | 47 | `stage-23` | hand-written |
| ehg | src/components/stages/Stage23LaunchReadiness.tsx | 48 | `stage23` | hand-written |
| ehg | src/components/stages/Stage23ReleaseReadiness.tsx | 2 | `Stage 22` | hand-written |
| ehg | src/components/stages/Stage23ReleaseReadiness.tsx | 6 | `stage-22` | hand-written |
| ehg | src/components/stages/Stage23ReleaseReadiness.tsx | 76 | `Stage 22` | hand-written |
| ehg | src/components/stages/Stage24GoLive.tsx | 37 | `stage24` | hand-written |
| ehg | src/components/stages/Stage24MarketingPreparation.tsx | 2 | `Stage 23` | hand-written |
| ehg | src/components/stages/Stage24MarketingPreparation.tsx | 6 | `stage-23` | hand-written |
| ehg | src/components/stages/Stage24MarketingPreparation.tsx | 85 | `Stage 23` | hand-written |
| ehg | src/components/stages/Stage25PostLaunchReview.tsx | 24 | `stage-25` | hand-written |
| ehg | src/components/stages/Stage26GrowthPlaybook.tsx | 137 | `stage-26` | hand-written |
| ehg | src/components/stages/Stage26GrowthPlaybook.tsx | 137 | `Stage 26` | hand-written |
| ehg | src/components/ventures/launchReadiness.utils.ts | 17 | `stage 24` | hand-written |
| ehg | src/components/ventures/launchReadiness.utils.ts | 22 | `stage 24` | hand-written |
| ehg | src/components/ventures/launchReadiness.utils.ts | 98 | `Stage 26` | hand-written |
| ehg | src/components/ventures/launchReadiness.utils.ts | 99 | `Stage 26` | hand-written |
| ehg | src/components/ventures/operations-mode/RevenueTab.tsx | 115 | `Stage 25` | hand-written |
| ehg | src/config/venture-workflow.ts | 262 | `Stage22DistributionSetup.tsx` | hand-written |
| ehg | src/config/venture-workflow.ts | 273 | `Stage21VisualAssets.tsx` | hand-written |
| ehg | src/config/venture-workflow.ts | 284 | `Stage23LaunchReadiness.tsx` | hand-written |
| ehg | src/config/venture-workflow.ts | 296 | `Stage24GoLive.tsx` | hand-written |
| ehg | src/config/venture-workflow.ts | 306 | `Stage25PostLaunchReview.tsx` | hand-written |
| ehg | src/config/venture-workflow.ts | 316 | `Stage26GrowthPlaybook.tsx` | hand-written |
| ehg | src/config/venture-workflow.ts | 259 | `stageNumber: 21` | hand-written |
| ehg | src/config/venture-workflow.ts | 270 | `stageNumber: 22` | hand-written |
| ehg | src/config/venture-workflow.ts | 281 | `stageNumber: 23` | hand-written |
| ehg | src/config/venture-workflow.ts | 293 | `stageNumber: 24` | hand-written |
| ehg | src/config/venture-workflow.ts | 303 | `stageNumber: 25` | hand-written |
| ehg | src/config/venture-workflow.ts | 313 | `stageNumber: 26` | hand-written |
| ehg | src/config/venture-workflow.ts | 46 | `Stage 24` | hand-written |
| ehg | src/config/venture-workflow.ts | 52 | `Stage 23` | hand-written |
| ehg | src/config/venture-workflow.ts | 53 | `Stage 25` | hand-written |
| ehg | src/constants/gating.ts | 47 | `Stage 21` | hand-written |
| ehg | src/constants/gating.ts | 53 | `stage21` | hand-written |
| ehg | src/constants/gating.ts | 59 | `stage21` | hand-written |
| ehg | src/constants/gating.ts | 65 | `stage21` | hand-written |
| ehg | src/constants/gating.ts | 71 | `stage21` | hand-written |
| ehg | src/constants/gating.ts | 86 | `Stage 25` | hand-written |
| ehg | src/hooks/useLaunchWorkflow.ts | 76 | `stage 21` | hand-written |
| ehg | src/hooks/useLaunchWorkflow.ts | 85 | `stage 22` | hand-written |
| ehg | src/hooks/useLaunchWorkflow.ts | 103 | `stage 23` | hand-written |
| ehg | src/hooks/useLaunchWorkflow.ts | 110 | `Stage 23` | hand-written |
| ehg | src/hooks/useLaunchWorkflow.ts | 114 | `stage 24` | hand-written |
| ehg | src/hooks/useLaunchWorkflow.ts | 128 | `stage 25` | hand-written |
| ehg | src/hooks/useLaunchWorkflow.ts | 246 | `stage 25` | hand-written |
| ehg | src/hooks/usePendingGateDecision.ts | 18 | `Stage 24` | hand-written |
| ehg | src/hooks/useRegisterCloudflareDeployment.ts | 10 | `stage23` | hand-written |
| ehg | src/hooks/useRegisterCloudflareDeployment.ts | 56 | `stage23` | hand-written |
| ehg | src/hooks/useSetDeploymentGuardrails.ts | 11 | `stage22` | hand-written |
| ehg | src/hooks/useSetDeploymentGuardrails.ts | 60 | `stage22` | hand-written |
| ehg | src/hooks/useUserRole.ts | 8 | `Stage 23` | hand-written |
| ehg | src/hooks/useVerifyDeploymentHealth.ts | 11 | `stage24` | hand-written |
| ehg | src/hooks/useVerifyDeploymentHealth.ts | 60 | `stage24` | hand-written |
| ehg | src/lib/ai-guardrails/CITATION_FORMAT.md | 49 | `Stage22` | hand-written |
| ehg | src/pages/ChairmanSettingsPage.tsx | 190 | `Stage 24` | hand-written |
| ehg | src/services/automationEngine.ts | 95 | `Stage 21` | hand-written |
| ehg | src/services/evaTaskContracts.ts | 334 | `Stage 21` | hand-written |
| ehg | src/types/stageDisplayData.ts | 292 | `Stage 21` | hand-written |
| ehg | src/types/stageDisplayData.ts | 374 | `Stage 23` | hand-written |
| ehg | src/types/stageDisplayData.ts | 387 | `Stage 24` | hand-written |
| ehg | src/types/workflowStages.ts | 874 | `Stage 21` | hand-written |
| ehg | src/types/workflowStages.ts | 925 | `Stage 22` | hand-written |
| ehg | src/types/workflowStages.ts | 998 | `Stage 23` | hand-written |
| ehg | src/types/workflowStages.ts | 1073 | `Stage 24` | hand-written |
| ehg | src/types/workflowStages.ts | 1156 | `Stage 25` | hand-written |
| ehg | src/utils/milestoneAutoPopulate.ts | 48 | `stage_number: 21` | hand-written |
| ehg | src/utils/milestoneAutoPopulate.ts | 51 | `stage_number: 22` | hand-written |
| ehg | src/utils/milestoneAutoPopulate.ts | 52 | `stage_number: 23` | hand-written |
| ehg | src/utils/milestoneAutoPopulate.ts | 53 | `stage_number: 24` | hand-written |
| ehg | src/utils/milestoneAutoPopulate.ts | 54 | `stage_number: 25` | hand-written |
| ehg | src/utils/milestoneAutoPopulate.ts | 55 | `stage_number: 26` | hand-written |
| ehg | supabase/functions/chairman-webauthn-register-begin/README.md | 4 | `Stage 24` | hand-written |
| ehg | supabase/migrations/20260721160000_chairman_webauthn_stepup.sql | 144 | `stage_number = 24` | hand-written |
| ehg | supabase/migrations/20260721160000_chairman_webauthn_stepup.sql | 154 | `stage_number = 24` | hand-written |
| ehg | supabase/migrations/20260721160000_chairman_webauthn_stepup.sql | 3 | `Stage 24` | hand-written |
| ehg | supabase/migrations/20260721160000_chairman_webauthn_stepup.sql | 11 | `Stage-24` | hand-written |
| ehg | supabase/migrations/20260721160000_chairman_webauthn_stepup.sql | 12 | `Stage-24` | hand-written |
| ehg | supabase/migrations/20260721160000_chairman_webauthn_stepup.sql | 140 | `Stage 24` | hand-written |
| ehg | supabase/migrations/20260721160100_chairman_decision_rpcs_stepup_gate.sql | 5 | `Stage-24` | hand-written |
| ehg | supabase/migrations/20260721160100_chairman_decision_rpcs_stepup_gate.sql | 14 | `stage 24` | hand-written |
| ehg | supabase/migrations/20260721160100_chairman_decision_rpcs_stepup_gate.sql | 16 | `Stage-24` | hand-written |
| ehg | supabase/migrations/_verify_20260522_001_restrict_chairman_decision_rpcs.test.sql | 396 | `stage 23` | hand-written |
| ehg | supabase/migrations/_verify_20260522_002_fix_reject_chairman_decision_columns.test.sql | 177 | `stage 26` | hand-written |
| ehg | supabase/migrations/_verify_20260522_002_fix_reject_chairman_decision_columns.test.sql | 187 | `stage 26` | hand-written |
| ehg | tests/components/chairman-v3/decisions/DecisionActions.test.tsx | 19 | `stage25` | hand-written |
| ehg | tests/components/chairman-v3/decisions/DecisionActions.test.tsx | 81 | `stage25` | hand-written |
| ehg | tests/components/chairman-v3/decisions/DecisionActions.test.tsx | 85 | `stage25` | hand-written |
| ehg | tests/components/chairman-v3/decisions/DecisionActions.test.tsx | 99 | `stage25` | hand-written |
| ehg | tests/components/chairman-v3/decisions/DecisionActions.test.tsx | 114 | `stage25` | hand-written |
| ehg | tests/components/stages/PostLaunchNoDataAlert.test.tsx | 17 | `Stage 24` | hand-written |
| ehg | tests/components/stages/PostLaunchNoDataAlert.test.tsx | 42 | `Stage 24` | hand-written |
| ehg | tests/components/stages/v2/StageRouter.test.tsx | 106 | `stage26` | hand-written |
| ehg | tests/components/stages/v2/StageRouter.test.tsx | 107 | `stage26` | hand-written |
| ehg | tests/e2e/chairman-stage23-reject.spec.ts | 4 | `Stage 23` | hand-written |
| ehg | tests/e2e/chairman-stage23-reject.spec.ts | 65 | `stage 23` | hand-written |
| ehg | tests/e2e/chairman-stage23-reject.spec.ts | 71 | `Stage 23` | hand-written |
| ehg | tests/e2e/chairman-stage23-reject.spec.ts | 106 | `Stage 23` | hand-written |
| ehg | tests/e2e/filters.spec.ts | 46 | `stage21` | hand-written |
| ehg | tests/e2e/filters.spec.ts | 46 | `stage-21` | hand-written |
| ehg | tests/e2e/filters.spec.ts | 48 | `stage21` | hand-written |
| ehg | tests/e2e/filters.spec.ts | 49 | `stage21` | hand-written |
| ehg | tests/e2e/integration.test.ts | 98 | `Stage 21` | hand-written |
| ehg | tests/e2e/integration.test.ts | 102 | `Stage 21` | hand-written |
| ehg | tests/e2e/integration.test.ts | 479 | `Stage 21` | hand-written |
| ehg | tests/e2e/launch-growth-chunk-workflow.spec.ts | 73 | `Stage 21` | hand-written |
| ehg | tests/e2e/launch-growth-chunk-workflow.spec.ts | 74 | `Stage 21` | hand-written |
| ehg | tests/e2e/operations-chunk-workflow.spec.ts | 73 | `Stage 26` | hand-written |
| ehg | tests/e2e/operations-chunk-workflow.spec.ts | 74 | `Stage 26` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 26 | `Stage21QATestSuiteManagement.tsx` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 27 | `Stage21UATReportGeneration.tsx` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 28 | `Stage22DeploymentDashboard.tsx` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 29 | `Stage23LaunchChecklist.tsx` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 30 | `Stage24GrowthMetricsOptimization.tsx` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 31 | `Stage25ScalePlanning.tsx` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 6 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 7 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 8 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 9 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 10 | `Stage 24` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 11 | `Stage 25` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 16 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 17 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 18 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 19 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 20 | `Stage 24` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 21 | `Stage 25` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 22 | `Stage 25` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 58 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 61 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 64 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 137 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 163 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 197 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 198 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 203 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 204 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 254 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 255 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 281 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 282 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 288 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 289 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 355 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 356 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 362 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 363 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 432 | `Stage 24` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 433 | `Stage 24` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 439 | `Stage 24` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 440 | `Stage 24` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 498 | `Stage 25` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 499 | `Stage 25` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 505 | `Stage 25` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 506 | `Stage 25` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 610 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 613 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 614 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 620 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 623 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 624 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 638 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 639 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 641 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 645 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 653 | `Stage 21` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 674 | `Stage 22` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 693 | `Stage 23` | hand-written |
| ehg | tests/e2e/phase6-stages-21-25.spec.ts | 724 | `Stage 21` | hand-written |
| ehg | tests/e2e/run-tests-simple.cjs | 241 | `Stage 21` | hand-written |
| ehg | tests/e2e/special-logic.test.ts | 373 | `Stage 21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-navigation.spec.ts | 274 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-navigation.spec.ts | 275 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-navigation.spec.ts | 276 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-navigation.spec.ts | 277 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-navigation.spec.ts | 278 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-navigation.spec.ts | 279 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 90 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 91 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 102 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 114 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 115 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 126 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 138 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 139 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 150 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 162 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 163 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 174 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 186 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 187 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 198 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 210 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 211 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 222 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 238 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 239 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 240 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 241 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 242 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 243 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 261 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 262 | `stage-21` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 263 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 264 | `stage-22` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 265 | `stage-23` | hand-written |
| ehg | tests/e2e/sprint4-phase1-workflows.spec.ts | 266 | `stage-23` | hand-written |
| ehg | tests/e2e/stage20-compliance-gate.spec.ts | 7 | `Stage 21` | hand-written |
| ehg | tests/e2e/stages/stage-navigation.spec.ts | 114 | `stage25` | hand-written |
| ehg | tests/e2e/stages/stage-navigation.spec.ts | 114 | `Stage 25` | hand-written |
| ehg | tests/e2e/stages/stage-navigation.spec.ts | 117 | `Stage 25` | hand-written |
| ehg | tests/e2e/stages/stage-navigation.spec.ts | 118 | `stage25` | hand-written |
| ehg | tests/e2e/utils/test-data-generator.ts | 414 | `Stage 21` | hand-written |
| ehg | tests/e2e/utils/test-report-generator.ts | 357 | `Stage 21` | hand-written |
| ehg | tests/e2e/venture-gate-decisions.spec.ts | 118 | `Stage 25` | hand-written |
| ehg | tests/e2e/venture-gate-decisions.spec.ts | 119 | `Stage25` | hand-written |
| ehg | tests/e2e/venture-gate-decisions.spec.ts | 127 | `Stage 25` | hand-written |
| ehg | tests/e2e/venture-launch/stage25-post-launch-no-data.spec.ts | 2 | `Stage 25` | hand-written |
| ehg | tests/e2e/venture-launch/stage25-post-launch-no-data.spec.ts | 11 | `Stage 25` | hand-written |
| ehg | tests/e2e/venture-launch/stage25-post-launch-no-data.spec.ts | 33 | `Stage 25` | hand-written |
| ehg | tests/e2e/venture-launch/stage25-post-launch-no-data.spec.ts | 37 | `Stage 24` | hand-written |
| ehg | tests/e2e/venture-launch/stage25-post-launch-no-data.spec.ts | 66 | `stage-25` | hand-written |
| ehg | tests/e2e/venture-lifecycle-complete.test.ts | 207 | `Stage 21` | hand-written |
| ehg | tests/e2e/venture-lifecycle-complete.test.ts | 216 | `Stage 22` | hand-written |
| ehg | tests/e2e/venture-lifecycle-complete.test.ts | 225 | `Stage 23` | hand-written |
| ehg | tests/e2e/venture-lifecycle-complete.test.ts | 234 | `Stage 24` | hand-written |
| ehg | tests/e2e/venture-lifecycle-complete.test.ts | 243 | `Stage 25` | hand-written |
| ehg | tests/e2e/venture-lifecycle-complete.test.ts | 557 | `Stage 21` | hand-written |
| ehg | tests/e2e/ventures-enhancements.test.ts | 211 | `stage 25` | hand-written |
| ehg | tests/unit/api/stage24-go-live.test.ts | 2 | `STAGE24` | hand-written |
| ehg | tests/unit/api/stage24-go-live.test.ts | 2 | `Stage-24` | hand-written |
| ehg | tests/unit/api/stage24-go-live.test.ts | 3 | `Stage-23` | hand-written |
| ehg | tests/unit/api/stage24-go-live.test.ts | 15 | `stage24` | hand-written |
| ehg | tests/unit/api/stage24-go-live.test.ts | 19 | `Stage-24` | hand-written |
| ehg | tests/unit/components/Stage26GrowthPlaybook.test.tsx | 21 | `stageNumber: 26` | hand-written |
| ehg | tests/unit/components/Stage26GrowthPlaybook.test.tsx | 55 | `Stage 26` | hand-written |
| ehg | tests/unit/components/stages/stage-failure-surfaces.test.tsx | 21 | `Stage25` | hand-written |
| ehg | tests/unit/components/stages/stage-failure-surfaces.test.tsx | 77 | `stage23` | hand-written |
| ehg | tests/unit/components/stages/stage-failure-surfaces.test.tsx | 83 | `stage23` | hand-written |
| ehg | tests/unit/components/stages/Stage24GoLive.test.tsx | 6 | `Stage 24` | hand-written |
| ehg | tests/unit/hooks/cloudflare-deployment-hooks.test.tsx | 39 | `stage23` | hand-written |
| ehg | tests/unit/hooks/cloudflare-deployment-hooks.test.tsx | 44 | `stage23` | hand-written |
| ehg | tests/unit/hooks/cloudflare-deployment-hooks.test.tsx | 49 | `stage22` | hand-written |
| ehg | tests/unit/hooks/cloudflare-deployment-hooks.test.tsx | 54 | `stage22` | hand-written |
| ehg | tests/unit/hooks/cloudflare-deployment-hooks.test.tsx | 58 | `stage24` | hand-written |
| ehg | tests/unit/hooks/cloudflare-deployment-hooks.test.tsx | 63 | `stage24` | hand-written |
| ehg | tests/unit/hooks/useGateStages.test.ts | 28 | `stage_number: 21` | hand-written |
| ehg | tests/unit/hooks/useGateStages.test.ts | 29 | `stage_number: 22` | hand-written |
| ehg | tests/unit/hooks/useGateStages.test.ts | 30 | `stage_number: 23` | hand-written |
| ehg | tests/unit/hooks/useGateStages.test.ts | 31 | `stage_number: 24` | hand-written |
| ehg | tests/unit/hooks/useGateStages.test.ts | 32 | `stage_number: 25` | hand-written |
| ehg | tests/unit/hooks/useVentureLifecycle.test.ts | 27 | `stageNumber: 23` | hand-written |
| ehg | tests/unit/hooks/useVentureLifecycle.test.ts | 25 | `stage 22` | hand-written |
| ehg | tests/unit/hooks/useVentureLifecycle.test.ts | 30 | `stage 24` | hand-written |
| ehg | tests/unit/hooks/useVentureLifecycle.test.ts | 35 | `stage 25` | hand-written |
| ehg | tests/unit/services/evaTaskContracts.test.ts | 388 | `stage 23` | hand-written |
| ehg | tests/unit/services/evaTaskContracts.test.ts | 394 | `stage 24` | hand-written |
| ehg | tests/unit/services/evaTaskContracts.test.ts | 398 | `stage 25` | hand-written |
| ehg | tests/unit/services/evaTaskContracts.test.ts | 427 | `stage 22` | hand-written |
| ehg | tests/unit/services/evaTaskContracts.test.ts | 467 | `stage 25` | hand-written |
| ehg | tests/unit/services/evaTaskContracts.test.ts | 494 | `stage 22` | hand-written |
| ehg | tests/unit/services/evaTaskContracts.test.ts | 501 | `stage 25` | hand-written |
| ehg | tests/unit/ventures/launchReadiness.utils.test.ts | 20 | `stage-24` | hand-written |
| ehg | tests/unit/ventures/launchReadiness.utils.test.ts | 66 | `Stage 26` | hand-written |
| ehg | tests/unit/ventures/launchReadiness.utils.test.ts | 74 | `Stage 26` | hand-written |
| ehg | tests/unit/ventures/launchReadiness.utils.test.ts | 83 | `Stage 24` | hand-written |
| ehg | tests/unit/ventures/launchReadiness.utils.test.ts | 118 | `stage 26` | hand-written |

## Database Findings Detail

### information_schema stage-bearing columns

```json
[
  {
    "table_name": "eva_stage_gate_attempts",
    "column_name": "stage_number",
    "data_type": "integer"
  },
  {
    "table_name": "venture_stage_transitions",
    "column_name": "from_stage",
    "data_type": "integer"
  },
  {
    "table_name": "venture_stage_transitions",
    "column_name": "to_stage",
    "data_type": "integer"
  },
  {
    "table_name": "venture_stages",
    "column_name": "stage_key",
    "data_type": "text"
  },
  {
    "table_name": "venture_stages",
    "column_name": "stage_name",
    "data_type": "text"
  },
  {
    "table_name": "venture_stages",
    "column_name": "stage_number",
    "data_type": "integer"
  },
  {
    "table_name": "ventures",
    "column_name": "current_lifecycle_stage",
    "data_type": "integer"
  }
]
```

### jsonb metadata paths (eva_stage_gate_attempts)

0 findings.

### pg_proc function bodies

```json
[
  {
    "proname": "advance_canary_stage"
  },
  {
    "proname": "advance_venture_stage"
  },
  {
    "proname": "approve_chairman_decision"
  },
  {
    "proname": "assess_sd_type_change_risk"
  },
  {
    "proname": "bootstrap_venture_workflow"
  },
  {
    "proname": "complete_orchestrator_sd"
  },
  {
    "proname": "delete_venture"
  },
  {
    "proname": "enforce_kill_gate_threshold"
  },
  {
    "proname": "fn_advance_venture_stage"
  },
  {
    "proname": "fn_bootstrap_venture_stages"
  },
  {
    "proname": "fn_chairman_decide"
  },
  {
    "proname": "fn_chairman_decision_value"
  },
  {
    "proname": "fn_enforce_stage_advancement_artifact_gate"
  },
  {
    "proname": "fn_stage_artifact_precondition"
  },
  {
    "proname": "fn_validate_stage_column"
  },
  {
    "proname": "fn_write_kill_audit_trail"
  },
  {
    "proname": "get_venture_stage_summary"
  },
  {
    "proname": "log_stage_advance_override"
  },
  {
    "proname": "prevent_tier0_stage_progression"
  },
  {
    "proname": "reject_chairman_decision"
  },
  {
    "proname": "rescan_stage_20"
  },
  {
    "proname": "select_schedulable_ventures"
  },
  {
    "proname": "set_canary_stage"
  },
  {
    "proname": "venture_pbn_status"
  }
]
```

### views/matviews

```json
[
  {
    "name": "v_ventures_stage_compat",
    "kind": "view"
  },
  {
    "name": "chairman_all_decision_signals",
    "kind": "view"
  },
  {
    "name": "stage_zero_experiment_telemetry",
    "kind": "matview"
  }
]
```

### array-typed columns

```json
[
  {
    "surface": "venture_stages.depends_on",
    "stage_number": 22,
    "elements": [
      21
    ]
  },
  {
    "surface": "venture_stages.depends_on",
    "stage_number": 25,
    "elements": [
      24
    ]
  },
  {
    "surface": "venture_stages.depends_on",
    "stage_number": 26,
    "elements": [
      25
    ]
  },
  {
    "surface": "venture_stages.depends_on",
    "stage_number": 23,
    "elements": [
      22
    ]
  },
  {
    "surface": "venture_stages.depends_on",
    "stage_number": 24,
    "elements": [
      23
    ]
  },
  {
    "surface": "lifecycle_phases.stages",
    "stage_number": 5,
    "elements": [
      17,
      18,
      19,
      20,
      21,
      22
    ]
  },
  {
    "surface": "lifecycle_phases.stages",
    "stage_number": 6,
    "elements": [
      23,
      24,
      25,
      26
    ]
  },
  {
    "surface": "chairman_dashboard_config.hard_gate_stages",
    "stage_number": null,
    "elements": [
      3,
      5,
      10,
      13,
      17,
      18,
      19,
      23,
      24,
      25
    ]
  }
]
```

### venture_stages.component_path mismatches (negative control source)

```json
[
  {
    "stage_number": 22,
    "component_path": "Stage21VisualAssets.tsx",
    "embedded_stage_number": 21
  },
  {
    "stage_number": 21,
    "component_path": "Stage22DistributionSetup.tsx",
    "embedded_stage_number": 22
  }
]
```
