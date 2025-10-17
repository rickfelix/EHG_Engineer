-- LEO Protocol Gap Remediation Migration
-- Fixes critical gaps between PLAN and EXEC phases
-- Version: 1.0.0
-- Date: 2025-01-17
-- Purpose: Address audit findings for unambiguous PLAN→EXEC transition

-- ============================================
-- Gap 1: Add structured fields to PRDs table
-- ============================================
ALTER TABLE prds
ADD COLUMN IF NOT EXISTS target_url TEXT,
ADD COLUMN IF NOT EXISTS component_name TEXT,
ADD COLUMN IF NOT EXISTS app_path TEXT,
ADD COLUMN IF NOT EXISTS port INTEGER CHECK (port > 0 AND port < 65536);

COMMENT ON COLUMN prds.target_url IS 'Target URL for EXEC to verify before implementation';
COMMENT ON COLUMN prds.component_name IS 'Component name for EXEC to identify in codebase';
COMMENT ON COLUMN prds.app_path IS 'Application path for EXEC context verification';
COMMENT ON COLUMN prds.port IS 'Port number for EXEC to verify server is running';

-- ============================================
-- Gap 2: Populate PLAN→EXEC handoff template
-- ============================================
INSERT INTO leo_handoff_templates (
  from_agent,
  to_agent,
  handoff_type,
  template_structure,
  required_elements,
  validation_rules,
  active,
  version
) VALUES (
  'PLAN',
  'EXEC',
  'technical_to_implementation',
  '{
    "sections": [
      "Executive Summary",
      "Completeness Report",
      "Deliverables Manifest",
      "Key Decisions & Rationale",
      "Known Issues & Risks",
      "Resource Utilization",
      "Action Items for Receiver"
    ]
  }'::jsonb,
  '[
    {"element": "PRD complete", "required": true},
    {"element": "Technical specs defined", "required": true},
    {"element": "Sub-agents identified", "required": true},
    {"element": "Gates 2A-2D passed", "required": true}
  ]'::jsonb,
  '[
    {"rule": "all_gates_passed", "threshold": 85},
    {"rule": "prd_has_target_url", "required": true},
    {"rule": "prd_has_component_name", "required": true}
  ]'::jsonb,
  true,
  1
) ON CONFLICT (from_agent, to_agent, handoff_type, version)
DO UPDATE SET
  template_structure = EXCLUDED.template_structure,
  required_elements = EXCLUDED.required_elements,
  validation_rules = EXCLUDED.validation_rules,
  active = true;

-- Also populate LEAD→PLAN handoff
INSERT INTO leo_handoff_templates (
  from_agent,
  to_agent,
  handoff_type,
  template_structure,
  required_elements,
  active,
  version
) VALUES (
  'LEAD',
  'PLAN',
  'strategic_to_technical',
  '{
    "sections": [
      "Executive Summary",
      "Completeness Report",
      "Deliverables Manifest",
      "Key Decisions & Rationale",
      "Known Issues & Risks",
      "Resource Utilization",
      "Action Items for Receiver"
    ]
  }'::jsonb,
  '[
    {"element": "SD created", "required": true},
    {"element": "Objectives defined", "required": true},
    {"element": "Priority set", "required": true}
  ]'::jsonb,
  true,
  1
) ON CONFLICT (from_agent, to_agent, handoff_type, version)
DO UPDATE SET
  template_structure = EXCLUDED.template_structure,
  required_elements = EXCLUDED.required_elements,
  active = true;

-- Also populate EXEC→PLAN handoff for verification
INSERT INTO leo_handoff_templates (
  from_agent,
  to_agent,
  handoff_type,
  template_structure,
  required_elements,
  active,
  version
) VALUES (
  'EXEC',
  'PLAN',
  'implementation_to_verification',
  '{
    "sections": [
      "Executive Summary",
      "Completeness Report",
      "Deliverables Manifest",
      "Key Decisions & Rationale",
      "Known Issues & Risks",
      "Resource Utilization",
      "Action Items for Receiver"
    ]
  }'::jsonb,
  '[
    {"element": "Implementation complete", "required": true},
    {"element": "Tests passing", "required": true},
    {"element": "Documentation updated", "required": true}
  ]'::jsonb,
  true,
  1
) ON CONFLICT (from_agent, to_agent, handoff_type, version)
DO UPDATE SET
  template_structure = EXCLUDED.template_structure,
  required_elements = EXCLUDED.required_elements,
  active = true;

