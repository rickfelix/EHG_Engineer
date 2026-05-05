-- =============================================================================
-- Migration: Extend venture_artifacts.artifact_type CHECK to accept
--            postlaunch_assumptions_vs_reality, postlaunch_user_feedback_summary,
--            postlaunch_analytics_dashboard (Stage 25 namespace)
-- SD: SD-LEO-FEAT-STAGE-POST-LAUNCH-001 (FR-2)
-- Date: 2026-05-04
--
-- Purpose:
--   Eliminate launch_* namespace collision between S22-S24 (launch ops) and
--   S25 (post-launch review). Adds 3 new postlaunch_* keys while preserving
--   all 99 existing keys verbatim — including legacy launch_assumptions_vs_reality,
--   launch_user_feedback_summary, and launch_analytics_dashboard during grace
--   window. Backwards-compatible: legacy launch_* consumers continue to work;
--   S25 gradually migrates to postlaunch_* prefix.
--
-- DATABASE evidence (sub_agent_execution_results 5b72213e-8945-4c55-884e-3936e13a545d):
--   Backfill scope = 0 rows (live query confirmed). 6 prior migrations preserve
--   legacy launch_* names verbatim — rename is non-breaking.
--
-- PostgreSQL CHECK constraints cannot be ALTER-extended; must DROP+RECREATE
-- with the FULL list verbatim. Source: 20260504_extend_venture_artifacts_visual_skipped.sql
-- (lines 30-93, 99 keys).
--
-- Idempotent: DROP IF EXISTS + ADD CONSTRAINT. Re-run safe.
--
-- Apply path (Windows canonical, raw pg pooler hits SELF_SIGNED_CERT_IN_CHAIN):
--   supabase db query --linked --file database/migrations/20260504_extend_venture_artifacts_postlaunch_types.sql
--
-- Rollback:
--   Restore prior list from 20260504_extend_venture_artifacts_visual_skipped.sql.
-- =============================================================================

BEGIN;

ALTER TABLE venture_artifacts DROP CONSTRAINT IF EXISTS venture_artifacts_artifact_type_check;

ALTER TABLE venture_artifacts ADD CONSTRAINT venture_artifacts_artifact_type_check
CHECK (((artifact_type)::text = ANY (ARRAY[
  -- Intake (Stage 0)
  'intake_venture_analysis',
  -- Truth (Stages 1-5)
  'truth_idea_brief', 'truth_ai_critique', 'truth_validation_decision',
  'truth_competitive_analysis', 'truth_financial_model',
  'truth_problem_statement', 'truth_target_market_analysis', 'truth_value_proposition',
  -- Engine (Stages 6-9)
  'engine_risk_matrix', 'engine_pricing_model', 'engine_business_model_canvas',
  'engine_exit_strategy', 'engine_risk_assessment', 'engine_revenue_model',
  -- Identity (Stages 10-12)
  'identity_persona_brand', 'identity_brand_guidelines', 'identity_naming_visual',
  'identity_brand_name', 'identity_gtm_sales_strategy',
  -- Blueprint (Stages 13-17)
  'blueprint_product_roadmap', 'blueprint_technical_architecture', 'blueprint_data_model',
  'blueprint_erd_diagram', 'blueprint_api_contract', 'blueprint_schema_spec',
  'blueprint_risk_register', 'blueprint_user_story_pack', 'blueprint_wireframes',
  'blueprint_financial_projection', 'blueprint_launch_readiness', 'blueprint_sprint_plan',
  'blueprint_promotion_gate', 'blueprint_project_plan', 'blueprint_review_summary',
  -- Build (Stages 18-22) — existing
  'build_system_prompt', 'build_cicd_config', 'build_security_audit', 'build_mvp_build',
  'build_test_coverage_report',
  -- Marketing Copy Studio (Stage 18)
  'marketing_tagline', 'marketing_app_store_desc', 'marketing_landing_hero',
  'marketing_email_welcome', 'marketing_email_onboarding', 'marketing_email_reengagement',
  'marketing_social_posts', 'marketing_seo_meta', 'marketing_blog_draft',
  -- Code Quality Gate (Stage 20)
  'code_quality_report',
  -- Visual Assets (Stage 21)
  'visual_device_screenshots', 'visual_social_graphics',
  'visual_assets_skipped',
  -- Distribution Setup (Stage 22)
  'distribution_channel_config', 'distribution_ad_copy',
  -- Launch (Stages 23-26) — existing legacy launch_* preserved during grace window
  'launch_test_plan', 'launch_uat_report', 'launch_deployment_runbook',
  'launch_marketing_checklist', 'launch_analytics_dashboard', 'launch_health_scoring',
  'launch_churn_triggers', 'launch_retention_playbook', 'launch_optimization_roadmap',
  'launch_assumptions_vs_reality', 'launch_launch_metrics', 'launch_user_feedback_summary',
  'launch_production_app',
  'launch_readiness_checklist',
  -- Post-Launch Review (Stage 25) — NEW for SD-LEO-FEAT-STAGE-POST-LAUNCH-001 FR-2
  -- Eliminates launch_* namespace collision with S22-S24. Legacy launch_* keys above
  -- preserved during grace window; separate post-grace SD will DROP legacy keys.
  'postlaunch_assumptions_vs_reality',
  'postlaunch_user_feedback_summary',
  'postlaunch_analytics_dashboard',
  -- Growth Playbook (Stage 26)
  'growth_playbook',
  -- Cross-cutting / System
  'system_devils_advocate_review',
  -- Gate & Analysis artifacts
  'value_multiplier_assessment',
  'economic_lens',
  'lifecycle_sd_bridge',
  'post_lifecycle_decision',
  -- Stitch integration (legacy, preserved)
  'stitch_project', 'stitch_curation', 'stitch_budget',
  -- S17 Design stage legacy artifacts (in use in production data)
  's17_archetypes', 's17_session_state', 's17_strategy_recommendation', 's17_variant_wip',
  'stage_17_approved_desktop', 'wireframe_screens',
  -- Dynamic stage analysis artifacts
  'stage_0_analysis', 'stage_1_analysis', 'stage_2_analysis', 'stage_3_analysis',
  'stage_4_analysis', 'stage_5_analysis', 'stage_6_analysis', 'stage_7_analysis',
  'stage_8_analysis', 'stage_9_analysis', 'stage_10_analysis', 'stage_11_analysis',
  'stage_12_analysis', 'stage_13_analysis', 'stage_14_analysis', 'stage_15_analysis',
  'stage_16_analysis', 'stage_17_analysis', 'stage_18_analysis', 'stage_19_analysis',
  'stage_20_analysis', 'stage_21_analysis', 'stage_22_analysis', 'stage_23_analysis',
  'stage_24_analysis', 'stage_25_analysis', 'stage_26_analysis'
]::text[])));

