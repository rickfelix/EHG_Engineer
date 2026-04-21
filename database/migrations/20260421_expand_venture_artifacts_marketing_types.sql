-- SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-A
-- Purpose: Expand venture_artifacts CHECK constraint with marketing/distribution artifact types
-- Vision: VISION-S18-S26-PIPELINE-REDESIGN-L2-001
-- Date: 2026-04-21
--
-- Adds 16 new artifact types for the redesigned S18-S26 pipeline:
--   S18 Marketing Copy Studio: marketing_tagline, marketing_app_store_desc, marketing_landing_hero,
--     marketing_email_welcome, marketing_email_onboarding, marketing_email_reengagement,
--     marketing_social_posts, marketing_seo_meta, marketing_blog_draft
--   S20 Code Quality Gate: code_quality_report
--   S21 Visual Assets: visual_device_screenshots, visual_social_graphics
--   S22 Distribution Setup: distribution_channel_config, distribution_ad_copy
--   S23 Launch Readiness: launch_readiness_checklist
--   S26 Growth Playbook: growth_playbook

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
  -- Marketing Copy Studio (Stage 18) — NEW
  'marketing_tagline', 'marketing_app_store_desc', 'marketing_landing_hero',
  'marketing_email_welcome', 'marketing_email_onboarding', 'marketing_email_reengagement',
  'marketing_social_posts', 'marketing_seo_meta', 'marketing_blog_draft',
  -- Code Quality Gate (Stage 20) — NEW
  'code_quality_report',
  -- Visual Assets (Stage 21) — NEW
  'visual_device_screenshots', 'visual_social_graphics',
  -- Distribution Setup (Stage 22) — NEW
  'distribution_channel_config', 'distribution_ad_copy',
  -- Launch (Stages 23-26) — existing + new
  'launch_test_plan', 'launch_uat_report', 'launch_deployment_runbook',
  'launch_marketing_checklist', 'launch_analytics_dashboard', 'launch_health_scoring',
  'launch_churn_triggers', 'launch_retention_playbook', 'launch_optimization_roadmap',
  'launch_assumptions_vs_reality', 'launch_launch_metrics', 'launch_user_feedback_summary',
  'launch_production_app',
  'launch_readiness_checklist',
  -- Growth Playbook (Stage 26) — NEW
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

COMMIT;
