-- ============================================================================
-- Migration: E2E Requirements in User Story Templates
-- Purpose: Ensure UI/feature SDs include E2E test requirements in acceptance criteria
-- Root Cause: "No E2E tests created for Phase 3. ROOT CAUSE: E2E not in acceptance criteria"
-- Source: D1/D2/D3 Retrospectives (SD-VISION-TRANSITION-001)
-- Date: 2025-12-11
-- LEO Protocol Version: 4.3.5 - E2E Governance Enhancement
-- ============================================================================

-- ============================================================================
-- PART 1: Add E2E Template Fields to sd_type_validation_profiles
-- ============================================================================

-- Add columns to track E2E acceptance criteria requirements by SD type
ALTER TABLE sd_type_validation_profiles
  ADD COLUMN IF NOT EXISTS requires_e2e_in_acceptance_criteria BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS e2e_acceptance_criteria_template JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS story_e2e_guidance TEXT DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN sd_type_validation_profiles.requires_e2e_in_acceptance_criteria IS
'If true, user stories for this SD type MUST include E2E test criteria in acceptance_criteria field';

COMMENT ON COLUMN sd_type_validation_profiles.e2e_acceptance_criteria_template IS
'Template JSON for E2E acceptance criteria that should be included in user stories';

COMMENT ON COLUMN sd_type_validation_profiles.story_e2e_guidance IS
'Guidance text shown when creating user stories for this SD type';

-- ============================================================================
-- PART 2: Update SD Types with E2E Requirements
-- ============================================================================

-- Feature type: REQUIRES E2E in acceptance criteria
UPDATE sd_type_validation_profiles
SET
  requires_e2e_in_acceptance_criteria = true,
  e2e_acceptance_criteria_template = '{
    "e2e_test_scenario": {
      "given": "User is [describe precondition]",
      "when": "User [performs action]",
      "then": "System should [expected behavior]"
    },
    "e2e_test_file_pattern": "tests/e2e/{story-key}.spec.ts",
    "e2e_validation_criteria": [
      "All UI interactions are testable via Playwright",
      "Happy path is covered",
      "Error states are verified",
      "Accessibility requirements met"
    ]
  }'::jsonb,
  story_e2e_guidance = 'FEATURE STORY E2E REQUIREMENTS:
Every user story MUST include:
1. E2E test scenario in Given/When/Then format
2. Test file path in e2e_test_path column
3. All acceptance criteria must be verifiable via E2E test

Failure to include E2E criteria will block EXEC-TO-PLAN handoff.'
WHERE sd_type = 'feature';

-- Bugfix type: REQUIRES E2E in acceptance criteria
UPDATE sd_type_validation_profiles
SET
  requires_e2e_in_acceptance_criteria = true,
  e2e_acceptance_criteria_template = '{
    "regression_test": {
      "given": "The bug scenario that was failing",
      "when": "User [reproduces original bug steps]",
      "then": "System should [correct behavior, not buggy behavior]"
    },
    "e2e_test_file_pattern": "tests/e2e/regression/{bug-id}.spec.ts"
  }'::jsonb,
  story_e2e_guidance = 'BUGFIX STORY E2E REQUIREMENTS:
Every bugfix user story MUST include:
1. Regression test scenario that reproduces the bug
2. Test file path for the regression test
3. Verification that bug no longer occurs'
WHERE sd_type = 'bugfix';

-- Refactor type: REQUIRES E2E in acceptance criteria
UPDATE sd_type_validation_profiles
SET
  requires_e2e_in_acceptance_criteria = true,
  e2e_acceptance_criteria_template = '{
    "non_regression_test": {
      "given": "Existing functionality before refactor",
      "when": "User performs same actions after refactor",
      "then": "Behavior remains identical"
    },
    "e2e_test_file_pattern": "tests/e2e/{affected-feature}.spec.ts"
  }'::jsonb,
  story_e2e_guidance = 'REFACTOR STORY E2E REQUIREMENTS:
Every refactor user story MUST include:
1. Non-regression test proving behavior unchanged
2. Reference to existing tests that must continue passing
3. Any new tests for improved code paths'
WHERE sd_type = 'refactor';

