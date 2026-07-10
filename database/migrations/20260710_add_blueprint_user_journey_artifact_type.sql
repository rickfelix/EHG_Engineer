-- @approved-by: codestreetlabs@gmail.com
-- Approval context: chairman (Rick Felix) via Adam advisory d2e673a8 (2026-07-07, "chairman-approved
--   to AUTHOR") and the 2026-07-10 un-fence (sequencing premise met -- APA children A-D shipped).
--   SD-LEO-INFRA-FIRST-CLASS-USER-001. Additive CHECK widening only (one new allowed value), zero
--   rows touched, reversible by re-adding the prior constraint (definition preserved below verbatim
--   minus the one addition). Mirrors the pattern established in
--   20260704_add_build_deviation_record_artifact_type.sql.
--
-- Adds 'blueprint_user_journey' to venture_artifacts_artifact_type_check -- the Stage-15 artifact
-- type for ordered, per-(persona,goal) end-to-end user journeys, synthesized from the venture's
-- existing story-pack + wireframes + IA. Schema: docs/design/user-journey-artifact-schema.md.
--
-- ADDITIVE ONLY: widens the allowlist by one value; no rows touched.
ALTER TABLE venture_artifacts
  DROP CONSTRAINT venture_artifacts_artifact_type_check;

ALTER TABLE venture_artifacts
  ADD CONSTRAINT venture_artifacts_artifact_type_check CHECK ((artifact_type)::text = ANY (ARRAY[
    'blueprint_api_contract','blueprint_data_model','blueprint_erd_diagram','blueprint_financial_projection',
    'blueprint_launch_readiness','blueprint_positioning_brief','blueprint_product_roadmap','blueprint_project_plan',
    'blueprint_promotion_gate','blueprint_review_summary','blueprint_risk_register','blueprint_schema_spec',
    'blueprint_sprint_plan','blueprint_technical_architecture','blueprint_token_manifest','blueprint_user_journey',
    'blueprint_user_story_pack','blueprint_wireframes','build_cicd_config','build_deviation_record','build_mvp_build',
    'build_security_audit','build_system_prompt','build_test_coverage_report','code_quality_report',
    'design_token_manifest','distribution_ad_copy','distribution_channel_config','distribution_skip_marker',
    'economic_lens','engine_business_model_canvas','engine_exit_strategy','engine_pricing_model',
    'engine_revenue_model','engine_risk_assessment','engine_risk_matrix','growth_optimization_roadmap',
    'growth_playbook','identity_brand_guidelines','identity_brand_name','identity_gtm_sales_strategy',
    'identity_logo_image','identity_naming_visual','identity_persona_brand','intake_venture_analysis',
    'launch_analytics_dashboard','launch_assumptions_vs_reality','launch_churn_triggers','launch_deployment_runbook',
    'launch_health_scoring','launch_launch_metrics','launch_marketing_checklist','launch_metrics',
    'launch_optimization_roadmap','launch_production_app','launch_readiness_checklist','launch_retention_playbook',
    'launch_test_plan','launch_uat_report','launch_user_feedback_summary','lifecycle_sd_bridge',
    'marketing_app_store_desc','marketing_blog_draft','marketing_email_onboarding','marketing_email_reengagement',
    'marketing_email_welcome','marketing_landing_hero','marketing_seo_meta','marketing_social_posts',
    'marketing_tagline','post_lifecycle_decision','postlaunch_analytics_dashboard',
    'postlaunch_assumptions_vs_reality','postlaunch_user_feedback_summary','s17_approved','s17_approved_png',
    's17_archetypes','s17_design_system','s17_fill_screen','s17_preview','s17_qa_report','s17_session_state',
    's17_strategy_recommendation','s17_strategy_stats','s17_variant_scores','s17_variant_wip','stage_0_analysis',
    'stage_10_analysis','stage_11_analysis','stage_12_analysis','stage_13_analysis','stage_14_analysis',
    'stage_15_analysis','stage_16_analysis','stage_17_analysis','stage_18_analysis','stage_19_analysis',
    'stage_1_analysis','stage_20_analysis','stage_21_analysis','stage_22_analysis','stage_23_analysis',
    'stage_24_analysis','stage_25_analysis','stage_26_analysis','stage_2_analysis','stage_3_analysis',
    'stage_4_analysis','stage_5_analysis','stage_6_analysis','stage_7_analysis','stage_8_analysis',
    'stage_9_analysis','stitch_budget','stitch_curation','stitch_design_export','stitch_project',
    'stitch_qa_report','system_devils_advocate_review','truth_ai_critique','truth_competitive_analysis',
    'truth_financial_model','truth_idea_brief','truth_problem_statement','truth_target_market_analysis',
    'truth_validation_decision','truth_value_proposition','value_multiplier_assessment','visual_assets_skipped',
    'visual_device_screenshots','visual_final_assets','visual_social_graphics','wireframe_screens'
  ]));
