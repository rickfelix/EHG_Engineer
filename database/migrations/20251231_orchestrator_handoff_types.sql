-- ============================================================================
-- Migration: Add orchestrator SD type and update handoff requirements
-- Purpose: SD-LEO-PROTOCOL-V435-001 US-001 - Type-aware handoff chain validation
-- Date: 2025-12-31
-- ============================================================================

-- OVERVIEW:
-- Adds orchestrator type to sd_type_validation_profiles with minimal handoff
-- requirements since orchestrator SDs complete when all children complete.

-- ============================================================================
-- PART 1: ADD ORCHESTRATOR TYPE TO VALIDATION PROFILES
-- ============================================================================

-- Check if orchestrator type exists, if not insert
INSERT INTO sd_type_validation_profiles (
  sd_type,
  lead_weight,
  plan_weight,
  exec_weight,
  verify_weight,
  final_weight,
  requires_prd,
  requires_deliverables,
  requires_e2e_tests,
  requires_sub_agents,
  requires_retrospective,
  min_handoffs,
  description,
  required_handoff_types
)
SELECT
  'orchestrator',
  20,  -- lead_weight
  30,  -- plan_weight
  0,   -- exec_weight (no direct implementation)
  0,   -- verify_weight (no E2E)
  50,  -- final_weight (completion-focused)
  true,  -- requires_prd
  false, -- requires_deliverables (children have deliverables)
  false, -- requires_e2e_tests
  false, -- requires_sub_agents (children have sub-agents)
  true,  -- requires_retrospective
  3,     -- min_handoffs (LEAD-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL-APPROVAL)
  'Orchestrator/Parent SD type - completion driven by child SDs',
  ARRAY['LEAD-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL']
WHERE NOT EXISTS (
  SELECT 1 FROM sd_type_validation_profiles WHERE sd_type = 'orchestrator'
);

-- Update if already exists
UPDATE sd_type_validation_profiles
SET
  lead_weight = 20,
  plan_weight = 30,
  exec_weight = 0,
  verify_weight = 0,
  final_weight = 50,
  requires_prd = true,
  requires_deliverables = false,
  requires_e2e_tests = false,
  requires_sub_agents = false,
  requires_retrospective = true,
  min_handoffs = 3,
  required_handoff_types = ARRAY['LEAD-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'],
  description = 'Orchestrator/Parent SD type - completion driven by child SDs',
  updated_at = NOW()
WHERE sd_type = 'orchestrator';

-- ============================================================================
-- PART 2: ADD prd_quality_threshold COLUMN IF NOT EXISTS
-- ============================================================================

ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS prd_quality_threshold INT DEFAULT 85;

COMMENT ON COLUMN sd_type_validation_profiles.prd_quality_threshold IS
'Minimum PRD quality score required for this SD type. Infrastructure/docs have lower thresholds.';

-- ============================================================================
-- PART 3: SET TYPE-SPECIFIC PRD QUALITY THRESHOLDS (US-002)
-- ============================================================================

-- Feature: Full quality required (85%)
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 85 WHERE sd_type = 'feature';

-- Infrastructure: Lower threshold (50%)
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 50 WHERE sd_type = 'infrastructure';

-- Documentation: Lower threshold (50%)
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 50 WHERE sd_type = 'docs';
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 50 WHERE sd_type = 'documentation';

-- Database: Standard threshold (70%)
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 70 WHERE sd_type = 'database';

-- Bugfix: Slightly lower (70%)
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 70 WHERE sd_type = 'bugfix';

-- Refactor: Standard (75%)
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 75 WHERE sd_type = 'refactor';

-- Security: High quality required (90%)
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 90 WHERE sd_type = 'security';

-- Performance: High quality required (85%)
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 85 WHERE sd_type = 'performance';

-- Orchestrator: Lower threshold - just needs overview (50%)
UPDATE sd_type_validation_profiles SET prd_quality_threshold = 50 WHERE sd_type = 'orchestrator';

-- ============================================================================
-- PART 4: ADD requires_deliverables_gate COLUMN (US-003)
-- ============================================================================

ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS requires_deliverables_gate BOOLEAN DEFAULT true;

COMMENT ON COLUMN sd_type_validation_profiles.requires_deliverables_gate IS
'Whether this SD type requires deliverables to be defined before EXEC phase. Infrastructure and orchestrator SDs can skip.';

-- Set deliverables gate requirements by type
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = true WHERE sd_type = 'feature';
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = false WHERE sd_type = 'infrastructure';
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = false WHERE sd_type = 'docs';
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = false WHERE sd_type = 'documentation';
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = true WHERE sd_type = 'database';
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = true WHERE sd_type = 'bugfix';
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = true WHERE sd_type = 'refactor';
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = true WHERE sd_type = 'security';
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = true WHERE sd_type = 'performance';
UPDATE sd_type_validation_profiles SET requires_deliverables_gate = false WHERE sd_type = 'orchestrator';

-- ============================================================================
-- PART 5: VALIDATION
-- ============================================================================

DO $$
DECLARE
  profile_rec RECORD;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-LEO-PROTOCOL-V435-001: Type-Aware Compliance Migration';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'SD Type Configuration Summary:';

  FOR profile_rec IN
    SELECT
      sd_type,
      required_handoff_types,
      prd_quality_threshold,
      requires_deliverables_gate
    FROM sd_type_validation_profiles
    ORDER BY sd_type
  LOOP
    RAISE NOTICE '  %: handoffs=%, PRD=%%, deliverables_gate=%',
      profile_rec.sd_type,
      array_to_string(profile_rec.required_handoff_types, '→'),
      profile_rec.prd_quality_threshold,
      profile_rec.requires_deliverables_gate;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Changes Applied:';
  RAISE NOTICE '  - US-001: Orchestrator type added with minimal handoffs';
  RAISE NOTICE '  - US-002: PRD quality thresholds by type (50-90%%)';
  RAISE NOTICE '  - US-003: Deliverables gate flag by type';
  RAISE NOTICE '============================================================';
END $$;
