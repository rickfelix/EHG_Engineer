-- ============================================================================
-- Migration: Human-Verifiable Outcome Validation
-- Version: LEO Protocol v4.4.0
-- Date: 2026-01-04
-- Purpose: Add intelligent SD-type-aware human verification requirements
--
-- Problem Solved:
--   "The current plan optimizes for completing SDs rather than delivering
--    working software. Every SD should have a smoke test that a non-technical
--    person could run to verify it works."
--
-- Solution:
--   1. Add columns to sd_type_validation_profiles for human verification config
--   2. Only require human verification for SD types that produce user-visible output
--   3. Integrate with existing UAT Agent + LLM UX Oracle infrastructure
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Extend sd_type_validation_profiles with human verification columns
-- ============================================================================

-- Add human verification requirement column
ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS requires_human_verifiable_outcome BOOLEAN DEFAULT false;

COMMENT ON COLUMN sd_type_validation_profiles.requires_human_verifiable_outcome IS
  'If true, SD completion requires evidence that a human (or LLM acting as human) verified the outcome works. For feature SDs with UI, this triggers UAT Agent + LLM UX Oracle validation.';

-- Add human verification type enum
ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS human_verification_type TEXT DEFAULT 'none';

COMMENT ON COLUMN sd_type_validation_profiles.human_verification_type IS
  'Type of human verification required: ui_smoke_test (Playwright + LLM UX), api_test (endpoint verification), cli_verification (script output check), documentation_review (manual doc check), none (no human verification)';

-- Add constraint for valid verification types
ALTER TABLE sd_type_validation_profiles
ADD CONSTRAINT valid_human_verification_type
CHECK (human_verification_type IN ('ui_smoke_test', 'api_test', 'cli_verification', 'documentation_review', 'none'));

-- Add smoke test template (JSONB for structured steps)
ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS smoke_test_template JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sd_type_validation_profiles.smoke_test_template IS
  'Template for smoke test steps. Array of {step_number, instruction_template, expected_outcome_template}. Merged with SD-specific context at runtime.';

-- Add LLM UX Oracle requirements
ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS requires_llm_ux_validation BOOLEAN DEFAULT false;

COMMENT ON COLUMN sd_type_validation_profiles.requires_llm_ux_validation IS
  'If true, LLM UX Oracle (GPT-5.2) must evaluate affected pages with minimum score threshold.';

ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS llm_ux_min_score INTEGER DEFAULT 50;

COMMENT ON COLUMN sd_type_validation_profiles.llm_ux_min_score IS
  'Minimum LLM UX Oracle score (0-100) required for SD completion. Default 50 (standard stringency).';

ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS llm_ux_required_lenses TEXT[] DEFAULT ARRAY['first-time-user'];

COMMENT ON COLUMN sd_type_validation_profiles.llm_ux_required_lenses IS
  'Which LLM UX Oracle lenses must pass: first-time-user, accessibility, mobile-user, error-recovery, cognitive-load';

-- Add UAT Agent requirements
ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS requires_uat_execution BOOLEAN DEFAULT false;

COMMENT ON COLUMN sd_type_validation_profiles.requires_uat_execution IS
  'If true, UAT Agent must execute smoke test steps via Playwright MCP and capture evidence.';

-- ============================================================================
-- PART 2: Update existing SD type profiles with intelligent defaults
-- ============================================================================

-- Feature SDs: Full human verification (UI smoke test + LLM UX Oracle)
UPDATE sd_type_validation_profiles
SET
  requires_human_verifiable_outcome = true,
  human_verification_type = 'ui_smoke_test',
  requires_llm_ux_validation = true,
  llm_ux_min_score = 50,
  llm_ux_required_lenses = ARRAY['first-time-user', 'error-recovery'],
  requires_uat_execution = true,
  smoke_test_template = '[
    {"step_number": 1, "instruction_template": "Navigate to the feature URL: {feature_url}", "expected_outcome_template": "Page loads without errors"},
    {"step_number": 2, "instruction_template": "Verify the main UI elements are visible", "expected_outcome_template": "All primary components render correctly"},
    {"step_number": 3, "instruction_template": "Perform the primary user action: {primary_action}", "expected_outcome_template": "Action completes successfully with visible feedback"},
    {"step_number": 4, "instruction_template": "Check for any console errors", "expected_outcome_template": "No JavaScript errors in console"}
  ]'::jsonb
