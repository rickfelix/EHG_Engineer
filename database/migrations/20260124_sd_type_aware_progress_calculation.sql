-- ============================================================================
-- SD-Type-Aware Progress Calculation
-- ============================================================================
-- Purpose: Fix 75% handoff rejection rate for refactor/infrastructure SDs
-- SD: SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001
-- Created: 2026-01-24
-- ============================================================================
-- PROBLEM:
--   Refactor SDs were blocked because progress calculation required 3 handoff types,
--   but refactor SDs only need REGRESSION validation (not TESTING/DESIGN).
--
-- SOLUTION:
--   Make handoff count requirement SD-type-aware. Different SD types have
--   different minimum handoff requirements based on their validation profile.
-- ============================================================================

-- Create a helper function to get minimum required handoff count by SD type
CREATE OR REPLACE FUNCTION get_min_required_handoffs(sd_type_param VARCHAR)
RETURNS INTEGER AS $$
BEGIN
  -- SD-Type to minimum handoff count mapping
  -- Based on SD_TYPE_APPLICABILITY_POLICY from sd-type-applicability-policy.js
  RETURN CASE
    -- Infrastructure/Documentation SDs - minimal handoffs (LEAD->PLAN, PLAN->LEAD)
    WHEN sd_type_param IN ('infrastructure', 'documentation', 'docs', 'process', 'qa', 'orchestrator')
    THEN 2

    -- Refactor SDs - need REGRESSION but skip TESTING/DESIGN
    -- LEAD->PLAN, PLAN->EXEC, EXEC->PLAN (optional), PLAN->LEAD
    WHEN sd_type_param = 'refactor'
    THEN 2  -- Only LEAD-TO-PLAN and one completion handoff required

    -- Bugfix/Performance - need validation but lighter than feature
    WHEN sd_type_param IN ('bugfix', 'performance', 'enhancement')
    THEN 3

    -- Feature/Database/Security - full validation
    WHEN sd_type_param IN ('feature', 'database', 'security')
    THEN 3

    -- Default (unknown type) - require full validation (safe default)
    ELSE 3
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update the main progress calculation function
CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  progress INTEGER := 0;
  user_stories_validated BOOLEAN := false;
  sd_uuid_val UUID;
  sd_type_val VARCHAR(50);
  user_story_count INTEGER;
  min_handoffs INTEGER;
  actual_handoffs INTEGER;
BEGIN
  -- Get SD with type information
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  sd_uuid_val := sd.uuid_id;
  sd_type_val := COALESCE(sd.sd_type, 'feature');  -- Default to 'feature' for backward compatibility

  -- Get SD-type-aware minimum handoff requirement
  min_handoffs := get_min_required_handoffs(sd_type_val);

  -- =========================================================================
  -- PHASE 1: LEAD Initial Approval (20%)
  -- =========================================================================
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    progress := progress + 20;
  END IF;

  -- =========================================================================
  -- PHASE 2: PLAN PRD Creation (20%)
  -- =========================================================================
  IF EXISTS (SELECT 1 FROM product_requirements_v2 WHERE sd_uuid = sd_uuid_val) THEN
    progress := progress + 20;
  END IF;

  -- =========================================================================
  -- PHASE 3: EXEC Implementation (30%)
  -- =========================================================================
  IF NOT EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
    -- No deliverables = legacy SD or infrastructure SD, assume complete
    progress := progress + 30;
  ELSE
    -- Check if all required/high priority deliverables are complete
    IF (SELECT COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*)
        FROM sd_scope_deliverables
        WHERE sd_id = sd_id_param AND priority IN ('required', 'high')) THEN
      progress := progress + 30;
    END IF;
  END IF;

  -- =========================================================================
  -- PHASE 4: PLAN Verification (15%) - SD-TYPE-AWARE
  -- =========================================================================
  SELECT COUNT(*) INTO user_story_count
  FROM user_stories
  WHERE sd_id = sd_id_param;

  IF user_story_count = 0 THEN
    -- No user stories = infrastructure/documentation SD = validation not required
    user_stories_validated := true;
  ELSE
    -- SD-TYPE-AWARE validation:
    -- Infrastructure/Documentation SDs: Check status='completed' (skip E2E)
    -- Feature SDs: Check validation_status='validated' (E2E required)
    IF sd_type_val IN ('infrastructure', 'documentation', 'docs', 'process', 'qa', 'refactor', 'orchestrator') THEN
      SELECT COUNT(*) FILTER (WHERE status = 'completed') = COUNT(*)
      INTO user_stories_validated
      FROM user_stories
      WHERE sd_id = sd_id_param;
    ELSE
      SELECT COUNT(*) FILTER (WHERE validation_status = 'validated') = COUNT(*)
      INTO user_stories_validated
      FROM user_stories
      WHERE sd_id = sd_id_param;
    END IF;
  END IF;

  IF user_stories_validated THEN
    progress := progress + 15;
  END IF;

  -- =========================================================================
  -- PHASE 5: LEAD Final Approval (15%) - SD-TYPE-AWARE HANDOFF COUNT
  -- =========================================================================
  -- SD-LEO-FIX-REMEDIATE-TYPE-AWARE-001: Use SD-type-aware minimum handoff count
  SELECT COUNT(DISTINCT handoff_type) INTO actual_handoffs
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  IF EXISTS (
    SELECT 1 FROM retrospectives
    WHERE sd_id = sd_id_param
    AND status = 'PUBLISHED'
    AND quality_score IS NOT NULL
  ) AND actual_handoffs >= min_handoffs THEN
    progress := progress + 15;
  END IF;

  RETURN progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION TESTS
