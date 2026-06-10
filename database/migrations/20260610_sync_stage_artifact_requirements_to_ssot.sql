-- Migration: Sync stage_artifact_requirements to the venture_stages SSOT
--            + deprecate the legacy stage-contract tables.
-- SD: SD-LEO-INFRA-STAGE-CONTRACT-REGISTRY-001 (FR-2)
-- @approved-by: codestreetlabs@gmail.com
--
-- Pure DML + COMMENT — no DDL. Idempotent: re-running converges to the same
-- state (the INSERT is derived live from venture_stages at apply time).
-- No DO blocks / no dollar-quoted bodies (single-statement friendly).
--
-- WHY:
--   stage_artifact_requirements was hand-seeded 2026-04-06/07 against the
--   pre-redesign pipeline and never updated. Confirmed stale rows (live audit
--   2026-06-10, scripts/validate-stage-contract-connectivity.mjs pre-fix run —
--   41 LEGACY_PARITY failures):
--     S15 blueprint_wireframes        -> wireframe_screens
--     S16 blueprint_api_contract      -> blueprint_financial_projection
--     S17 stage_17_analysis           -> system_devils_advocate_review
--     S18 build_system_prompt         -> 9 marketing_* types (never produced;
--                                        fallback mislabeling class: 412 rows
--                                        at S21 + 1,230 rows at S22)
--     S19 blueprint_sprint_plan       -> build_mvp_build
--     S20 build_mvp_build             -> code_quality_report
--     S21 build_security_audit        -> distribution_channel_config + distribution_ad_copy
--     S22 launch_test_plan            -> visual_device_screenshots + visual_social_graphics
--     S23 launch_uat_report           -> launch_readiness_checklist
--     S24 launch_deployment_runbook   -> launch_metrics
--     S25 launch_marketing_checklist  -> postlaunch_assumptions_vs_reality + postlaunch_user_feedback_summary
--     S26 launch_optimization_roadmap -> growth_playbook + growth_optimization_roadmap
--   plus missing multi-artifact rows at S12 (identity_brand_guidelines) and
--   S14 (data_model / erd_diagram / api_contract / schema_spec).
--
--   venture_stages.required_artifacts (text[]) is the established SSOT
--   (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001; fn_advance_venture_stage reads it
--   canonical-first since 20260504/20260529). This migration makes the legacy
--   table a faithful mirror so the fn_advance legacy-fallback path and any
--   residual reader can no longer disagree with the SSOT. Parity is enforced
--   going forward by the LEGACY_PARITY (C5) check in
--   scripts/validate-stage-contract-connectivity.mjs (CI: stage-contract-connectivity.yml).
--
-- PRE-IMAGE (2026-06-10, for manual rollback reference — data lines, not SQL):
--   1:truth_idea_brief 2:truth_ai_critique 3:truth_validation_decision
--   4:truth_competitive_analysis 5:truth_financial_model 6:engine_risk_matrix
--   7:engine_pricing_model 8:engine_business_model_canvas 9:engine_exit_strategy
--   10:identity_persona_brand 11:identity_naming_visual 12:identity_gtm_sales_strategy
--   13:blueprint_product_roadmap 14:blueprint_technical_architecture
--   15:blueprint_wireframes 16:blueprint_api_contract 17:stage_17_analysis
--   18:build_system_prompt 19:blueprint_sprint_plan 20:build_mvp_build
--   21:build_security_audit 22:launch_test_plan 23:launch_uat_report
--   24:launch_deployment_runbook 25:launch_marketing_checklist
--   26:launch_optimization_roadmap
--   (all rows: required_status='completed', is_blocking=true, timeout_hours=null)

BEGIN;

-- 1. Replace the legacy table content with rows derived from the SSOT.
--    DELETE+INSERT keeps this idempotent and review-simple; nothing references
--    stage_artifact_requirements.id (no FKs; ai_gen_provenance references the
--    table NAME in a CHECK constraint, not rows).
DELETE FROM stage_artifact_requirements;

INSERT INTO stage_artifact_requirements (stage_number, artifact_type, required_status, is_blocking, description)
SELECT
  vs.stage_number,
  t.artifact_type,
  'completed',
  true,
  t.artifact_type || ' required before leaving Stage ' || vs.stage_number || ' (' || vs.stage_name
    || ') — synced from venture_stages.required_artifacts (SSOT) by SD-LEO-INFRA-STAGE-CONTRACT-REGISTRY-001'
FROM venture_stages vs
CROSS JOIN LATERAL unnest(vs.required_artifacts) AS t(artifact_type)
WHERE vs.required_artifacts IS NOT NULL
ORDER BY vs.stage_number, t.artifact_type;

-- 2. Deprecate the legacy table (kept only as the fn_advance_venture_stage
--    legacy-fallback path; the eva-orchestrator read was repointed to
--    venture_stages in the same SD).
COMMENT ON TABLE stage_artifact_requirements IS
  'DEPRECATED (SD-LEO-INFRA-STAGE-CONTRACT-REGISTRY-001, 2026-06-10): superseded by venture_stages.required_artifacts (SSOT). Retained ONLY as the fn_advance_venture_stage legacy-fallback path. Do not hand-edit; content is a derived mirror of venture_stages and parity is enforced by the LEGACY_PARITY check in scripts/validate-stage-contract-connectivity.mjs. DROP candidate via the quarantine recipe in a follow-up SD.';

-- 3. Retire stage_data_contracts (2 rows from the dead 40-stage model,
--    Dec 2025; zero code readers — verified 2026-06-10).
UPDATE stage_data_contracts SET is_active = false, updated_at = now() WHERE is_active = true;

COMMENT ON TABLE stage_data_contracts IS
  'ABANDONED (SD-LEO-INFRA-STAGE-CONTRACT-REGISTRY-001, 2026-06-10): 2 rows reference the retired 40-stage workflow model; zero code readers. Stage I/O contracts live in venture_stages.required_artifacts (SSOT) + lib/eva/contracts/stage-contracts.js. DROP candidate via the quarantine recipe in a follow-up SD.';

COMMIT;

-- VERIFY (run after apply):
--   SELECT count(*) FROM stage_artifact_requirements;            -- expect 43 (26 stages, multi-artifact stages expanded; matches live venture_stages 2026-06-10)
--   SELECT count(*) FROM stage_artifact_requirements sar
--     JOIN venture_stages vs ON vs.stage_number = sar.stage_number
--    WHERE sar.artifact_type <> ALL (vs.required_artifacts);     -- expect 0
--   SELECT count(*) FROM stage_data_contracts WHERE is_active;   -- expect 0
--   node scripts/validate-stage-contract-connectivity.mjs        -- LEGACY_PARITY (C5) green
--
-- Rollback (manual): restore the 26 pre-image rows listed above with
--   required_status='completed', is_blocking=true, and re-set
--   stage_data_contracts.is_active=true for the 2 rows; then restore the
--   previous COMMENT ON TABLE texts (see git history of
--   database/migrations/20260406_create_stage_artifact_requirements.sql).
