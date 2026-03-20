-- Fix lifecycle_stage_config artifact names for Blueprint phase (Stages 14-16)
-- Part of Blueprint Factory Wiring redesign
-- EXECUTED: 2026-03-20

-- Stage 14: Technical Architecture — 5 artifacts via blueprint agents
UPDATE lifecycle_stage_config
SET required_artifacts = ARRAY['data_model','erd_diagram','technical_architecture','api_contract','schema_spec']
WHERE stage_number = 14;

-- Stage 15: Risk Register & UX Design — 3 artifacts including new wireframes
UPDATE lifecycle_stage_config
SET required_artifacts = ARRAY['risk_register','user_story_pack','wireframes'],
    stage_name = 'Risk Register & UX Design'
WHERE stage_number = 15;

-- Stage 16: Financial Projections — single artifact
UPDATE lifecycle_stage_config
SET required_artifacts = ARRAY['financial_projection']
WHERE stage_number = 16;

-- Expand check constraint to include 'wireframes'
ALTER TABLE blueprint_templates DROP CONSTRAINT blueprint_templates_artifact_type_check;
ALTER TABLE blueprint_templates ADD CONSTRAINT blueprint_templates_artifact_type_check
  CHECK (artifact_type = ANY (ARRAY[
    'data_model','erd_diagram','user_story_pack','api_contract','schema_spec',
    'technical_architecture','risk_register','wireframes','financial_projection',
    'launch_readiness','sprint_plan','promotion_gate'
  ]));

-- Insert wireframes blueprint template row
INSERT INTO blueprint_templates (artifact_type, archetype, description, quality_rubric, is_active, version, created_by)
VALUES (
  'wireframes',
  'default',
  'Screen layouts with ASCII wireframes, navigation flows, and persona coverage',
  '{
    "dimensions": [
      {"name": "screen_coverage", "weight": 0.3, "criteria": "All key user journeys have corresponding screens"},
      {"name": "layout_clarity", "weight": 0.25, "criteria": "ASCII layouts clearly show component placement and hierarchy"},
      {"name": "navigation_completeness", "weight": 0.25, "criteria": "All screens reachable via defined navigation flows"},
      {"name": "persona_alignment", "weight": 0.2, "criteria": "Every persona has screens mapped to their primary tasks"}
    ],
    "min_pass_score": 55,
    "version": 1
  }'::jsonb,
  true,
  1,
  'blueprint-factory-wiring'
);
