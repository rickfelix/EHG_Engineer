-- Add Stitch artifact types to venture_artifacts.artifact_type check constraint
-- Bug fix: Stitch provisioner writes stitch_project, stitch_curation, stitch_budget
-- but constraint rejected them, blocking S15 Stitch integration.

BEGIN;

ALTER TABLE venture_artifacts DROP CONSTRAINT IF EXISTS venture_artifacts_artifact_type_check;

ALTER TABLE venture_artifacts ADD CONSTRAINT venture_artifacts_artifact_type_check
CHECK (((artifact_type)::text = ANY (ARRAY[
  'intake_venture_analysis', 'truth_idea_brief', 'truth_ai_critique',
  'truth_validation_decision', 'truth_competitive_analysis', 'truth_financial_model',
  'truth_problem_statement', 'truth_target_market_analysis', 'truth_value_proposition',
  'engine_risk_matrix', 'engine_pricing_model', 'engine_business_model_canvas',
  'engine_exit_strategy', 'engine_risk_assessment', 'engine_revenue_model',
  'identity_persona_brand', 'identity_brand_guidelines', 'identity_naming_visual',
  'identity_brand_name', 'identity_gtm_sales_strategy',
  'blueprint_product_roadmap', 'blueprint_technical_architecture', 'blueprint_data_model',
  'blueprint_erd_diagram', 'blueprint_api_contract', 'blueprint_schema_spec',
  'blueprint_risk_register', 'blueprint_user_story_pack', 'blueprint_wireframes',
  'blueprint_financial_projection', 'blueprint_launch_readiness', 'blueprint_sprint_plan',
  'blueprint_promotion_gate', 'blueprint_project_plan',
  'build_system_prompt', 'build_cicd_config', 'build_security_audit', 'build_mvp_build',
  'build_test_coverage_report',
  'launch_test_plan', 'launch_uat_report', 'launch_deployment_runbook',
  'launch_marketing_checklist', 'launch_analytics_dashboard', 'launch_health_scoring',
  'launch_churn_triggers', 'launch_retention_playbook', 'launch_optimization_roadmap',
  'launch_assumptions_vs_reality', 'launch_launch_metrics', 'launch_user_feedback_summary',
  'launch_production_app',
  'system_devils_advocate_review',
  'stitch_project', 'stitch_curation', 'stitch_budget'
]::text[])));

COMMIT;

-- Rollback:
-- BEGIN;
-- ALTER TABLE venture_artifacts DROP CONSTRAINT venture_artifacts_artifact_type_check;
-- (re-add original constraint without stitch_* values)
-- COMMIT;
