---
category: database
status: approved
version: 1.0.0
author: rickfelix
last_updated: 2026-06-10
tags: [database]
---

# Committed-but-unapplied DB objects — sweep triage

**Source**: SD-LEO-INFRA-APPLY-RETIRE-COMMITTED-001 (2026-06-10), from the chairman-directed data-layer review scan (.claude/data-layer-scan-results.json, 7,640 files vs 708 live tables + 166 views).

**Method**: every scan phantom_tables entry re-verified live against pg_class (55 of 230 scan entries now EXIST — scan staleness), then intersected with committed defining SQL under database/ (52 hits), then classified by live-referencing-code count (archive/test/backup paths excluded).

## APPLIED by this SD (live hot-path breaks — all additive, via apply-migration.js 3-factor guard)

| Object | Migration | Live consumers |
|---|---|---|
| v_sd_completion_integrity | database/migrations/20260510_v_sd_completion_integrity.sql | scripts/audit-ghost-completed-sds.mjs, scripts/modules/sd-next/status-helpers.js, scripts/one-off/_apply-view-migration.mjs |
| bypass_ledger | database/migrations/20260516130001_add_bypass_ledger.sql | scripts/ci/audit-log-parity-check.mjs, scripts/modules/handoff/cli/cli-main.js, scripts/pocock/glossary-bypass-parity-check.mjs |
| contract_chain_links | database/migrations/20260516150000_add_contract_chain_links.sql | lib/contract-chain/walker.mjs |
| app_config_kill_switch_changes | database/migrations/20260516120001_app_config_kill_switch_audit.sql | scripts/lineage/audit-kill-switch-write.mjs |

**Post-apply verification**: all 4 present in pg_class and queryable; v_sd_completion_integrity returns 3,732 rows (2,422 flagged ghost-completed — predominantly pre-handoff-era SDs; consumers should window by completion date).

## DEFERRED — live-referenced, needs per-case APPLY-vs-RETIRE decision (follow-up)

| Object | Live refs | Sample consumers | Defining SQL |
|---|---|---|---|
| ci_cd_pipeline_status | 2 | scripts/devops-platform-architect-enhanced.js, api/webhooks/github-ci-status.js | database/migrations/leo-ci-cd-integration.sql |
| leo_session_tracking | 2 | scripts/leo-maintenance.js, scripts/session-manager-subagent.js | database/schema/complete_subagent_integration.sql |
| v_story_verification_status | 2 | src/api/stories/index.js, src/api/stories.js | database/manual-updates/20260124_update_views_remove_legacy_id.sql |
| sub_agent_activations | 1 | scripts/hook-subagent-activator.js | database/schema/complete_subagent_integration.sql |
| uat_reports | 1 | scripts/uat-quality-gate-checker.js | database/migrations/uat-structured-reports.sql |
| ci_cd_failure_resolutions | 1 | api/webhooks/github-ci-status.js | database/migrations/leo-ci-cd-integration.sql |
| product_requirements_v3 | 1 | src/agents/story-bootstrap.js | database/schema/010_ehg_backlog_schema.sql |
| v_sd_release_gate | 1 | src/api/stories.js | database/manual-updates/20260124_update_views_remove_legacy_id.sql |
| uat_finding_actions | 1 | scripts/uat-to-strategic-directive-ai.js | database/migrations/create-uat-sd-linking.sql |
| sd_claims | 1 | scripts/one-off/_crongenius-m1-state2.mjs | database/migrations/20251204_multi_session_coordination.sql |
| human_like_e2e_runs | 1 | scripts/human-like-e2e-retrospective.js | database/migrations/20251223_human_like_e2e_metrics.sql |
| human_like_e2e_test_metrics | 1 | scripts/human-like-e2e-retrospective.js | database/migrations/20251223_human_like_e2e_metrics.sql |
| human_like_e2e_improvements | 1 | scripts/human-like-e2e-retrospective.js | database/migrations/20251223_human_like_e2e_metrics.sql |
| leo_hook_feedback | 1 | scripts/leo-hook-feedback.js | database/schema/complete_subagent_integration.sql |
| circuit_breaker_state | 1 | scripts/leo-maintenance.js | database/schema-validation-eva-circuit-001.md |
| sub_agent_activation_stats | 1 | scripts/leo-maintenance.js | database/schema/complete_subagent_integration.sql |
| venture_separability_snapshots | 1 | scripts/separability-delta.js | database/migrations/20260305_venture_separability_snapshots.sql |
| stage_config | 1 | scripts/tmp/analyze-stage-ui-worker-asymmetry.mjs | database/backups/20260530_childF_legacy_stage_tables_backup.sql |
| uat_quality_gates_history | 1 | scripts/uat-quality-gate-checker.js | database/migrations/uat-structured-reports.sql |
| managed_applications | 1 | lib/cleanup/credentials.js | database/schema/002_multi_app_schema.sql |
| application_credentials | 1 | lib/cleanup/credentials.js | database/schema/002_multi_app_schema.sql |
| quality_finding_patterns | 1 | lib/eva/quality-findings/aggregator.js | database/migrations/20260429_quality_finding_patterns.sql |
| v_parallel_track_status | 1 | lib/session-manager.mjs | database/manual-updates/20260124_update_views_remove_legacy_id.sql |
| v_sd_parallel_opportunities | 1 | lib/session-manager.mjs | database/manual-updates/20260124_update_views_remove_legacy_id.sql |
| application_sync_history | 1 | lib/sync/sync-manager.js | database/schema/002_multi_app_schema.sql |
| ci_cd_monitoring_config | 1 | api/webhooks/github-ci-status.js | database/migrations/leo-ci-cd-integration.sql |