WHERE sd_type = 'feature';

-- Security SDs: API-level verification (auth flows, permission checks)
UPDATE sd_type_validation_profiles
SET
  requires_human_verifiable_outcome = true,
  human_verification_type = 'api_test',
  requires_llm_ux_validation = false,  -- Security is about correctness, not UX
  requires_uat_execution = true,
  smoke_test_template = '[
    {"step_number": 1, "instruction_template": "Attempt unauthorized access to protected resource", "expected_outcome_template": "Request is rejected with 401/403"},
    {"step_number": 2, "instruction_template": "Authenticate with valid credentials", "expected_outcome_template": "Authentication succeeds, token/session created"},
    {"step_number": 3, "instruction_template": "Access protected resource with auth", "expected_outcome_template": "Resource is accessible"},
    {"step_number": 4, "instruction_template": "Verify RLS policies via direct query", "expected_outcome_template": "Only authorized rows returned"}
  ]'::jsonb
WHERE sd_type = 'security';

-- Database SDs: API-level verification (schema changes, data integrity)
UPDATE sd_type_validation_profiles
SET
  requires_human_verifiable_outcome = true,
  human_verification_type = 'api_test',
  requires_llm_ux_validation = false,
  requires_uat_execution = false,  -- No UI to test
  smoke_test_template = '[
    {"step_number": 1, "instruction_template": "Verify migration applied successfully", "expected_outcome_template": "No migration errors, schema matches expected"},
    {"step_number": 2, "instruction_template": "Insert test data via API", "expected_outcome_template": "Data inserted correctly with constraints enforced"},
    {"step_number": 3, "instruction_template": "Query data via application", "expected_outcome_template": "Data retrieved correctly, RLS applied"}
  ]'::jsonb
WHERE sd_type = 'database';

-- Infrastructure SDs: CLI verification (scripts, pipelines)
UPDATE sd_type_validation_profiles
SET
  requires_human_verifiable_outcome = false,  -- Internal tooling, not user-facing
  human_verification_type = 'cli_verification',
  requires_llm_ux_validation = false,
  requires_uat_execution = false,
  smoke_test_template = '[
    {"step_number": 1, "instruction_template": "Run the script/pipeline", "expected_outcome_template": "Exits with code 0, no errors"},
    {"step_number": 2, "instruction_template": "Verify expected output/artifacts", "expected_outcome_template": "Output matches expected format"}
  ]'::jsonb
WHERE sd_type = 'infrastructure';

-- Documentation SDs: No human verification (docs review is manual)
UPDATE sd_type_validation_profiles
SET
  requires_human_verifiable_outcome = false,
  human_verification_type = 'none',
  requires_llm_ux_validation = false,
  requires_uat_execution = false,
  smoke_test_template = '[]'::jsonb
WHERE sd_type = 'documentation';

-- Bugfix SDs: Same as feature (user-visible fix)
UPDATE sd_type_validation_profiles
SET
  requires_human_verifiable_outcome = true,
  human_verification_type = 'ui_smoke_test',
  requires_llm_ux_validation = false,  -- Focus on fix correctness, not UX redesign
  requires_uat_execution = true,
  smoke_test_template = '[
    {"step_number": 1, "instruction_template": "Reproduce the original bug scenario", "expected_outcome_template": "Bug no longer occurs"},
    {"step_number": 2, "instruction_template": "Verify fix does not introduce regression", "expected_outcome_template": "Related functionality still works"},
    {"step_number": 3, "instruction_template": "Check console for errors", "expected_outcome_template": "No new errors introduced"}
  ]'::jsonb
WHERE sd_type = 'bugfix';

-- Refactor SDs: No human verification (behavior unchanged by definition)
UPDATE sd_type_validation_profiles
SET
  requires_human_verifiable_outcome = false,
  human_verification_type = 'none',
  requires_llm_ux_validation = false,
  requires_uat_execution = false,
  smoke_test_template = '[]'::jsonb
WHERE sd_type = 'refactor';

-- Performance SDs: API-level verification (latency, throughput)
UPDATE sd_type_validation_profiles
SET
  requires_human_verifiable_outcome = true,
  human_verification_type = 'api_test',
  requires_llm_ux_validation = false,
  requires_uat_execution = false,
  smoke_test_template = '[
    {"step_number": 1, "instruction_template": "Run performance benchmark", "expected_outcome_template": "Latency/throughput meets target metrics"},
    {"step_number": 2, "instruction_template": "Compare before/after metrics", "expected_outcome_template": "Measurable improvement over baseline"}
  ]'::jsonb
