-- @approved-by: codestreetlabs@gmail.com
--
-- 20260607_venture_artifacts_distribution_types.sql
-- SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-B (FR-4 enablement)
--
-- Add the Stage-22 (Distribution Setup) artifact_type values to the
-- venture_artifacts_artifact_type_check CHECK constraint.
--
-- WHY: The CHECK constraint is an explicit allow-list. S22's existing inserts
-- ('distribution_channel_config', 'distribution_ad_copy', 'distribution_skip_marker')
-- are NOT in the allow-list, so every insert SILENTLY FAILS the constraint
-- (0 distribution_* rows persisted in prod — confirmed via live probe). The new
-- chairman spend_approval gate is hollow if the chairman has no drafted
-- channels/budget/copy to review, so these drafts MUST persist.
--
-- Approach: DROP the existing constraint and re-ADD it with the SAME full set of
-- allowed values PLUS the three S22 distribution types. The value list below is
-- the live pg_get_constraintdef output for venture_artifacts_artifact_type_check
-- (post-S21, captured 2026-06-07 and verified live: visual_final_assets is
-- accepted), kept verbatim and sorted, with the three new values inserted in
-- sorted position (after 'design_token_manifest', before 'economic_lens').
-- No existing value is removed.

BEGIN;

ALTER TABLE venture_artifacts
  DROP CONSTRAINT venture_artifacts_artifact_type_check;

ALTER TABLE venture_artifacts
  ADD CONSTRAINT venture_artifacts_artifact_type_check
  CHECK (((artifact_type)::text = ANY (ARRAY[
    'blueprint_api_contract'::text,
    'blueprint_data_model'::text,
    'blueprint_erd_diagram'::text,
    'blueprint_financial_projection'::text,
    'blueprint_launch_readiness'::text,
    'blueprint_positioning_brief'::text,
    'blueprint_product_roadmap'::text,
    'blueprint_project_plan'::text,
    'blueprint_promotion_gate'::text,
    'blueprint_review_summary'::text,
    'blueprint_risk_register'::text,
    'blueprint_schema_spec'::text,
    'blueprint_sprint_plan'::text,
    'blueprint_technical_architecture'::text,
    'blueprint_token_manifest'::text,
    'blueprint_user_story_pack'::text,
    'blueprint_wireframes'::text,
    'build_cicd_config'::text,
    'build_mvp_build'::text,
    'build_security_audit'::text,
    'build_system_prompt'::text,
    'build_test_coverage_report'::text,
    'design_token_manifest'::text,
    -- NEW: Stage-22 (Distribution Setup) spend_approval types (SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-B)
    'distribution_ad_copy'::text,
    'distribution_channel_config'::text,
    'distribution_skip_marker'::text,
    'economic_lens'::text,
    'engine_business_model_canvas'::text,
    'engine_exit_strategy'::text,
    'engine_pricing_model'::text,
    'engine_revenue_model'::text,
    'engine_risk_assessment'::text,
    'engine_risk_matrix'::text,
    'growth_optimization_roadmap'::text,
    'growth_playbook'::text,
    'identity_brand_guidelines'::text,
    'identity_brand_name'::text,
    'identity_gtm_sales_strategy'::text,
    'identity_logo_image'::text,
    'identity_naming_visual'::text,
    'identity_persona_brand'::text,
    'intake_venture_analysis'::text,
    'launch_analytics_dashboard'::text,
    'launch_assumptions_vs_reality'::text,
    'launch_churn_triggers'::text,
    'launch_deployment_runbook'::text,
    'launch_health_scoring'::text,
    'launch_launch_metrics'::text,
    'launch_marketing_checklist'::text,
    'launch_metrics'::text,
    'launch_optimization_roadmap'::text,
    'launch_production_app'::text,
    'launch_readiness_checklist'::text,
    'launch_retention_playbook'::text,
    'launch_test_plan'::text,
    'launch_uat_report'::text,
    'launch_user_feedback_summary'::text,
    'lifecycle_sd_bridge'::text,
    'marketing_app_store_desc'::text,
    'marketing_blog_draft'::text,
    'marketing_email_onboarding'::text,
    'marketing_email_reengagement'::text,
    'marketing_email_welcome'::text,
    'marketing_landing_hero'::text,
    'marketing_seo_meta'::text,
    'marketing_social_posts'::text,
    'marketing_tagline'::text,
    'post_lifecycle_decision'::text,
    'postlaunch_analytics_dashboard'::text,
    'postlaunch_assumptions_vs_reality'::text,
    'postlaunch_user_feedback_summary'::text,
    's17_approved'::text,
    's17_approved_png'::text,
    's17_archetypes'::text,
    's17_design_system'::text,
    's17_fill_screen'::text,
    's17_preview'::text,
    's17_qa_report'::text,
    's17_session_state'::text,
    's17_strategy_recommendation'::text,
    's17_strategy_stats'::text,
    's17_variant_scores'::text,
    's17_variant_wip'::text,
    'stage_0_analysis'::text,
    'stage_10_analysis'::text,
    'stage_11_analysis'::text,
    'stage_12_analysis'::text,
    'stage_13_analysis'::text,
    'stage_14_analysis'::text,
    'stage_15_analysis'::text,
    'stage_16_analysis'::text,
    'stage_17_analysis'::text,
    'stage_18_analysis'::text,
    'stage_19_analysis'::text,
    'stage_1_analysis'::text,
    'stage_20_analysis'::text,
    'stage_21_analysis'::text,
    'stage_22_analysis'::text,
    'stage_23_analysis'::text,
    'stage_24_analysis'::text,
    'stage_25_analysis'::text,
    'stage_26_analysis'::text,
    'stage_2_analysis'::text,
    'stage_3_analysis'::text,
    'stage_4_analysis'::text,
    'stage_5_analysis'::text,
    'stage_6_analysis'::text,
    'stage_7_analysis'::text,
    'stage_8_analysis'::text,
    'stage_9_analysis'::text,
    'stitch_budget'::text,
    'stitch_curation'::text,
    'stitch_design_export'::text,
    'stitch_project'::text,
    'stitch_qa_report'::text,
    'system_devils_advocate_review'::text,
    'truth_ai_critique'::text,
    'truth_competitive_analysis'::text,
    'truth_financial_model'::text,
    'truth_idea_brief'::text,
    'truth_problem_statement'::text,
    'truth_target_market_analysis'::text,
    'truth_validation_decision'::text,
    'truth_value_proposition'::text,
    'value_multiplier_assessment'::text,
    'visual_assets_skipped'::text,
    'visual_device_screenshots'::text,
    'visual_final_assets'::text,
    'visual_social_graphics'::text,
    'wireframe_screens'::text
  ])));

COMMIT;