-- Security type: REQUIRES E2E in acceptance criteria
UPDATE sd_type_validation_profiles
SET
  requires_e2e_in_acceptance_criteria = true,
  e2e_acceptance_criteria_template = '{
    "security_test": {
      "given": "Authentication/authorization context",
      "when": "User attempts [protected action]",
      "then": "System enforces security constraint"
    },
    "e2e_test_file_pattern": "tests/e2e/security/{security-feature}.spec.ts"
  }'::jsonb,
  story_e2e_guidance = 'SECURITY STORY E2E REQUIREMENTS:
Every security user story MUST include:
1. Security test scenario covering authorization
2. Negative test cases (unauthorized access denied)
3. RLS policy verification if applicable'
WHERE sd_type = 'security';

-- Performance type: REQUIRES E2E in acceptance criteria
UPDATE sd_type_validation_profiles
SET
  requires_e2e_in_acceptance_criteria = true,
  e2e_acceptance_criteria_template = '{
    "performance_test": {
      "given": "Load conditions [describe]",
      "when": "User performs action",
      "then": "Response time < [X]ms"
    },
    "baseline_metrics": "Must establish before/after comparison"
  }'::jsonb,
  story_e2e_guidance = 'PERFORMANCE STORY E2E REQUIREMENTS:
Every performance user story MUST include:
1. Baseline performance metrics (before)
2. Target performance metrics (after)
3. Test scenario that measures improvement'
WHERE sd_type = 'performance';

-- Database type: Does NOT require E2E in acceptance criteria
UPDATE sd_type_validation_profiles
SET
  requires_e2e_in_acceptance_criteria = false,
  story_e2e_guidance = 'DATABASE STORY E2E EXEMPTION:
Database SDs do not require E2E tests in acceptance criteria.
Validation is via:
1. Migration success verification
2. SQL test queries
3. Sub-agent verification'
WHERE sd_type = 'database';

-- Docs type: Does NOT require E2E in acceptance criteria
UPDATE sd_type_validation_profiles
SET
  requires_e2e_in_acceptance_criteria = false,
  story_e2e_guidance = 'DOCS STORY E2E EXEMPTION:
Documentation SDs do not require E2E tests.
Validation is via:
1. Content review
2. Link verification
3. Format compliance'
WHERE sd_type = 'docs';

-- Infrastructure type: Does NOT require E2E in acceptance criteria
UPDATE sd_type_validation_profiles
SET
  requires_e2e_in_acceptance_criteria = false,
  story_e2e_guidance = 'INFRASTRUCTURE STORY E2E EXEMPTION:
Infrastructure SDs do not require E2E tests.
Validation is via:
1. CI/CD pipeline verification
2. Health check endpoints
3. Manual verification of environment changes'
WHERE sd_type = 'infrastructure';

-- ============================================================================
-- PART 3: User Story E2E Validation Function
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_story_e2e_requirements(story_id_param UUID)
RETURNS JSONB AS $$
DECLARE
  story RECORD;
  sd RECORD;
  profile RECORD;
  acceptance_criteria JSONB;
  has_e2e_criteria BOOLEAN := false;
  issues JSONB := '[]'::jsonb;
BEGIN
  -- Get story
  SELECT * INTO story FROM user_stories WHERE id = story_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Story not found');
  END IF;

  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = story.sd_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found for story');
  END IF;

  -- Get validation profile
  SELECT * INTO profile
  FROM sd_type_validation_profiles
  WHERE sd_type = COALESCE(sd.sd_type, 'feature');

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- If E2E not required for this SD type, return valid
  IF NOT profile.requires_e2e_in_acceptance_criteria THEN
    RETURN jsonb_build_object(
      'valid', true,
      'e2e_required', false,
      'reason', 'SD type ' || profile.sd_type || ' does not require E2E in acceptance criteria',
      'guidance', profile.story_e2e_guidance
    );
  END IF;

  -- Check acceptance_criteria field for E2E content
  acceptance_criteria := story.acceptance_criteria;

  -- Look for E2E-related keywords in acceptance criteria
  IF acceptance_criteria IS NOT NULL AND jsonb_array_length(acceptance_criteria) > 0 THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(acceptance_criteria) AS ac
      WHERE ac ILIKE '%e2e%'
         OR ac ILIKE '%playwright%'
         OR ac ILIKE '%test%scenario%'
         OR ac ILIKE '%given%when%then%'
         OR ac ILIKE '%automated test%'
    ) INTO has_e2e_criteria;
  END IF;

  -- Check e2e_test_path column
  IF story.e2e_test_path IS NULL OR story.e2e_test_path = '' THEN
    issues := issues || jsonb_build_array('e2e_test_path is not set');
  END IF;

  -- Check acceptance criteria content
  IF NOT has_e2e_criteria THEN
    issues := issues || jsonb_build_array('acceptance_criteria does not contain E2E test requirements');
  END IF;

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(issues) = 0,
    'e2e_required', true,
    'story_id', story_id_param,
    'story_key', story.story_key,
    'sd_type', profile.sd_type,
    'has_e2e_path', story.e2e_test_path IS NOT NULL AND story.e2e_test_path != '',
    'has_e2e_criteria', has_e2e_criteria,
    'issues', issues,
    'template', profile.e2e_acceptance_criteria_template,
    'guidance', profile.story_e2e_guidance
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION validate_story_e2e_requirements IS
'Validates that a user story includes E2E test requirements based on SD type.
Returns validation status and guidance for fixing issues.';