-- Verification.
DO $$
DECLARE
  v_check_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_check_def
  FROM pg_constraint
  WHERE conrelid = 'venture_artifacts'::regclass
    AND conname = 'venture_artifacts_artifact_type_check';

  IF v_check_def IS NULL THEN
    RAISE EXCEPTION 'CHECK CONSTRAINT FAIL: venture_artifacts_artifact_type_check missing after recreate';
  END IF;

  -- Confirm 3 new postlaunch_* keys present.
  IF v_check_def NOT LIKE '%postlaunch_assumptions_vs_reality%' THEN
    RAISE EXCEPTION 'CHECK CONSTRAINT FAIL: postlaunch_assumptions_vs_reality not present in recreated CHECK';
  END IF;
  IF v_check_def NOT LIKE '%postlaunch_user_feedback_summary%' THEN
    RAISE EXCEPTION 'CHECK CONSTRAINT FAIL: postlaunch_user_feedback_summary not present in recreated CHECK';
  END IF;
  IF v_check_def NOT LIKE '%postlaunch_analytics_dashboard%' THEN
    RAISE EXCEPTION 'CHECK CONSTRAINT FAIL: postlaunch_analytics_dashboard not present in recreated CHECK';
  END IF;

  -- Sanity: ensure pre-existing legacy launch_* preserved (grace window).
  IF v_check_def NOT LIKE '%launch_assumptions_vs_reality%' THEN
    RAISE EXCEPTION 'CHECK CONSTRAINT REGRESSION: legacy launch_assumptions_vs_reality removed during recreate';
  END IF;
  IF v_check_def NOT LIKE '%launch_user_feedback_summary%' THEN
    RAISE EXCEPTION 'CHECK CONSTRAINT REGRESSION: legacy launch_user_feedback_summary removed during recreate';
  END IF;
  IF v_check_def NOT LIKE '%launch_analytics_dashboard%' THEN
    RAISE EXCEPTION 'CHECK CONSTRAINT REGRESSION: legacy launch_analytics_dashboard removed during recreate';
  END IF;

  -- Sanity: ensure adjacent stage types preserved (no regression on S21/S22).
  IF v_check_def NOT LIKE '%visual_assets_skipped%' THEN
    RAISE EXCEPTION 'CHECK CONSTRAINT REGRESSION: visual_assets_skipped (S21) removed during recreate';
  END IF;
  IF v_check_def NOT LIKE '%distribution_channel_config%' THEN
    RAISE EXCEPTION 'CHECK CONSTRAINT REGRESSION: distribution_channel_config (S22) removed during recreate';
  END IF;

  RAISE NOTICE 'CHECK CONSTRAINT OK: 3 postlaunch_* keys added; legacy launch_* preserved during grace window';
END $$;

COMMIT;
