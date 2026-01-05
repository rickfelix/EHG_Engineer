-- Migration: Fix Progress Calculation - Final Guardrails
-- Date: 2026-01-05
-- Purpose: Add guardrails to prevent progress calculation mismatches
--
-- ROOT CAUSES IDENTIFIED:
-- 1. e2e_test_status = 'skipped' is valid but doesn't count for progress (requires 'passing')
-- 2. sub_agent_execution_results.verdict = 'BLOCKED' is valid but doesn't count (requires 'PASS')
-- 3. No warnings when completing user stories with non-passing test status
--
-- FIXES APPLIED:
-- 1. Add trigger to warn when user story marked completed with non-passing e2e_test_status
-- 2. Add helper function to check if SD can complete based on progress requirements
-- 3. Update documentation in constraint messages

-- ============================================================================
-- STEP 1: Create helper function to check progress requirements
-- ============================================================================

CREATE OR REPLACE FUNCTION check_progress_requirements(sd_id_param TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  user_stories_ok BOOLEAN;
  subagents_ok BOOLEAN;
  stories_total INT;
  stories_passing INT;
  blocked_agents TEXT[];
BEGIN
  -- Check user stories
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE validation_status = 'validated' AND e2e_test_status = 'passing')
  INTO stories_total, stories_passing
  FROM user_stories
  WHERE sd_id = sd_id_param;

  user_stories_ok := (stories_total = 0) OR (stories_total = stories_passing);

  -- Check sub-agents (TESTING is always required)
  SELECT ARRAY_AGG(DISTINCT sub_agent_code)
  INTO blocked_agents
  FROM sub_agent_execution_results
  WHERE sd_id = sd_id_param
    AND sub_agent_code = 'TESTING'
    AND verdict NOT IN ('PASS', 'CONDITIONAL_PASS');

  subagents_ok := blocked_agents IS NULL OR ARRAY_LENGTH(blocked_agents, 1) = 0;

  result := jsonb_build_object(
    'sd_id', sd_id_param,
    'user_stories_ok', user_stories_ok,
    'user_stories_detail', jsonb_build_object(
      'total', stories_total,
      'passing', stories_passing,
      'issue', CASE
        WHEN NOT user_stories_ok THEN
          format('%s of %s stories have e2e_test_status = passing (all must pass)', stories_passing, stories_total)
        ELSE NULL
      END
    ),
    'subagents_ok', subagents_ok,
    'subagents_detail', jsonb_build_object(
      'blocked_agents', blocked_agents,
      'issue', CASE
        WHEN NOT subagents_ok THEN
          format('TESTING verdict must be PASS or CONDITIONAL_PASS, currently blocked: %s', array_to_string(blocked_agents, ', '))
        ELSE NULL
      END
    ),
    'can_complete', user_stories_ok AND subagents_ok,
    'recommendations', CASE
      WHEN NOT user_stories_ok AND NOT subagents_ok THEN
        ARRAY['Update e2e_test_status to passing for all user stories', 'Update TESTING verdict to PASS']
      WHEN NOT user_stories_ok THEN
        ARRAY['Update e2e_test_status to passing for all user stories']
      WHEN NOT subagents_ok THEN
        ARRAY['Update TESTING verdict to PASS']
      ELSE ARRAY[]::TEXT[]
    END
  );

  RETURN result;
END;
$$;

-- ============================================================================
-- STEP 2: Add trigger to warn on user story completion with non-passing e2e
-- ============================================================================

CREATE OR REPLACE FUNCTION warn_user_story_e2e_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When status changes to 'completed' but e2e_test_status is not 'passing'
  IF NEW.status = 'completed' AND NEW.e2e_test_status != 'passing' THEN
    RAISE WARNING 'User story % completed with e2e_test_status = % (should be "passing" for progress calculation)',
      NEW.story_key, NEW.e2e_test_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warn_user_story_e2e ON user_stories;
CREATE TRIGGER trg_warn_user_story_e2e
  BEFORE UPDATE ON user_stories
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
  EXECUTE FUNCTION warn_user_story_e2e_status();

-- ============================================================================
-- STEP 3: Add trigger to warn on TESTING verdict that won't count
-- ============================================================================

CREATE OR REPLACE FUNCTION warn_testing_verdict()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When TESTING sub-agent has verdict other than PASS/CONDITIONAL_PASS
  IF NEW.sub_agent_code = 'TESTING' AND NEW.verdict NOT IN ('PASS', 'CONDITIONAL_PASS') THEN
    RAISE WARNING 'TESTING sub-agent for % has verdict = % (should be "PASS" or "CONDITIONAL_PASS" for progress calculation)',
      NEW.sd_id, NEW.verdict;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_warn_testing_verdict ON sub_agent_execution_results;
CREATE TRIGGER trg_warn_testing_verdict
  AFTER INSERT OR UPDATE ON sub_agent_execution_results
  FOR EACH ROW
  WHEN (NEW.sub_agent_code = 'TESTING')
  EXECUTE FUNCTION warn_testing_verdict();

-- ============================================================================
-- STEP 4: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION check_progress_requirements(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION check_progress_requirements(TEXT) TO service_role;

-- ============================================================================
-- STEP 5: Add documentation comment
-- ============================================================================

COMMENT ON FUNCTION check_progress_requirements IS
'Checks if an SD meets progress requirements for completion.
Returns JSONB with:
- user_stories_ok: All stories must have e2e_test_status = ''passing''
- subagents_ok: TESTING verdict must be PASS or CONDITIONAL_PASS
- can_complete: Both conditions must be true
- recommendations: Actions to fix issues

Usage: SELECT check_progress_requirements(''SD-XXX-001'');';

-- ============================================================================
-- STEP 6: Validation
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Progress Requirements Guardrails - Applied';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New Features:';
  RAISE NOTICE '  1. check_progress_requirements(sd_id) - Check if SD can complete';
  RAISE NOTICE '  2. trg_warn_user_story_e2e - Warns on completion with non-passing e2e';
  RAISE NOTICE '  3. trg_warn_testing_verdict - Warns on TESTING with blocking verdict';
  RAISE NOTICE '';
  RAISE NOTICE 'Key Rules:';
  RAISE NOTICE '  - e2e_test_status must be ''passing'' (not ''skipped'')';
  RAISE NOTICE '  - TESTING verdict must be ''PASS'' or ''CONDITIONAL_PASS''';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  SELECT check_progress_requirements(''SD-XXX-001'');';
END $$;
