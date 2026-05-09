-- Migration: Stage 26 Growth Playbook artifact types — REGENERATED FROM LIVE SNAPSHOT
-- SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 / Part B
-- Generated 2026-05-09 from pg_get_constraintdef(oid) live snapshot (155 keys) + 1 new key (growth_optimization_roadmap) = 156 total
--
-- WHY REGENERATED: Mirrors 20260507_extend_venture_artifacts_postlaunch_v2_regenerated.sql precedent.
-- Live state has evolved since the 154-key POST-LAUNCH-002 snapshot (added 'launch_metrics' via
-- SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001). Naive DROP+RECREATE without a fresh snapshot would silently
-- drop valid artifact types. This file uses the LIVE 155-key snapshot + 1 new key.
--
-- Pre-flight (verified 2026-05-09):
--   - venture_artifacts WHERE artifact_type='launch_optimization_roadmap' has 0 rows
--   - venture_artifacts WHERE artifact_type='growth_optimization_roadmap' has 0 rows
--   - venture_artifacts WHERE artifact_type='growth_playbook' has 0 rows
--
-- launch_optimization_roadmap is RETAINED (deprecated alias for one release, not removed).
-- ACCESS EXCLUSIVE lock, idempotent.

BEGIN;

-- 1. Drop existing CHECK constraint (idempotent: IF EXISTS)
ALTER TABLE venture_artifacts DROP CONSTRAINT IF EXISTS venture_artifacts_artifact_type_check;

