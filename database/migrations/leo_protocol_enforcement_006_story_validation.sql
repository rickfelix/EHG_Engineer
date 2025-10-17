-- LEO Protocol Enhancement #6: User Story E2E Validation Gate
-- Purpose: Prevent PLAN->LEAD handoff without validating all user stories
-- Root Cause Fixed: User stories not validated (no gate)
-- Date: 2025-10-10
-- Related SD: SD-AGENT-MIGRATION-001 had 5 user stories with validation_status='NO'

-- ============================================================================
-- SCHEMA CHANGES: Add E2E test tracking to user_stories table
-- ============================================================================

ALTER TABLE user_stories
  ADD COLUMN IF NOT EXISTS e2e_test_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS e2e_test_status VARCHAR(50) DEFAULT 'not_created' CHECK (e2e_test_status IN (
    'not_created',
    'created',
    'passing',
    'failing',
    'skipped'
  )),
  ADD COLUMN IF NOT EXISTS e2e_test_last_run TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS e2e_test_evidence TEXT, -- Screenshot URL, video URL, or test report URL
  ADD COLUMN IF NOT EXISTS e2e_test_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) DEFAULT 'pending' CHECK (validation_status IN (
    'pending',
    'in_progress',
    'validated',
    'failed',
    'skipped'
  ));

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_user_stories_e2e_status ON user_stories(sd_id, e2e_test_status);
CREATE INDEX IF NOT EXISTS idx_user_stories_validation_status ON user_stories(sd_id, validation_status);