WHERE sd_type = 'performance';

-- Orchestrator SDs: No direct verification (children handle it)
UPDATE sd_type_validation_profiles
SET
  requires_human_verifiable_outcome = false,
  human_verification_type = 'none',
  requires_llm_ux_validation = false,
  requires_uat_execution = false,
  smoke_test_template = '[]'::jsonb
WHERE sd_type = 'orchestrator';

-- ============================================================================
-- PART 3: Add smoke_test_steps column to strategic_directives_v2
-- ============================================================================

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS smoke_test_steps JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN strategic_directives_v2.smoke_test_steps IS
  'SD-specific smoke test steps. Array of {step_number, instruction, expected_outcome, evidence_url}. Populated from template + SD context. Required for feature SDs.';

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS human_verification_status TEXT DEFAULT 'not_required';

COMMENT ON COLUMN strategic_directives_v2.human_verification_status IS
  'Status of human-verifiable outcome validation: not_required, pending, in_progress, passed, failed';

ALTER TABLE strategic_directives_v2
ADD CONSTRAINT valid_human_verification_status
CHECK (human_verification_status IN ('not_required', 'pending', 'in_progress', 'passed', 'failed'));

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS llm_ux_score INTEGER;

COMMENT ON COLUMN strategic_directives_v2.llm_ux_score IS
  'LLM UX Oracle average score for this SD (0-100). NULL if not evaluated.';

-- ============================================================================
-- PART 4: Create view for human verification requirements
-- ============================================================================

CREATE OR REPLACE VIEW v_sd_human_verification_requirements AS
SELECT
  sd.id as sd_id,
  sd.sd_key,
  sd.title,
  sd.sd_type,
  sd.status,
  sd.human_verification_status,
  sd.smoke_test_steps,
  sd.llm_ux_score,

  -- From validation profile
  vp.requires_human_verifiable_outcome,
  vp.human_verification_type,
  vp.requires_llm_ux_validation,
  vp.llm_ux_min_score,
  vp.llm_ux_required_lenses,
  vp.requires_uat_execution,
  vp.smoke_test_template,

  -- Computed: Is verification required and pending?
  CASE
    WHEN vp.requires_human_verifiable_outcome = true
      AND sd.human_verification_status IN ('pending', 'in_progress', 'failed')
    THEN true
    ELSE false
  END as verification_blocking,

  -- Computed: Did LLM UX pass threshold?
  CASE
    WHEN vp.requires_llm_ux_validation = true
      AND (sd.llm_ux_score IS NULL OR sd.llm_ux_score < vp.llm_ux_min_score)
    THEN false
    WHEN vp.requires_llm_ux_validation = true
      AND sd.llm_ux_score >= vp.llm_ux_min_score
    THEN true
    ELSE NULL  -- Not applicable
  END as llm_ux_passed

FROM strategic_directives_v2 sd
LEFT JOIN sd_type_validation_profiles vp ON vp.sd_type = COALESCE(sd.sd_type, 'feature');

COMMENT ON VIEW v_sd_human_verification_requirements IS
  'View combining SD data with human verification requirements from sd_type_validation_profiles. Used by handoff validators to determine if human verification is needed.';

-- ============================================================================
-- PART 5: Create function to check human verification gate
-- ============================================================================

