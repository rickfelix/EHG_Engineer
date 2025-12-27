-- LEO Protocol Enhancement: SD-Type Gate Exemptions
-- Purpose: Add orchestrator and documentation types with appropriate exemptions
-- Problem Solved: Retrospective action items were inappropriate for certain SD types
-- Date: 2025-12-27
-- Evidence: 57 retrospectives in 4 days showed 50+ mismatched action items (21% noise)

-- ============================================================================
-- ADD MISSING SD TYPES TO VALIDATION PROFILES
-- ============================================================================

-- Orchestrator: Coordinates child SDs, doesn't produce code itself
INSERT INTO sd_type_validation_profiles (
  sd_type, lead_weight, plan_weight, exec_weight, verify_weight, final_weight,
  requires_prd, requires_deliverables, requires_e2e_tests, requires_retrospective, requires_sub_agents, min_handoffs,
  description
) VALUES
('orchestrator', 30, 20, 20, 10, 20,
 true, false, false, true, false, 2,
 'Parent/orchestrator SDs that coordinate child SDs. No code production - children handle implementation, testing, and deliverables. Auto-completes when all children complete.')
ON CONFLICT (sd_type) DO UPDATE SET
  lead_weight = EXCLUDED.lead_weight,
  plan_weight = EXCLUDED.plan_weight,
  exec_weight = EXCLUDED.exec_weight,
  verify_weight = EXCLUDED.verify_weight,
  final_weight = EXCLUDED.final_weight,
  requires_prd = EXCLUDED.requires_prd,
  requires_deliverables = EXCLUDED.requires_deliverables,
  requires_e2e_tests = EXCLUDED.requires_e2e_tests,
  requires_retrospective = EXCLUDED.requires_retrospective,
  requires_sub_agents = EXCLUDED.requires_sub_agents,
  min_handoffs = EXCLUDED.min_handoffs,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Documentation: No code to test
INSERT INTO sd_type_validation_profiles (
  sd_type, lead_weight, plan_weight, exec_weight, verify_weight, final_weight,
  requires_prd, requires_deliverables, requires_e2e_tests, requires_retrospective, requires_sub_agents, min_handoffs,
  description
) VALUES
('documentation', 35, 20, 20, 10, 15,
 false, false, false, false, false, 1,
 'Documentation-only SDs. No code production - exempt from E2E tests, deliverables, and sub-agent requirements. Quick workflow allowed.')
ON CONFLICT (sd_type) DO UPDATE SET
  lead_weight = EXCLUDED.lead_weight,
  plan_weight = EXCLUDED.plan_weight,
  exec_weight = EXCLUDED.exec_weight,
  verify_weight = EXCLUDED.verify_weight,
  final_weight = EXCLUDED.final_weight,
  requires_prd = EXCLUDED.requires_prd,
  requires_deliverables = EXCLUDED.requires_deliverables,
  requires_e2e_tests = EXCLUDED.requires_e2e_tests,
  requires_retrospective = EXCLUDED.requires_retrospective,
  requires_sub_agents = EXCLUDED.requires_sub_agents,
  min_handoffs = EXCLUDED.min_handoffs,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- CREATE GATE EXEMPTION REFERENCE TABLE
-- ============================================================================
-- This table provides a clear reference for which gates apply to which SD types
-- Used by handoff executors and retrospective generator

CREATE TABLE IF NOT EXISTS sd_type_gate_exemptions (
  id SERIAL PRIMARY KEY,
  sd_type VARCHAR(50) NOT NULL,
  gate_name VARCHAR(100) NOT NULL,
  exemption_type VARCHAR(20) NOT NULL CHECK (exemption_type IN ('SKIP', 'OPTIONAL', 'REQUIRED')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sd_type, gate_name)
);

COMMENT ON TABLE sd_type_gate_exemptions IS
'Defines which gates are exempted, optional, or required for each SD type. Used by handoff executors and retro generator.';

-- ============================================================================
-- INSERT GATE EXEMPTIONS
-- ============================================================================

