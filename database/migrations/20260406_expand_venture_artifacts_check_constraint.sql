-- SD-MAN-FIX-FIX-VENTURE-ARTIFACTS-001
-- Expand venture_artifacts_artifact_type_check to include 31 missing types:
--   - 27 dynamic stage_N_analysis types (from stage-execution-engine.js)
--   - value_multiplier_assessment (advisory gate)
--   - economic_lens (economic-lens-analysis.js)
--   - lifecycle_sd_bridge (lifecycle-sd-bridge.js)
--   - post_lifecycle_decision (post-lifecycle-decisions.js)
--   - blueprint_review_summary (already in ARTIFACT_TYPES registry but missing from constraint)
-- Also preserves all 56 existing types + 3 stitch types from prior migration.

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
  -- Build (Stages 18-22)
  'build_system_prompt', 'build_cicd_config', 'build_security_audit', 'build_mvp_build',
  'build_test_coverage_report',
  -- Launch (Stages 22-26)
  'launch_test_plan', 'launch_uat_report', 'launch_deployment_runbook',
  'launch_marketing_checklist', 'launch_analytics_dashboard', 'launch_health_scoring',
  'launch_churn_triggers', 'launch_retention_playbook', 'launch_optimization_roadmap',
  'launch_assumptions_vs_reality', 'launch_launch_metrics', 'launch_user_feedback_summary',
  'launch_production_app',
  -- Cross-cutting / System
  'system_devils_advocate_review',
  -- Gate & Analysis artifacts (NEW — SD-MAN-FIX-FIX-VENTURE-ARTIFACTS-001)
  'value_multiplier_assessment',
  'economic_lens',
  'lifecycle_sd_bridge',
  'post_lifecycle_decision',
  -- Stitch integration (from 20260406_add_stitch_artifact_types.sql)
  'stitch_project', 'stitch_curation', 'stitch_budget',
  -- Dynamic stage analysis artifacts (from stage-execution-engine.js)
  'stage_0_analysis', 'stage_1_analysis', 'stage_2_analysis', 'stage_3_analysis',
  'stage_4_analysis', 'stage_5_analysis', 'stage_6_analysis', 'stage_7_analysis',
  'stage_8_analysis', 'stage_9_analysis', 'stage_10_analysis', 'stage_11_analysis',
  'stage_12_analysis', 'stage_13_analysis', 'stage_14_analysis', 'stage_15_analysis',
  'stage_16_analysis', 'stage_17_analysis', 'stage_18_analysis', 'stage_19_analysis',
  'stage_20_analysis', 'stage_21_analysis', 'stage_22_analysis', 'stage_23_analysis',
  'stage_24_analysis', 'stage_25_analysis', 'stage_26_analysis'
]::text[])));

COMMIT;