CREATE OR REPLACE FUNCTION check_human_verification_gate(p_sd_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_sd RECORD;
  v_profile RECORD;
BEGIN
  -- Get SD and its validation profile
  SELECT
    sd.*,
    vp.requires_human_verifiable_outcome,
    vp.human_verification_type,
    vp.requires_llm_ux_validation,
    vp.llm_ux_min_score,
    vp.requires_uat_execution
  INTO v_sd
  FROM strategic_directives_v2 sd
  LEFT JOIN sd_type_validation_profiles vp ON vp.sd_type = COALESCE(sd.sd_type, 'feature')
  WHERE sd.id = p_sd_id;

  IF v_sd IS NULL THEN
    RETURN jsonb_build_object(
      'passed', false,
      'error', 'SD not found',
      'sd_id', p_sd_id
    );
  END IF;

  -- If no human verification required, auto-pass
  IF v_sd.requires_human_verifiable_outcome = false THEN
    RETURN jsonb_build_object(
      'passed', true,
      'reason', 'Human verification not required for sd_type: ' || COALESCE(v_sd.sd_type, 'unknown'),
      'sd_id', p_sd_id,
      'sd_type', v_sd.sd_type
    );
  END IF;

  -- Check human verification status
  IF v_sd.human_verification_status = 'passed' THEN
    v_result := jsonb_build_object(
      'passed', true,
      'reason', 'Human verification completed successfully',
      'verification_type', v_sd.human_verification_type
    );
  ELSIF v_sd.human_verification_status = 'failed' THEN
    v_result := jsonb_build_object(
      'passed', false,
      'reason', 'Human verification failed - smoke test did not pass',
      'verification_type', v_sd.human_verification_type,
      'action_required', 'Fix issues and re-run UAT Agent'
    );
  ELSIF v_sd.human_verification_status IN ('pending', 'in_progress') THEN
    v_result := jsonb_build_object(
      'passed', false,
      'reason', 'Human verification not yet completed',
      'verification_type', v_sd.human_verification_type,
      'status', v_sd.human_verification_status,
      'action_required', 'Run UAT Agent to execute smoke tests'
    );
  ELSE
    -- Status is 'not_required' but profile says it IS required - inconsistency
    v_result := jsonb_build_object(
      'passed', false,
      'reason', 'Human verification required but status is not_required - need to initialize',
      'action_required', 'Initialize smoke test steps and run UAT Agent'
    );
  END IF;

  -- Add LLM UX check if required
  IF v_sd.requires_llm_ux_validation = true THEN
    IF v_sd.llm_ux_score IS NULL THEN
      v_result := v_result || jsonb_build_object(
        'llm_ux_passed', false,
        'llm_ux_reason', 'LLM UX Oracle evaluation not yet performed'
      );
      v_result := jsonb_set(v_result, '{passed}', 'false'::jsonb);
    ELSIF v_sd.llm_ux_score < v_sd.llm_ux_min_score THEN
      v_result := v_result || jsonb_build_object(
        'llm_ux_passed', false,
        'llm_ux_score', v_sd.llm_ux_score,
        'llm_ux_min_score', v_sd.llm_ux_min_score,
        'llm_ux_reason', 'LLM UX score below threshold'
      );
      v_result := jsonb_set(v_result, '{passed}', 'false'::jsonb);
    ELSE
      v_result := v_result || jsonb_build_object(
        'llm_ux_passed', true,
        'llm_ux_score', v_sd.llm_ux_score
      );
    END IF;
  END IF;

  -- Add metadata
  v_result := v_result || jsonb_build_object(
    'sd_id', p_sd_id,
    'sd_type', v_sd.sd_type,
    'requires_uat_execution', v_sd.requires_uat_execution,
    'smoke_test_steps_count', jsonb_array_length(COALESCE(v_sd.smoke_test_steps, '[]'::jsonb))
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION check_human_verification_gate(UUID) IS
  'Checks if an SD passes the human verification gate. Returns {passed: boolean, reason: string, ...}. Called by handoff validators.';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION check_human_verification_gate(UUID) TO authenticated;

COMMIT;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================
-- BEGIN;
-- ALTER TABLE sd_type_validation_profiles DROP COLUMN IF EXISTS requires_human_verifiable_outcome;
-- ALTER TABLE sd_type_validation_profiles DROP COLUMN IF EXISTS human_verification_type;
-- ALTER TABLE sd_type_validation_profiles DROP COLUMN IF EXISTS smoke_test_template;
-- ALTER TABLE sd_type_validation_profiles DROP COLUMN IF EXISTS requires_llm_ux_validation;
-- ALTER TABLE sd_type_validation_profiles DROP COLUMN IF EXISTS llm_ux_min_score;
-- ALTER TABLE sd_type_validation_profiles DROP COLUMN IF EXISTS llm_ux_required_lenses;
-- ALTER TABLE sd_type_validation_profiles DROP COLUMN IF EXISTS requires_uat_execution;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS smoke_test_steps;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS human_verification_status;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS llm_ux_score;
-- DROP VIEW IF EXISTS v_sd_human_verification_requirements;
-- DROP FUNCTION IF EXISTS check_human_verification_gate(UUID);
-- COMMIT;