-- ============================================================================
-- FUNCTION: Validate all user stories for an SD
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_user_stories_complete(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  total_stories INTEGER;
  validated_stories INTEGER;
  passing_tests INTEGER;
  unvalidated_stories JSONB;
  validation_rate INTEGER;
BEGIN
  -- Count total stories
  SELECT COUNT(*) INTO total_stories
  FROM user_stories
  WHERE sd_id = sd_id_param;

  IF total_stories = 0 THEN
    RETURN jsonb_build_object(
      'has_stories', false,
      'message', 'No user stories found - Product Requirements Expert should generate stories',
      'can_proceed', false
    );
  END IF;

  -- Count validated stories (E2E test passing)
  SELECT COUNT(*) INTO validated_stories
  FROM user_stories
  WHERE sd_id = sd_id_param
  AND validation_status = 'validated'
  AND e2e_test_status = 'passing';

  -- Count tests that exist and are passing
  SELECT COUNT(*) INTO passing_tests
  FROM user_stories
  WHERE sd_id = sd_id_param
  AND e2e_test_status = 'passing';

  -- Calculate validation rate
  validation_rate := CASE
    WHEN total_stories > 0 THEN (validated_stories * 100 / total_stories)
    ELSE 0
  END;

  -- Get list of unvalidated stories
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'title', title,
    'priority', priority,
    'validation_status', validation_status,
    'e2e_test_status', e2e_test_status,
    'e2e_test_path', e2e_test_path,
    'reason', CASE
      WHEN e2e_test_status = 'not_created' THEN 'E2E test not created'
      WHEN e2e_test_status = 'created' THEN 'E2E test created but not run'
      WHEN e2e_test_status = 'failing' THEN format('E2E test failing: %s', e2e_test_failure_reason)
      WHEN validation_status != 'validated' THEN 'Story not validated'
      ELSE 'Unknown issue'
    END
  )) INTO unvalidated_stories
  FROM user_stories
  WHERE sd_id = sd_id_param
  AND (validation_status != 'validated' OR e2e_test_status != 'passing');

  RETURN jsonb_build_object(
    'has_stories', true,
    'total', total_stories,
    'validated', validated_stories,
    'passing_tests', passing_tests,
    'validation_rate', validation_rate,
    'all_validated', validated_stories = total_stories,
    'can_proceed', validated_stories = total_stories,
    'unvalidated', COALESCE(unvalidated_stories, '[]'::jsonb),
    'message', CASE
      WHEN validated_stories = total_stories THEN format('All %s user stories validated', total_stories)
      ELSE format('%s/%s stories validated (%s%%) - cannot proceed until 100%%', validated_stories, total_stories, validation_rate)
    END
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Auto-mark story as validated when E2E test passes
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_validate_story_on_test_pass()
RETURNS TRIGGER AS $$
BEGIN
  -- If E2E test status changed to 'passing', auto-update validation_status
  IF NEW.e2e_test_status = 'passing' AND OLD.e2e_test_status != 'passing' THEN
    NEW.validation_status := 'validated';
    NEW.e2e_test_last_run := NOW();

    RAISE NOTICE 'User story % auto-validated (E2E test passing)', NEW.title;
  END IF;

  -- If E2E test status changed to 'failing', mark validation as failed
  IF NEW.e2e_test_status = 'failing' AND OLD.e2e_test_status != 'failing' THEN
    NEW.validation_status := 'failed';
    NEW.e2e_test_last_run := NOW();

    RAISE NOTICE 'User story % validation failed (E2E test failing)', NEW.title;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_validate_story_trigger
  BEFORE UPDATE OF e2e_test_status
  ON user_stories
  FOR EACH ROW
  EXECUTE FUNCTION auto_validate_story_on_test_pass();

-- ============================================================================
-- FUNCTION: Get E2E test generation script commands
-- ============================================================================

CREATE OR REPLACE FUNCTION get_e2e_test_commands(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  commands JSONB := '[]'::jsonb;
  story RECORD;
BEGIN
  FOR story IN
    SELECT id, title, acceptance_criteria
    FROM user_stories
    WHERE sd_id = sd_id_param
    AND e2e_test_status = 'not_created'
    ORDER BY priority DESC
  LOOP
    commands := commands || jsonb_build_object(
      'story_id', story.id,
      'story_title', story.title,
      'command', format('node scripts/generate-e2e-test-for-story.mjs %s %s', sd_id_param, story.id),
      'playwright_command', format('npx playwright test tests/e2e/%s.spec.ts', lower(regexp_replace(story.title, '[^a-zA-Z0-9]+', '-', 'g')))
    );
  END LOOP;

  RETURN jsonb_build_object(
    'total_commands', jsonb_array_length(commands),
    'commands', commands,
    'batch_command', format('node scripts/generate-all-e2e-tests.mjs %s', sd_id_param)
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Check if stories block PLAN->LEAD handoff
-- ============================================================================

CREATE OR REPLACE FUNCTION check_stories_for_lead_handoff(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  validation JSONB;
BEGIN
  validation := validate_user_stories_complete(sd_id_param);

  -- If no stories, don't block (stories are optional in some cases)
  IF NOT (validation->>'has_stories')::boolean THEN
    RETURN jsonb_build_object(
      'blocking', false,
      'warning', 'No user stories found',
      'recommendation', 'Consider using Product Requirements Expert to generate stories'
    );
  END IF;

  -- If stories exist, they MUST be validated
  IF NOT (validation->>'all_validated')::boolean THEN
    RETURN jsonb_build_object(
      'blocking', true,
      'validation', validation,
      'action_required', 'Run E2E tests for all user stories and ensure they pass'
    );
  END IF;

  RETURN jsonb_build_object(
    'blocking', false,
    'validation', validation,
    'message', 'All user stories validated'
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN user_stories.e2e_test_path IS 'Path to Playwright E2E test file (e.g., tests/e2e/user-login.spec.ts)';
COMMENT ON COLUMN user_stories.e2e_test_status IS 'Status of E2E test: not_created, created, passing, failing, skipped';
COMMENT ON COLUMN user_stories.e2e_test_evidence IS 'URL to test evidence (screenshot, video, or HTML report)';
COMMENT ON COLUMN user_stories.validation_status IS 'Overall validation status: pending, in_progress, validated, failed, skipped';
COMMENT ON FUNCTION validate_user_stories_complete IS 'Validates all user stories have passing E2E tests - returns validation rate and list of unvalidated stories';
COMMENT ON FUNCTION auto_validate_story_on_test_pass IS 'Trigger function that auto-marks story as validated when E2E test passes';
COMMENT ON FUNCTION get_e2e_test_commands IS 'Returns CLI commands to generate E2E tests for stories without tests';
COMMENT ON FUNCTION check_stories_for_lead_handoff IS 'Checks if user stories block PLAN->LEAD handoff - blocks if stories exist but are not validated';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'LEO Protocol Enhancement #6 applied successfully';
  RAISE NOTICE 'Columns added: e2e_test_path, e2e_test_status, e2e_test_last_run, e2e_test_evidence, e2e_test_failure_reason, validation_status';
  RAISE NOTICE 'Function created: validate_user_stories_complete(sd_id)';
  RAISE NOTICE 'Function created: check_stories_for_lead_handoff(sd_id)';
  RAISE NOTICE 'Function created: get_e2e_test_commands(sd_id)';
  RAISE NOTICE 'Trigger created: auto_validate_story_trigger (auto-validates on test pass)';
  RAISE NOTICE 'Enforcement: PLAN->LEAD handoff blocked if user stories exist but not validated';
  RAISE NOTICE 'Validation rate: Must be 100%% for stories that exist';
END $$;