## RETIRE-CANDIDATES — zero live references (consumers archived/dead; SQL files are legacy designs)

- lifecycle_stage_config (database/backups/20260530_childF_legacy_stage_tables_backup.sql)
- content_catalogue (database/migrations/20251011_eva_content_catalogue_mvp.sql)
- test_failures (database/schema/005_test_failures_schema.sql)
- content_versions (database/migrations/032_content_forge_tables.sql)
- leo_phase_ci_cd_gates (database/migrations/leo-ci-cd-integration.sql)
- conversation_content_links (database/migrations/20251011_eva_content_catalogue_mvp.sql)
- eva_conversations (database/migrations/20251011_eva_content_catalogue_mvp.sql)
- prd_playwright_specifications (database/schema/009_prd_playwright_integration.sql)
- prd_playwright_scenarios (database/schema/009_prd_playwright_integration.sql)
- content_layout_assignments (database/migrations/20251011_eva_content_catalogue_mvp.sql)
- content_item_metadata (database/migrations/20251011_eva_content_catalogue_mvp.sql)
- github_webhook_events (database/migrations/leo-ci-cd-integration.sql)
- v_sd_test_readiness (database/migrations/20251210_unified_test_evidence.sql)
- v_improvement_board_verdicts (database/migrations/20260202_model_families_board_vetting.sql)
- auto_proceed_sessions (database/manual-updates/EXECUTE_THIS_20260125_auto_proceed_sessions.sql)
- v_active_auto_proceed_sessions (database/manual-updates/EXECUTE_THIS_20260125_auto_proceed_sessions.sql)
- sub_agent_queue (database/migrations/create-subagent-automation.sql)
- v_pending_subagent_work (database/migrations/20260125_fix_subagent_queue_sd_id_type.sql)
- uat_report_recommendations (database/migrations/uat-structured-reports.sql)
- prd_test_fixtures (database/schema/009_prd_playwright_integration.sql)
- prd_test_verification_mapping (database/schema/009_prd_playwright_integration.sql)
- vision_qa_sessions (database/schema/003_vision_qa_schema.sql)

_Do NOT apply retire-candidates: their referencing code is dead. SQL-file cleanup belongs to the scripts-sprawl/archive program._
