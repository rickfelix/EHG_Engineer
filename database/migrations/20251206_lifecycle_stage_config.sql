-- Migration: Lifecycle Stage Configuration Table
-- SD: SD-VISION-TRANSITION-001D
-- Date: 2025-12-06
-- Purpose: Create database table mirroring stages_v2.yaml for runtime queries

-- ============================================================================
-- 1. Create lifecycle_stage_config table
-- ============================================================================
CREATE TABLE IF NOT EXISTS lifecycle_stage_config (
  stage_number INT PRIMARY KEY,
  stage_name VARCHAR(100) NOT NULL,
  description TEXT,
  phase_number INT NOT NULL,
  phase_name VARCHAR(50) NOT NULL,
  work_type VARCHAR(30) NOT NULL CHECK (work_type IN ('artifact_only', 'automated_check', 'decision_gate', 'sd_required')),
  sd_required BOOLEAN DEFAULT false,
  sd_suffix VARCHAR(20),
  advisory_enabled BOOLEAN DEFAULT false,
  depends_on INT[] DEFAULT '{}',
  required_artifacts TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE lifecycle_stage_config IS 'Venture Vision v2.0 - 25 Stage Lifecycle Configuration';
COMMENT ON COLUMN lifecycle_stage_config.work_type IS 'artifact_only = non-code artifacts, automated_check = AI validation, decision_gate = Chairman decision, sd_required = Leo Protocol SD needed';
COMMENT ON COLUMN lifecycle_stage_config.advisory_enabled IS 'TRUE at stages 3, 5, 16 for Chairman Advisory checkpoints';

-- ============================================================================
-- 2. Create phase reference table
-- ============================================================================
CREATE TABLE IF NOT EXISTS lifecycle_phases (
  phase_number INT PRIMARY KEY,
  phase_name VARCHAR(50) NOT NULL,
  description TEXT,
  stages INT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE lifecycle_phases IS 'Venture Vision v2.0 - 6 Phase Definitions';

-- ============================================================================
-- 3. Insert Phase Data
-- ============================================================================
INSERT INTO lifecycle_phases (phase_number, phase_name, description, stages) VALUES
(1, 'THE TRUTH', 'Validation and market reality assessment', ARRAY[1,2,3,4,5]),
(2, 'THE ENGINE', 'Business model and strategy foundation', ARRAY[6,7,8,9]),
(3, 'THE IDENTITY', 'Brand, positioning, and go-to-market', ARRAY[10,11,12]),
(4, 'THE BLUEPRINT', 'Technical architecture and specification', ARRAY[13,14,15,16]),
(5, 'THE BUILD LOOP', 'Implementation and development cycle', ARRAY[17,18,19,20]),
(6, 'LAUNCH & LEARN', 'Deployment, analytics, and optimization', ARRAY[21,22,23,24,25])
ON CONFLICT (phase_number) DO UPDATE SET
  phase_name = EXCLUDED.phase_name,
  description = EXCLUDED.description,
  stages = EXCLUDED.stages;

-- ============================================================================
-- 4. Insert Stage Configuration Data (All 25 Stages)
-- ============================================================================

-- PHASE 1: THE TRUTH (Stages 1-5)
INSERT INTO lifecycle_stage_config (stage_number, stage_name, description, phase_number, phase_name, work_type, sd_required, sd_suffix, advisory_enabled, depends_on, required_artifacts, metadata) VALUES
(1, 'Draft Idea & Chairman Review', 'Capture and validate initial venture ideas with AI assistance and Chairman feedback.', 1, 'THE TRUTH', 'artifact_only', false, NULL, false, '{}', ARRAY['idea_brief'], '{"gates": {"exit": ["Title validated (3-120 chars)", "Description validated (20-2000 chars)", "Category assigned"]}}'),
(2, 'AI Multi-Model Critique', 'Multi-agent AI system reviews and critiques the idea from multiple perspectives.', 1, 'THE TRUTH', 'automated_check', false, NULL, false, ARRAY[1], ARRAY['critique_report'], '{"gates": {"entry": ["Idea document complete"], "exit": ["Multi-model pass complete", "Contrarian review done", "Top-5 risks identified"]}}'),
(3, 'Market Validation & RAT', 'Validate problem-solution fit, user willingness to pay, and technical feasibility.', 1, 'THE TRUTH', 'decision_gate', false, NULL, true, ARRAY[2], ARRAY['validation_report'], '{"decision_options": ["advance", "revise", "reject"], "tier_cap": 3, "gates": {"entry": ["AI critique complete"], "exit": ["Validation score >= 6", "Chairman decision: advance/revise/reject"]}}'),
(4, 'Competitive Intelligence', 'Deep analysis of competitive landscape, market gaps, and positioning opportunities.', 1, 'THE TRUTH', 'artifact_only', false, NULL, false, ARRAY[3], ARRAY['competitive_analysis'], '{}'),
(5, 'Profitability Forecasting', 'Financial modeling, unit economics validation, and ROI projections.', 1, 'THE TRUTH', 'decision_gate', false, NULL, true, ARRAY[4], ARRAY['financial_model'], '{"metrics": {"gross_margin_target": 0.40, "breakeven_months_max": 18, "cac_ltv_ratio_min": 3.0}, "gates": {"entry": ["Competitive analysis complete"], "exit": ["Financial model complete", "Unit economics viable"]}}'),

-- PHASE 2: THE ENGINE (Stages 6-9)
(6, 'Risk Evaluation Matrix', 'Comprehensive risk identification, probability assessment, and mitigation planning.', 2, 'THE ENGINE', 'artifact_only', false, NULL, false, ARRAY[5], ARRAY['risk_matrix'], '{}'),
(7, 'Pricing Strategy', 'Pricing model development, tier structure, and value-based pricing analysis.', 2, 'THE ENGINE', 'artifact_only', false, NULL, false, ARRAY[6], ARRAY['pricing_model'], '{}'),
(8, 'Business Model Canvas', 'Complete business model documentation using BMC framework.', 2, 'THE ENGINE', 'artifact_only', false, NULL, false, ARRAY[7], ARRAY['business_model_canvas'], '{}'),
(9, 'Exit-Oriented Design', 'Strategic exit planning, valuation targets, and acquisition-friendly architecture.', 2, 'THE ENGINE', 'artifact_only', false, NULL, false, ARRAY[8], ARRAY['exit_strategy'], '{}'),

-- PHASE 3: THE IDENTITY (Stages 10-12)
(10, 'Strategic Naming', 'Brand naming, identity development, and guidelines creation.', 3, 'THE IDENTITY', 'sd_required', true, 'BRAND', false, ARRAY[9], ARRAY['brand_guidelines'], '{}'),
(11, 'Go-to-Market Strategy', 'Marketing strategy, channel selection, and launch planning.', 3, 'THE IDENTITY', 'artifact_only', false, NULL, false, ARRAY[10], ARRAY['gtm_plan', 'marketing_manifest'], '{}'),
(12, 'Sales & Success Logic', 'Sales process design, customer success workflows, and support model.', 3, 'THE IDENTITY', 'artifact_only', false, NULL, false, ARRAY[11], ARRAY['sales_playbook'], '{}'),

-- PHASE 4: THE BLUEPRINT (Stages 13-16) - "Kochel Firewall"
(13, 'Tech Stack Interrogation', 'AI-driven challenge of technology choices, architecture decisions, and trade-offs.', 4, 'THE BLUEPRINT', 'decision_gate', false, NULL, false, ARRAY[12], ARRAY['tech_stack_decision'], '{}'),
(14, 'Data Model & Architecture', 'Entity relationship design, schema architecture, and data flow planning.', 4, 'THE BLUEPRINT', 'sd_required', true, 'DATAMODEL', false, ARRAY[13], ARRAY['data_model', 'erd_diagram'], '{}'),
(15, 'Epic & User Story Breakdown', 'Feature decomposition into epics and user stories with acceptance criteria.', 4, 'THE BLUEPRINT', 'sd_required', true, 'STORIES', false, ARRAY[14], ARRAY['user_story_pack'], '{"metrics": {"invest_compliance": true}}'),
(16, 'Spec-Driven Schema Generation', 'TypeScript interfaces, SQL schemas, and API contract generation from specifications.', 4, 'THE BLUEPRINT', 'decision_gate', true, 'SCHEMA', true, ARRAY[15], ARRAY['api_contract', 'schema_spec'], '{"schema_checklist": ["All entities named", "All relationships explicit", "All fields typed", "All constraints stated", "API contracts generated", "TypeScript interfaces generated"]}'),

-- PHASE 5: THE BUILD LOOP (Stages 17-20)
(17, 'Environment & Agent Config', 'Development environment setup, AI agent configuration, and CI/CD pipeline.', 5, 'THE BUILD LOOP', 'sd_required', true, 'ENVCONFIG', false, ARRAY[16], ARRAY['system_prompt', 'cicd_config'], '{}'),
(18, 'MVP Development Loop', 'Core feature implementation following story-driven development.', 5, 'THE BUILD LOOP', 'sd_required', true, 'MVP', false, ARRAY[17], '{}', '{}'),
(19, 'Integration & API Layer', 'System integration, API implementation, and third-party connections.', 5, 'THE BUILD LOOP', 'sd_required', true, 'INTEGRATION', false, ARRAY[18], '{}', '{}'),
(20, 'Security & Performance', 'Security hardening, performance optimization, and accessibility compliance.', 5, 'THE BUILD LOOP', 'sd_required', true, 'SECURITY', false, ARRAY[19], ARRAY['security_audit'], '{"metrics": {"wcag_compliance": "2.1 AA"}}'),

-- PHASE 6: LAUNCH & LEARN (Stages 21-25)
(21, 'QA & UAT', 'Quality assurance testing, user acceptance testing, and bug resolution.', 6, 'LAUNCH & LEARN', 'sd_required', true, 'QA', false, ARRAY[20], ARRAY['test_plan', 'uat_report'], '{"metrics": {"test_coverage_min": 0.80}}'),
(22, 'Deployment & Infrastructure', 'Production deployment, infrastructure provisioning, and monitoring setup.', 6, 'LAUNCH & LEARN', 'sd_required', true, 'DEPLOY', false, ARRAY[21], ARRAY['deployment_runbook'], '{}'),
(23, 'Production Launch', 'Go-live execution, launch checklist completion, and initial user onboarding.', 6, 'LAUNCH & LEARN', 'decision_gate', false, NULL, false, ARRAY[22], ARRAY['launch_checklist'], '{}'),
(24, 'Analytics & Feedback', 'Analytics implementation, feedback collection, and metric tracking.', 6, 'LAUNCH & LEARN', 'artifact_only', false, NULL, false, ARRAY[23], ARRAY['analytics_dashboard'], '{}'),
(25, 'Optimization & Scale', 'Continuous improvement, scaling preparation, and growth optimization.', 6, 'LAUNCH & LEARN', 'sd_required', true, 'OPTIMIZE', false, ARRAY[24], ARRAY['optimization_roadmap'], '{}')

ON CONFLICT (stage_number) DO UPDATE SET
  stage_name = EXCLUDED.stage_name,
  description = EXCLUDED.description,
  phase_number = EXCLUDED.phase_number,
  phase_name = EXCLUDED.phase_name,
  work_type = EXCLUDED.work_type,
  sd_required = EXCLUDED.sd_required,
  sd_suffix = EXCLUDED.sd_suffix,
  advisory_enabled = EXCLUDED.advisory_enabled,
  depends_on = EXCLUDED.depends_on,
  required_artifacts = EXCLUDED.required_artifacts,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- ============================================================================
-- 5. Create Advisory Checkpoints Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS advisory_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_number INT REFERENCES lifecycle_stage_config(stage_number),
  checkpoint_name VARCHAR(100) NOT NULL,
  description TEXT,
  trigger_condition TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO advisory_checkpoints (stage_number, checkpoint_name, description, trigger_condition) VALUES
(3, 'Validation Checkpoint', 'Kill/Revise/Proceed decision based on market validation score', 'validation_score < 6'),
(5, 'Profitability Gate', 'Financial viability assessment against archetype benchmarks', 'gross_margin < threshold OR breakeven_months > threshold'),
(16, 'Schema Firewall', 'Pre-implementation schema completeness verification', 'schema_checklist incomplete')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. Create Indexes for Performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_lifecycle_stage_phase ON lifecycle_stage_config(phase_number);
CREATE INDEX IF NOT EXISTS idx_lifecycle_stage_work_type ON lifecycle_stage_config(work_type);
CREATE INDEX IF NOT EXISTS idx_lifecycle_stage_sd_required ON lifecycle_stage_config(sd_required) WHERE sd_required = true;
CREATE INDEX IF NOT EXISTS idx_advisory_checkpoints_stage ON advisory_checkpoints(stage_number);

-- ============================================================================
-- 7. Create Helper Functions
-- ============================================================================

-- Function to get stage info by number
CREATE OR REPLACE FUNCTION get_stage_info(p_stage_number INT)
RETURNS TABLE(
  stage_number INT,
  stage_name VARCHAR,
  phase_name VARCHAR,
  work_type VARCHAR,
  sd_required BOOLEAN,
  advisory_enabled BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lsc.stage_number,
    lsc.stage_name,
    lsc.phase_name,
    lsc.work_type,
    lsc.sd_required,
    lsc.advisory_enabled
  FROM lifecycle_stage_config lsc
  WHERE lsc.stage_number = p_stage_number;
END;
$$ LANGUAGE plpgsql;

-- Function to get all stages requiring SDs
CREATE OR REPLACE FUNCTION get_sd_required_stages()
RETURNS TABLE(
  stage_number INT,
  stage_name VARCHAR,
  sd_suffix VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lsc.stage_number,
    lsc.stage_name,
    lsc.sd_suffix
  FROM lifecycle_stage_config lsc
  WHERE lsc.sd_required = true
  ORDER BY lsc.stage_number;
END;
$$ LANGUAGE plpgsql;

-- Function to get stages by phase
CREATE OR REPLACE FUNCTION get_stages_by_phase(p_phase_number INT)
RETURNS TABLE(
  stage_number INT,
  stage_name VARCHAR,
  work_type VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lsc.stage_number,
    lsc.stage_name,
    lsc.work_type
  FROM lifecycle_stage_config lsc
  WHERE lsc.phase_number = p_phase_number
  ORDER BY lsc.stage_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. Verification Query
-- ============================================================================
-- Run this after migration to verify:
-- SELECT COUNT(*) AS total_stages FROM lifecycle_stage_config;
-- Expected: 25
-- SELECT COUNT(*) AS sd_required_stages FROM lifecycle_stage_config WHERE sd_required = true;
-- Expected: 12
-- SELECT COUNT(*) AS advisory_stages FROM lifecycle_stage_config WHERE advisory_enabled = true;
-- Expected: 3

-- ============================================================================
-- Migration Complete
-- ============================================================================