-- ============================================================================
-- PART 4: Batch Validation Function for SD
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_sd_stories_e2e_requirements(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  profile RECORD;
  story RECORD;
  story_validation JSONB;
  all_validations JSONB := '[]'::jsonb;
  total_stories INTEGER := 0;
  valid_stories INTEGER := 0;
  issues_found JSONB := '[]'::jsonb;
BEGIN
  -- Get SD and profile
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  SELECT * INTO profile
  FROM sd_type_validation_profiles
  WHERE sd_type = COALESCE(sd.sd_type, 'feature');

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- If E2E not required, all stories are valid
  IF NOT profile.requires_e2e_in_acceptance_criteria THEN
    RETURN jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', profile.sd_type,
      'e2e_required', false,
      'all_valid', true,
      'message', 'SD type does not require E2E in acceptance criteria',
      'guidance', profile.story_e2e_guidance
    );
  END IF;

  -- Validate each story
  FOR story IN
    SELECT * FROM user_stories WHERE sd_id = sd_id_param
  LOOP
    total_stories := total_stories + 1;
    story_validation := validate_story_e2e_requirements(story.id);

    IF (story_validation->>'valid')::boolean THEN
      valid_stories := valid_stories + 1;
    ELSE
      issues_found := issues_found || jsonb_build_object(
        'story_id', story.id,
        'story_key', story.story_key,
        'title', story.title,
        'issues', story_validation->'issues'
      );
    END IF;

    all_validations := all_validations || story_validation;
  END LOOP;

  RETURN jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', profile.sd_type,
    'e2e_required', true,
    'total_stories', total_stories,
    'valid_stories', valid_stories,
    'all_valid', valid_stories = total_stories,
    'validation_rate', CASE WHEN total_stories > 0 THEN ROUND(valid_stories::NUMERIC / total_stories * 100, 2) ELSE 100 END,
    'issues', issues_found,
    'template', profile.e2e_acceptance_criteria_template,
    'guidance', profile.story_e2e_guidance,
    'details', all_validations
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION validate_sd_stories_e2e_requirements IS
'Validates all user stories for an SD have required E2E test requirements.
Used during PLAN phase to ensure stories are properly structured before EXEC.';

-- ============================================================================
-- PART 5: Helper Function to Get E2E Template for SD Type
-- ============================================================================