-- 2. Re-add CHECK constraint with 156 keys (155 live + 1 new growth_optimization_roadmap)
ALTER TABLE venture_artifacts ADD CONSTRAINT venture_artifacts_artifact_type_check
CHECK (((artifact_type)::text = ANY ((ARRAY[
  'intake_venture_analysis'::character varying,
  'truth_idea_brief'::character varying,
  'truth_ai_critique'::character varying,
  'truth_validation_decision'::character varying,
  'truth_competitive_analysis'::character varying,
  'truth_financial_model'::character varying,
  'truth_problem_statement'::character varying,
  'truth_target_market_analysis'::character varying,
  'truth_value_proposition'::character varying,
  'engine_risk_matrix'::character varying,
  'engine_pricing_model'::character varying,
  'engine_business_model_canvas'::character varying,
  'engine_exit_strategy'::character varying,
  'engine_risk_assessment'::character varying,
  'engine_revenue_model'::character varying,
  'identity_persona_brand'::character varying,
  'identity_brand_guidelines'::character varying,
  'identity_naming_visual'::character varying,
  'identity_brand_name'::character varying,
  'identity_gtm_sales_strategy'::character varying,
  'identity_logo_image'::character varying,
  'blueprint_product_roadmap'::character varying,
  'blueprint_technical_architecture'::character varying,
  'blueprint_data_model'::character varying,
  'blueprint_erd_diagram'::character varying,
  'blueprint_api_contract'::character varying,
  'blueprint_schema_spec'::character varying,
  'blueprint_risk_register'::character varying,
  'blueprint_user_story_pack'::character varying,
  'blueprint_wireframes'::character varying,
  'blueprint_financial_projection'::character varying,
  'blueprint_launch_readiness'::character varying,
  'blueprint_sprint_plan'::character varying,
  'blueprint_promotion_gate'::character varying,
  'blueprint_project_plan'::character varying,
  'blueprint_review_summary'::character varying,
  'blueprint_token_manifest'::character varying,
  'build_system_prompt'::character varying,
  'build_cicd_config'::character varying,
  'build_security_audit'::character varying,
  'build_mvp_build'::character varying,
  'build_test_coverage_report'::character varying,
  'build_brief'::character varying,
  'marketing_tagline'::character varying,
  'marketing_app_store_desc'::character varying,
  'marketing_landing_hero'::character varying,
  'marketing_email_welcome'::character varying,
  'marketing_email_onboarding'::character varying,
  'marketing_email_reengagement'::character varying,
  'marketing_social_posts'::character varying,
  'marketing_seo_meta'::character varying,
  'marketing_blog_draft'::character varying,
  'code_quality_report'::character varying,
  'visual_device_screenshots'::character varying,
  'visual_social_graphics'::character varying,
  'distribution_channel_config'::character varying,
  'distribution_ad_copy'::character varying,
  'launch_test_plan'::character varying,
  'launch_uat_report'::character varying,
  'launch_deployment_runbook'::character varying,
  'launch_marketing_checklist'::character varying,
  'launch_analytics_dashboard'::character varying,
  'launch_health_scoring'::character varying,
  'launch_churn_triggers'::character varying,
  'launch_retention_playbook'::character varying,
  'launch_optimization_roadmap'::character varying,
  'launch_assumptions_vs_reality'::character varying,
  'launch_launch_metrics'::character varying,
  'launch_user_feedback_summary'::character varying,
  'launch_production_app'::character varying,
  'launch_readiness_checklist'::character varying,
  'growth_playbook'::character varying,
  'system_devils_advocate_review'::character varying,
  'value_multiplier_assessment'::character varying,
  'economic_lens'::character varying,
  'lifecycle_sd_bridge'::character varying,
  'post_lifecycle_decision'::character varying,
  'stitch_project'::character varying,
  'stitch_curation'::character varying,
  'stitch_budget'::character varying,
  'stitch_design_export'::character varying,
  'stitch_qa_report'::character varying,
  's17_archetypes'::character varying,
  's17_session_state'::character varying,
  's17_strategy_recommendation'::character varying,
  's17_variant_wip'::character varying,
  's17_approved'::character varying,
  's17_approved_png'::character varying,
  's17_design_system'::character varying,
  's17_fill_screen'::character varying,
  's17_preview'::character varying,
  's17_qa_report'::character varying,
  's17_strategy_stats'::character varying,
  's17_variant_scores'::character varying,
  'stage_17_approved_desktop'::character varying,
  'stage_17_approved_mobile'::character varying,
  'stage_17_refined'::character varying,
  's11_identity'::character varying,
  'stage10_finalization'::character varying,
  'stage11_identity'::character varying,
  'stage12_guidelines'::character varying,
  'stage13_implementation'::character varying,
  'stage14_review'::character varying,
  'stage15_wireframes'::character varying,
  'stage16_soul'::character varying,
  'stage18_sprint'::character varying,
  'stage19_deployment'::character varying,
  'stage1_raw_research'::character varying,
  'stage2_market_analysis'::character varying,
  'stage3_competitive'::character varying,
  'stage4_strategy'::character varying,
  'stage5_positioning'::character varying,
  'stage6_validation'::character varying,
  'stage7_formulation'::character varying,
  'stage8_evaluation'::character varying,
  'stage9_optimization'::character varying,
  'architecture_plan'::character varying,
  'design_token_manifest'::character varying,
  'genesis_scaffold'::character varying,
  'soul_document'::character varying,
  'vision_document'::character varying,
  'wireframe_screens'::character varying,
  'stage_0_analysis'::character varying,
  'stage_1_analysis'::character varying,
  'stage_2_analysis'::character varying,
  'stage_3_analysis'::character varying,
  'stage_4_analysis'::character varying,
  'stage_5_analysis'::character varying,
  'stage_6_analysis'::character varying,
  'stage_7_analysis'::character varying,
  'stage_8_analysis'::character varying,
  'stage_9_analysis'::character varying,
  'stage_10_analysis'::character varying,
  'stage_11_analysis'::character varying,
  'stage_12_analysis'::character varying,
  'stage_13_analysis'::character varying,
  'stage_14_analysis'::character varying,
  'stage_15_analysis'::character varying,
  'stage_16_analysis'::character varying,
  'stage_17_analysis'::character varying,
  'stage_18_analysis'::character varying,
  'stage_19_analysis'::character varying,
  'stage_20_analysis'::character varying,
  'stage_21_analysis'::character varying,
  'stage_22_analysis'::character varying,
  'stage_23_analysis'::character varying,
  'stage_24_analysis'::character varying,
  'stage_25_analysis'::character varying,
  'stage_26_analysis'::character varying,
  's17_heartbeat'::character varying,
  's17_variant_failed'::character varying,
  'postlaunch_assumptions_vs_reality'::character varying,
  'postlaunch_user_feedback_summary'::character varying,
  'postlaunch_analytics_dashboard'::character varying,
  'launch_metrics'::character varying,
  'growth_optimization_roadmap'::character varying
])::text[])));

-- 3. DO block assertions: verify launch_optimization_roadmap retained + growth_optimization_roadmap added
DO $$
DECLARE
  def TEXT;
  required_keys TEXT[] := ARRAY['launch_optimization_roadmap', 'growth_optimization_roadmap', 'growth_playbook', 'launch_metrics'];
  k TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'venture_artifacts_artifact_type_check';

  IF def IS NULL THEN
    RAISE EXCEPTION 'venture_artifacts_artifact_type_check constraint not found post-recreate';
  END IF;

  FOREACH k IN ARRAY required_keys LOOP
    IF def NOT LIKE '%''' || k || '''%' THEN
      RAISE EXCEPTION 'REQUIRED KEY MISSING POST-MIGRATION: %', k;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration applied successfully: 156 keys total, launch_optimization_roadmap retained, growth_optimization_roadmap added';
END $$;

COMMIT;