-- Orchestrator exemptions
INSERT INTO sd_type_gate_exemptions (sd_type, gate_name, exemption_type, reason) VALUES
('orchestrator', 'E2E_TESTING', 'SKIP', 'Orchestrators coordinate children, don''t produce code'),
('orchestrator', 'TESTING_SUBAGENT', 'SKIP', 'Children handle testing'),
('orchestrator', 'DELIVERABLES_CHECK', 'SKIP', 'Children produce deliverables'),
('orchestrator', 'CODE_VALIDATION', 'SKIP', 'No code to validate'),
('orchestrator', 'GIT_COMMIT_CHECK', 'SKIP', 'Children handle commits'),
('orchestrator', 'HANDOFF_CHAIN', 'OPTIONAL', 'May auto-complete when children finish'),
('orchestrator', 'PRD_REQUIRED', 'REQUIRED', 'Coordination PRD still needed'),
('orchestrator', 'RETROSPECTIVE', 'REQUIRED', 'Learning capture still required')
ON CONFLICT (sd_type, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- Documentation exemptions
INSERT INTO sd_type_gate_exemptions (sd_type, gate_name, exemption_type, reason) VALUES
('documentation', 'E2E_TESTING', 'SKIP', 'No code to test'),
('documentation', 'TESTING_SUBAGENT', 'SKIP', 'No code paths to test'),
('documentation', 'DELIVERABLES_CHECK', 'SKIP', 'Documentation is the deliverable'),
('documentation', 'CODE_VALIDATION', 'SKIP', 'No code to validate'),
('documentation', 'GIT_COMMIT_CHECK', 'OPTIONAL', 'May just be markdown files'),
('documentation', 'HANDOFF_CHAIN', 'OPTIONAL', 'Quick workflow allowed'),
('documentation', 'PRD_REQUIRED', 'OPTIONAL', 'Simple docs may skip PRD'),
('documentation', 'RETROSPECTIVE', 'OPTIONAL', 'Learning capture optional for docs')
ON CONFLICT (sd_type, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- Infrastructure exemptions (update existing profile understanding)
INSERT INTO sd_type_gate_exemptions (sd_type, gate_name, exemption_type, reason) VALUES
('infrastructure', 'E2E_TESTING', 'OPTIONAL', 'Unit tests may suffice'),
('infrastructure', 'TESTING_SUBAGENT', 'OPTIONAL', 'Depends on scope'),
('infrastructure', 'DELIVERABLES_CHECK', 'OPTIONAL', 'Infrastructure changes are the deliverable'),
('infrastructure', 'CODE_VALIDATION', 'REQUIRED', 'Scripts/configs need validation'),
('infrastructure', 'GIT_COMMIT_CHECK', 'REQUIRED', 'Must track infrastructure changes'),
('infrastructure', 'HANDOFF_CHAIN', 'OPTIONAL', 'EXEC-TO-PLAN optional'),
('infrastructure', 'PRD_REQUIRED', 'REQUIRED', 'Infrastructure needs planning'),
('infrastructure', 'RETROSPECTIVE', 'REQUIRED', 'Learn from infrastructure work')
ON CONFLICT (sd_type, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- Bugfix requirements
INSERT INTO sd_type_gate_exemptions (sd_type, gate_name, exemption_type, reason) VALUES
('bugfix', 'E2E_TESTING', 'REQUIRED', 'Must verify fix works'),
('bugfix', 'TESTING_SUBAGENT', 'REQUIRED', 'Prevent regressions'),
('bugfix', 'DELIVERABLES_CHECK', 'REQUIRED', 'Track fix completion'),
('bugfix', 'CODE_VALIDATION', 'REQUIRED', 'Validate fix code'),
('bugfix', 'GIT_COMMIT_CHECK', 'REQUIRED', 'Track fix commits'),
('bugfix', 'HANDOFF_CHAIN', 'OPTIONAL', 'Simple fixes may skip LEAD-TO-PLAN'),
('bugfix', 'PRD_REQUIRED', 'OPTIONAL', 'Simple fixes may skip PRD'),
('bugfix', 'RETROSPECTIVE', 'OPTIONAL', 'Not needed for simple fixes')
ON CONFLICT (sd_type, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- Feature requirements (full validation)
INSERT INTO sd_type_gate_exemptions (sd_type, gate_name, exemption_type, reason) VALUES
('feature', 'E2E_TESTING', 'REQUIRED', 'Full coverage needed'),
('feature', 'TESTING_SUBAGENT', 'REQUIRED', 'New functionality must be tested'),
('feature', 'DELIVERABLES_CHECK', 'REQUIRED', 'Track feature components'),
('feature', 'CODE_VALIDATION', 'REQUIRED', 'Validate feature code'),
('feature', 'GIT_COMMIT_CHECK', 'REQUIRED', 'Track feature development'),
('feature', 'HANDOFF_CHAIN', 'REQUIRED', 'Full 5-handoff chain'),
('feature', 'PRD_REQUIRED', 'REQUIRED', 'Features need PRD'),
('feature', 'RETROSPECTIVE', 'REQUIRED', 'Capture feature learnings')
ON CONFLICT (sd_type, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- Security requirements (enhanced validation)
INSERT INTO sd_type_gate_exemptions (sd_type, gate_name, exemption_type, reason) VALUES
('security', 'E2E_TESTING', 'REQUIRED', 'Security must be verified'),
('security', 'TESTING_SUBAGENT', 'REQUIRED', 'Plus SECURITY sub-agent'),
('security', 'DELIVERABLES_CHECK', 'REQUIRED', 'Track security fixes'),
('security', 'CODE_VALIDATION', 'REQUIRED', 'Validate security code'),
('security', 'GIT_COMMIT_CHECK', 'REQUIRED', 'Track security changes'),
('security', 'HANDOFF_CHAIN', 'REQUIRED', 'Full chain with extra review'),
('security', 'PRD_REQUIRED', 'REQUIRED', 'Security needs careful planning'),
('security', 'RETROSPECTIVE', 'REQUIRED', 'Capture security learnings')
ON CONFLICT (sd_type, gate_name) DO UPDATE SET
  exemption_type = EXCLUDED.exemption_type,
  reason = EXCLUDED.reason,
  updated_at = NOW();

-- ============================================================================
-- HELPER FUNCTION: Get Gate Exemption
-- ============================================================================

CREATE OR REPLACE FUNCTION get_gate_exemption(sd_type_param VARCHAR, gate_name_param VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  exemption_result VARCHAR;
BEGIN
  -- Look up exemption type
  SELECT exemption_type INTO exemption_result
  FROM sd_type_gate_exemptions
  WHERE sd_type = COALESCE(sd_type_param, 'feature')
  AND gate_name = gate_name_param;

  -- Default to REQUIRED if no exemption found
  RETURN COALESCE(exemption_result, 'REQUIRED');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_gate_exemption IS
'Returns the exemption type (SKIP, OPTIONAL, REQUIRED) for a given SD type and gate.';

-- ============================================================================
-- HELPER FUNCTION: Get All Gate Exemptions for SD Type
-- ============================================================================

CREATE OR REPLACE FUNCTION get_sd_type_gates(sd_type_param VARCHAR)
RETURNS JSONB AS $$
BEGIN
  RETURN (
    SELECT jsonb_object_agg(gate_name, jsonb_build_object(
      'exemption_type', exemption_type,
      'reason', reason
    ))
    FROM sd_type_gate_exemptions
    WHERE sd_type = COALESCE(sd_type_param, 'feature')
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_sd_type_gates IS
'Returns all gate exemptions for a given SD type as JSONB.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  profile_count INT;
  exemption_count INT;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM sd_type_validation_profiles;
  SELECT COUNT(*) INTO exemption_count FROM sd_type_gate_exemptions;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-Type Gate Exemptions Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Validation profiles: %', profile_count;
  RAISE NOTICE 'Gate exemptions: %', exemption_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New SD types added:';
  RAISE NOTICE '  orchestrator: Coordinates children, EXEMPT from testing/deliverables';
  RAISE NOTICE '  documentation: No code, EXEMPT from testing/code validation';
  RAISE NOTICE '';
  RAISE NOTICE 'Gate exemption types:';
  RAISE NOTICE '  SKIP:     Gate is completely bypassed';
  RAISE NOTICE '  OPTIONAL: Gate runs but failure is non-blocking';
  RAISE NOTICE '  REQUIRED: Gate must pass';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage: SELECT get_gate_exemption(''orchestrator'', ''E2E_TESTING'');';
  RAISE NOTICE '       SELECT get_sd_type_gates(''documentation'');';
  RAISE NOTICE '============================================================';
END $$;