CREATE OR REPLACE FUNCTION get_e2e_template_for_sd(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  profile RECORD;
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  SELECT * INTO profile
  FROM sd_type_validation_profiles
  WHERE sd_type = COALESCE(sd.sd_type, 'feature');

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  RETURN jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', profile.sd_type,
    'requires_e2e', profile.requires_e2e_in_acceptance_criteria,
    'template', profile.e2e_acceptance_criteria_template,
    'guidance', profile.story_e2e_guidance,
    'test_file_pattern', CASE
      WHEN profile.e2e_acceptance_criteria_template IS NOT NULL
      THEN profile.e2e_acceptance_criteria_template->>'e2e_test_file_pattern'
      ELSE 'tests/e2e/{story-key}.spec.ts'
    END
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_e2e_template_for_sd IS
'Returns the E2E acceptance criteria template for an SD based on its type.
Use when creating user stories to ensure proper E2E requirements are included.';

-- ============================================================================
-- PART 6: View for Story E2E Compliance Status
-- ============================================================================

CREATE OR REPLACE VIEW v_story_e2e_compliance AS
SELECT
  us.id AS story_id,
  us.story_key,
  us.title,
  us.sd_id,
  sd.sd_type,
  p.requires_e2e_in_acceptance_criteria AS e2e_required,
  us.e2e_test_path IS NOT NULL AND us.e2e_test_path != '' AS has_e2e_path,
  us.e2e_test_status,
  CASE
    WHEN NOT p.requires_e2e_in_acceptance_criteria THEN 'exempt'
    WHEN us.e2e_test_path IS NOT NULL AND us.e2e_test_status = 'passing' THEN 'compliant'
    WHEN us.e2e_test_path IS NOT NULL AND us.e2e_test_status IN ('created', 'failing') THEN 'partial'
    ELSE 'non_compliant'
  END AS compliance_status,
  p.story_e2e_guidance AS guidance
FROM user_stories us
JOIN strategic_directives_v2 sd ON us.sd_id = sd.id
LEFT JOIN sd_type_validation_profiles p ON p.sd_type = COALESCE(sd.sd_type, 'feature');

COMMENT ON VIEW v_story_e2e_compliance IS
'Shows E2E compliance status for all user stories based on SD type requirements.
Stories are marked exempt if SD type does not require E2E tests.';

-- ============================================================================
-- PART 7: Aggregate View for SD E2E Readiness
-- ============================================================================

CREATE OR REPLACE VIEW v_sd_e2e_readiness AS
SELECT
  sd_id,
  sd_type,
  bool_and(e2e_required) AS e2e_required_for_type,
  COUNT(*) AS total_stories,
  COUNT(*) FILTER (WHERE compliance_status = 'compliant') AS compliant_stories,
  COUNT(*) FILTER (WHERE compliance_status = 'partial') AS partial_stories,
  COUNT(*) FILTER (WHERE compliance_status = 'non_compliant') AS non_compliant_stories,
  COUNT(*) FILTER (WHERE compliance_status = 'exempt') AS exempt_stories,
  CASE
    WHEN bool_and(NOT e2e_required) THEN true
    WHEN COUNT(*) FILTER (WHERE compliance_status IN ('compliant', 'exempt')) = COUNT(*) THEN true
    ELSE false
  END AS ready_for_exec,
  ROUND(
    COUNT(*) FILTER (WHERE compliance_status IN ('compliant', 'exempt'))::NUMERIC /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) AS compliance_rate
FROM v_story_e2e_compliance
GROUP BY sd_id, sd_type;

COMMENT ON VIEW v_sd_e2e_readiness IS
'Aggregates E2E compliance across all stories for an SD.
ready_for_exec indicates whether SD can proceed to EXEC phase with current story state.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'E2E Requirements in Story Templates Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'ROOT CAUSE ADDRESSED:';
  RAISE NOTICE '  "No E2E tests created for Phase 3."';
  RAISE NOTICE '  "ROOT CAUSE: E2E not in acceptance criteria"';
  RAISE NOTICE '  "WHY: UI SD template did not include E2E requirements"';
  RAISE NOTICE '';
  RAISE NOTICE 'CHANGES MADE:';
  RAISE NOTICE '  1. Added E2E template columns to sd_type_validation_profiles';
  RAISE NOTICE '  2. Updated SD types with E2E requirements:';
  RAISE NOTICE '     - feature, bugfix, refactor, security, performance: REQUIRE E2E';
  RAISE NOTICE '     - database, docs, infrastructure: EXEMPT from E2E';
  RAISE NOTICE '  3. Created validate_story_e2e_requirements() function';
  RAISE NOTICE '  4. Created validate_sd_stories_e2e_requirements() function';
  RAISE NOTICE '  5. Created get_e2e_template_for_sd() helper';
  RAISE NOTICE '  6. Created v_story_e2e_compliance view';
  RAISE NOTICE '  7. Created v_sd_e2e_readiness view';
  RAISE NOTICE '';
  RAISE NOTICE 'USAGE:';
  RAISE NOTICE '  -- Get E2E template for SD:';
  RAISE NOTICE '  SELECT get_e2e_template_for_sd(''SD-XXX'');';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Validate all stories have E2E requirements:';
  RAISE NOTICE '  SELECT validate_sd_stories_e2e_requirements(''SD-XXX'');';
  RAISE NOTICE '';
  RAISE NOTICE '  -- Check SD E2E readiness:';
  RAISE NOTICE '  SELECT * FROM v_sd_e2e_readiness WHERE sd_id = ''SD-XXX'';';
  RAISE NOTICE '============================================================';
END $$;