-- ============================================
-- Gap 3: Create gate validation trigger
-- ============================================

-- First create a table to track EXEC authorization
CREATE TABLE IF NOT EXISTS exec_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id TEXT NOT NULL UNIQUE,
  gates_passed BOOLEAN DEFAULT false,
  gate_2a_score NUMERIC(5,2),
  gate_2b_score NUMERIC(5,2),
  gate_2c_score NUMERIC(5,2),
  gate_2d_score NUMERIC(5,2),
  authorized_at TIMESTAMPTZ,
  authorized_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to check if all gates have passed
CREATE OR REPLACE FUNCTION check_gates_before_exec()
RETURNS TRIGGER AS $$
DECLARE
  v_gate_count INTEGER;
  v_passed_count INTEGER;
  v_is_exec_agent BOOLEAN;
BEGIN
  -- Check if this is an EXEC or IMPLEMENTATION sub-agent
  SELECT EXISTS (
    SELECT 1 FROM leo_sub_agents
    WHERE id = NEW.sub_agent_id
    AND code IN ('EXEC', 'IMPLEMENTATION')
  ) INTO v_is_exec_agent;

  -- Only apply gate checks for EXEC agents
  IF NOT v_is_exec_agent THEN
    RETURN NEW;
  END IF;

  -- Only check for new executions or status changes to 'running'
  IF (TG_OP = 'INSERT' AND NEW.status IN ('pending', 'running')) OR
     (TG_OP = 'UPDATE' AND NEW.status = 'running' AND OLD.status != 'running') THEN

    -- Count how many gates have passed (score >= 85)
    SELECT COUNT(DISTINCT gate) INTO v_passed_count
    FROM (
      SELECT gate, MAX(score) as max_score
      FROM leo_gate_reviews
      WHERE prd_id = NEW.prd_id
      AND gate IN ('2A', '2B', '2C', '2D')
      GROUP BY gate
      HAVING MAX(score) >= 85
    ) gates_passed;

    -- Check if all 4 gates have passed
    IF v_passed_count < 4 THEN
      RAISE EXCEPTION 'Cannot start EXEC for PRD %: Only % of 4 required gates have passed (score >= 85)',
        NEW.prd_id, v_passed_count;
    END IF;

    -- Update exec_authorizations table
    INSERT INTO exec_authorizations (prd_id, gates_passed, authorized_at, authorized_by)
    VALUES (NEW.prd_id, true, NOW(), COALESCE(current_user, 'system'))
    ON CONFLICT (prd_id)
    DO UPDATE SET
      gates_passed = true,
      authorized_at = NOW(),
      authorized_by = COALESCE(current_user, 'system');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on sub_agent_executions
-- Note: Checking for EXEC sub-agent inside the function instead of WHEN clause
DROP TRIGGER IF EXISTS enforce_gates_before_exec ON sub_agent_executions;
CREATE TRIGGER enforce_gates_before_exec
  BEFORE INSERT OR UPDATE ON sub_agent_executions
  FOR EACH ROW
  EXECUTE FUNCTION check_gates_before_exec();

-- ============================================
-- Gap 4: Add validation for test plan matrices
-- ============================================

-- Add constraint to ensure matrices are properly structured
ALTER TABLE leo_test_plans
DROP CONSTRAINT IF EXISTS valid_matrices;

ALTER TABLE leo_test_plans
ADD CONSTRAINT valid_matrices CHECK (
  jsonb_typeof(matrices) = 'object' AND
  matrices ? 'unit' AND
  matrices ? 'integration' AND
  matrices ? 'e2e' AND
  matrices ? 'a11y' AND
  matrices ? 'perf'
);