-- ============================================================================

-- Test 1: Verify get_min_required_handoffs returns correct values
DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TEST: SD-Type-Aware Minimum Handoff Requirements';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  RAISE NOTICE 'infrastructure: % (expected: 2)', get_min_required_handoffs('infrastructure');
  RAISE NOTICE 'documentation: % (expected: 2)', get_min_required_handoffs('documentation');
  RAISE NOTICE 'refactor: % (expected: 2)', get_min_required_handoffs('refactor');
  RAISE NOTICE 'bugfix: % (expected: 3)', get_min_required_handoffs('bugfix');
  RAISE NOTICE 'feature: % (expected: 3)', get_min_required_handoffs('feature');
  RAISE NOTICE 'unknown: % (expected: 3)', get_min_required_handoffs('unknown');

  -- Assertions
  IF get_min_required_handoffs('infrastructure') = 2 THEN
    RAISE NOTICE '✅ Infrastructure SD handoff requirement correct';
  ELSE
    RAISE WARNING '❌ Infrastructure SD handoff requirement incorrect';
  END IF;

  IF get_min_required_handoffs('refactor') = 2 THEN
    RAISE NOTICE '✅ Refactor SD handoff requirement correct';
  ELSE
    RAISE WARNING '❌ Refactor SD handoff requirement incorrect';
  END IF;

  IF get_min_required_handoffs('feature') = 3 THEN
    RAISE NOTICE '✅ Feature SD handoff requirement correct (backward compat)';
  ELSE
    RAISE WARNING '❌ Feature SD handoff requirement incorrect';
  END IF;
END $$;

-- Test 2: Show current SDs with their type-aware progress
SELECT
  sd.id,
  LEFT(sd.title, 40) as title,
  COALESCE(sd.sd_type, 'feature') as sd_type,
  get_min_required_handoffs(COALESCE(sd.sd_type, 'feature')) as min_handoffs,
  (SELECT COUNT(DISTINCT handoff_type) FROM sd_phase_handoffs WHERE sd_id = sd.id AND status = 'accepted') as actual_handoffs,
  calculate_sd_progress(sd.id) as progress,
  sd.status
FROM strategic_directives_v2 sd
WHERE sd.status IN ('active', 'in_progress')
  AND sd.sd_type IN ('infrastructure', 'refactor', 'documentation')
ORDER BY sd.created_at DESC
LIMIT 10;

RAISE NOTICE '════════════════════════════════════════════════════════════';
RAISE NOTICE 'SD-Type-Aware Progress Calculation Migration Complete';
RAISE NOTICE '✅ Refactor SDs: Need only 2 handoffs (was 3)';
RAISE NOTICE '✅ Infrastructure SDs: Need only 2 handoffs (was 3)';
RAISE NOTICE '✅ Feature SDs: Still require 3 handoffs (backward compat)';
RAISE NOTICE '════════════════════════════════════════════════════════════';
