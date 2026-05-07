-- Migration: Stage 25 Post-Launch artifact types — REGENERATED FROM LIVE SNAPSHOT
-- SD-LEO-FEAT-STAGE-POST-LAUNCH-002 / FR-6
-- Generated 2026-05-07 from pg_get_constraintdef(oid) live snapshot (151 keys) + 3 new postlaunch_* keys = 154 total
--
-- WHY REGENERATED: Original staged file (database/migrations/20260504_extend_venture_artifacts_postlaunch_types.sql)
-- was authored 2026-05-04 with a 114-key snapshot. Live state has evolved 39+ keys since.
-- Naive DROP+RECREATE would silently drop 41 valid artifact types including
-- architecture_plan, vision_document, soul_document, s17_*, stitch_*, stage1..stage9_optimization, etc.
--
-- This file uses the LIVE 151-key snapshot from pg_get_constraintdef + appends 3 new keys.
-- BEGIN/COMMIT-wrapped, ACCESS EXCLUSIVE lock, idempotent.
--
-- Verified by: validation-agent VAL-PLAN-CRIT-001, database-agent live snapshot evidence 3aed1559

BEGIN;

-- 1. Drop existing CHECK constraint (idempotent: IF EXISTS)
ALTER TABLE venture_artifacts DROP CONSTRAINT IF EXISTS venture_artifacts_artifact_type_check;

-- 2. Re-add CHECK constraint with 154 keys (151 live + 3 new postlaunch_*)
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
  'postlaunch_analytics_dashboard'::character varying
])::text[])));

-- 3. Update lifecycle_stage_config row 25 — column-specific UPDATE (NOT UPSERT)
-- Targets ONLY required_artifacts; preserves depends_on, metadata, phase_name, stage_name, updated_at
UPDATE lifecycle_stage_config
SET required_artifacts = ARRAY['postlaunch_assumptions_vs_reality', 'postlaunch_user_feedback_summary']::text[]
WHERE stage_number = 25;

-- 4. DO block assertions: verify all 41 at-risk keys preserved + 3 new keys present
DO $$
DECLARE
  def TEXT;
  at_risk_keys TEXT[] := ARRAY[
    'architecture_plan',
    'blueprint_token_manifest',
    'build_brief',
    'design_token_manifest',
    'genesis_scaffold',
    'identity_logo_image',
    's11_identity',
    's17_approved',
    's17_approved_png',
    's17_design_system',
    's17_fill_screen',
    's17_heartbeat',
    's17_preview',
    's17_qa_report',
    's17_strategy_stats',
    's17_variant_failed',
    's17_variant_scores',
    'soul_document',
    'stage10_finalization',
    'stage11_identity',
    'stage12_guidelines',
    'stage13_implementation',
    'stage14_review',
    'stage15_wireframes',
    'stage16_soul',
    'stage18_sprint',
    'stage19_deployment',
    'stage1_raw_research',
    'stage2_market_analysis',
    'stage3_competitive',
    'stage4_strategy',
    'stage5_positioning',
    'stage6_validation',
    'stage7_formulation',
    'stage8_evaluation',
    'stage9_optimization',
    'stage_17_approved_mobile',
    'stage_17_refined',
    'stitch_design_export',
    'stitch_qa_report',
    'vision_document'
  ];
  new_keys TEXT[] := ARRAY['postlaunch_assumptions_vs_reality','postlaunch_user_feedback_summary','postlaunch_analytics_dashboard'];
  k TEXT;
  lifecycle_required TEXT[];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'venture_artifacts_artifact_type_check';

  IF def IS NULL THEN
    RAISE EXCEPTION 'venture_artifacts_artifact_type_check constraint not found post-recreate';
  END IF;

  -- Verify all 41 at-risk keys preserved
  FOREACH k IN ARRAY at_risk_keys LOOP
    IF def NOT LIKE '%''' || k || '''%' THEN
      RAISE EXCEPTION 'AT-RISK KEY MISSING POST-MIGRATION: %', k;
    END IF;
  END LOOP;

  -- Verify all 3 new keys present
  FOREACH k IN ARRAY new_keys LOOP
    IF def NOT LIKE '%''' || k || '''%' THEN
      RAISE EXCEPTION 'NEW KEY MISSING POST-MIGRATION: %', k;
    END IF;
  END LOOP;

  -- Verify lifecycle_stage_config row 25 required_artifacts updated
  SELECT required_artifacts INTO lifecycle_required FROM lifecycle_stage_config WHERE stage_number = 25;
  IF NOT (lifecycle_required @> ARRAY['postlaunch_assumptions_vs_reality','postlaunch_user_feedback_summary']::text[]) THEN
    RAISE EXCEPTION 'lifecycle_stage_config row 25 required_artifacts UPDATE failed';
  END IF;

  RAISE NOTICE 'Migration applied successfully: 154 keys total, all 41 at-risk preserved, 3 new keys added, row 25 required_artifacts updated';
END $$;

COMMIT;