-- Add constraint to ensure test scenarios are arrays
ALTER TABLE leo_test_plans
DROP CONSTRAINT IF EXISTS valid_test_scenarios;

ALTER TABLE leo_test_plans
ADD CONSTRAINT valid_test_scenarios CHECK (
  jsonb_typeof(test_scenarios) = 'array'
);

-- ============================================
-- Create view for EXEC readiness dashboard
-- ============================================
CREATE OR REPLACE VIEW v_exec_readiness AS
SELECT
  p.id as prd_id,
  p.title,
  p.status as prd_status,
  p.target_url,
  p.component_name,
  p.app_path,
  p.port,
  -- Gate scores
  COALESCE(g2a.score, 0) as gate_2a_score,
  COALESCE(g2b.score, 0) as gate_2b_score,
  COALESCE(g2c.score, 0) as gate_2c_score,
  COALESCE(g2d.score, 0) as gate_2d_score,
  -- Gate pass status
  COALESCE(g2a.score >= 85, false) as gate_2a_passed,
  COALESCE(g2b.score >= 85, false) as gate_2b_passed,
  COALESCE(g2c.score >= 85, false) as gate_2c_passed,
  COALESCE(g2d.score >= 85, false) as gate_2d_passed,
  -- Overall readiness
  CASE
    WHEN p.target_url IS NOT NULL
     AND p.component_name IS NOT NULL
     AND COALESCE(g2a.score, 0) >= 85
     AND COALESCE(g2b.score, 0) >= 85
     AND COALESCE(g2c.score, 0) >= 85
     AND COALESCE(g2d.score, 0) >= 85
    THEN true
    ELSE false
  END as exec_ready,
  -- Authorization status
  ea.gates_passed as exec_authorized,
  ea.authorized_at,
  ea.authorized_by
FROM prds p
LEFT JOIN LATERAL (
  SELECT MAX(score) as score
  FROM leo_gate_reviews
  WHERE prd_id = p.id AND gate = '2A'
) g2a ON true
LEFT JOIN LATERAL (
  SELECT MAX(score) as score
  FROM leo_gate_reviews
  WHERE prd_id = p.id AND gate = '2B'
) g2b ON true
LEFT JOIN LATERAL (
  SELECT MAX(score) as score
  FROM leo_gate_reviews
  WHERE prd_id = p.id AND gate = '2C'
) g2c ON true
LEFT JOIN LATERAL (
  SELECT MAX(score) as score
  FROM leo_gate_reviews
  WHERE prd_id = p.id AND gate = '2D'
) g2d ON true
LEFT JOIN exec_authorizations ea ON ea.prd_id = p.id;

-- ============================================
-- Add indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_prds_target_url ON prds(target_url) WHERE target_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prds_component_name ON prds(component_name) WHERE component_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exec_auth_prd ON exec_authorizations(prd_id, gates_passed);

-- ============================================
-- Update existing PRDs with sample data (if needed)
-- ============================================
-- This is optional - only run if you want to populate existing PRDs
-- UPDATE prds
-- SET
--   target_url = 'http://localhost:3000/dashboard',
--   component_name = 'Dashboard',
--   app_path = '/mnt/c/_EHG/EHG_Engineer',
--   port = 3000
-- WHERE id = 'PRD-SD-001' AND target_url IS NULL;

-- ============================================
-- Verification queries
-- ============================================
-- Check EXEC readiness:
-- SELECT * FROM v_exec_readiness;

-- Check handoff templates:
-- SELECT from_agent, to_agent, handoff_type,
--        jsonb_array_length(template_structure->'sections') as section_count,
--        jsonb_array_length(required_elements) as required_count
-- FROM leo_handoff_templates
-- WHERE active = true;

-- Check gate status for a PRD:
-- SELECT prd_id, gate, MAX(score) as best_score,
--        MAX(score) >= 85 as passed
-- FROM leo_gate_reviews
-- WHERE prd_id = 'PRD-SD-001'
-- GROUP BY prd_id, gate
-- ORDER BY gate;