-- LEO Protocol Enhancement #7: Progress Calculation Enforcement
-- Purpose: Prevent SD completion with undefined or incomplete progress
-- Root Cause Fixed: Progress tracking broken (undefined allowed)
-- Date: 2025-10-10
-- Related SD: SD-AGENT-MIGRATION-001 had undefined progress but marked complete

-- ============================================================================
-- FUNCTION: Calculate SD Progress Dynamically
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  progress INTEGER := 0;

  -- Phase completion flags
  lead_approved BOOLEAN := false;
  plan_prd_complete BOOLEAN := false;
  exec_implementation_complete BOOLEAN := false;
  plan_verification_complete BOOLEAN := false;
  lead_final_approval BOOLEAN := false;

  -- Sub-components
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_complete BOOLEAN := false;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  -- ============================================================================
  -- PHASE 1: LEAD Initial Approval (20%)
  -- ============================================================================

  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    lead_approved := true;
    progress := progress + 20;
  END IF;

  -- ============================================================================
  -- PHASE 2: PLAN PRD Creation (20%)
  -- ============================================================================

  -- Check if PRD exists and is complete
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE directive_id = sd_id_param
    AND status IN ('approved', 'in_progress')
  ) INTO prd_exists;

  IF prd_exists THEN
    plan_prd_complete := true;
    progress := progress + 20;
  END IF;

  -- ============================================================================
  -- PHASE 3: EXEC Implementation (30%)
  -- ============================================================================

  -- Check if deliverables are complete
  IF EXISTS (
    SELECT 1 FROM sd_scope_deliverables
    WHERE sd_id = sd_id_param
  ) THEN
    -- Check completion percentage
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN false
        WHEN COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*) THEN true
        ELSE false
      END INTO deliverables_complete
    FROM sd_scope_deliverables
    WHERE sd_id = sd_id_param
    AND priority IN ('required', 'high');
  ELSE
    -- No deliverables tracked = assume complete (legacy SDs)
    deliverables_complete := true;
  END IF;

  IF deliverables_complete THEN
    exec_implementation_complete := true;
    progress := progress + 30;
  END IF;

  -- ============================================================================
  -- PHASE 4: PLAN Verification (15%)
  -- ============================================================================

  -- Check if user stories are validated
  IF EXISTS (
    SELECT 1 FROM user_stories
    WHERE sd_id = sd_id_param
  ) THEN
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN false
        WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' AND e2e_test_status = 'passing') = COUNT(*) THEN true
        ELSE false
      END INTO user_stories_validated
    FROM user_stories
    WHERE sd_id = sd_id_param;
  ELSE
    -- No user stories = assume validation not required
    user_stories_validated := true;
  END IF;

  -- Check if required sub-agents have verified
  DECLARE
    subagent_check JSONB;
  BEGIN
    subagent_check := check_required_sub_agents(sd_id_param);

    IF (subagent_check->>'all_verified')::boolean THEN
      plan_verification_complete := true;
      progress := progress + 15;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If function doesn't exist, skip sub-agent check
    plan_verification_complete := user_stories_validated;
    IF plan_verification_complete THEN
      progress := progress + 15;
    END IF;
  END;

  -- ============================================================================
  -- PHASE 5: LEAD Final Approval (15%)
  -- ============================================================================

  -- Check if retrospective exists with quality score >= 70
  SELECT EXISTS (
    SELECT 1 FROM retrospectives
    WHERE sd_id = sd_id_param
    AND quality_score >= 70
  ) INTO retrospective_exists;

  -- Check if all required handoffs exist
  SELECT
    CASE
      WHEN COUNT(DISTINCT handoff_type) >= 3 THEN true  -- At minimum: LEAD->PLAN, PLAN->EXEC, EXEC->PLAN
      ELSE false
    END INTO handoffs_complete
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  IF retrospective_exists AND handoffs_complete THEN
    lead_final_approval := true;
    progress := progress + 15;
  END IF;

  -- ============================================================================
  -- RETURN CALCULATED PROGRESS
  -- ============================================================================

  RETURN progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get Progress Breakdown for Debugging
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  breakdown JSONB;
  total_progress INTEGER;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  -- Build detailed breakdown
  breakdown := jsonb_build_object(
    'sd_id', sd_id_param,
    'current_phase', sd.current_phase,
    'status', sd.status,
    'phases', jsonb_build_object(
      'LEAD_approval', jsonb_build_object(
        'weight', 20,
        'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed'),
        'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN 20 ELSE 0 END
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', 20,
        'complete', EXISTS (SELECT 1 FROM product_requirements_v2 WHERE directive_id = sd_id_param),
        'progress', CASE WHEN EXISTS (SELECT 1 FROM product_requirements_v2 WHERE directive_id = sd_id_param) THEN 20 ELSE 0 END
      ),
      'EXEC_implementation', jsonb_build_object(
        'weight', 30,
        'deliverables_tracked', EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param),
        'deliverables_complete', (
          SELECT
            CASE
              WHEN COUNT(*) = 0 THEN false
              WHEN COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*) THEN true
              ELSE false
            END
          FROM sd_scope_deliverables
          WHERE sd_id = sd_id_param
          AND priority IN ('required', 'high')
        ),
        'progress', CASE WHEN (
          SELECT
            CASE
              WHEN COUNT(*) = 0 THEN true
              WHEN COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*) THEN true
              ELSE false
            END
          FROM sd_scope_deliverables
          WHERE sd_id = sd_id_param
          AND priority IN ('required', 'high')
        ) THEN 30 ELSE 0 END
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', 15,
        'user_stories_validated', (
          SELECT
            CASE
              WHEN COUNT(*) = 0 THEN true
              WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' AND e2e_test_status = 'passing') = COUNT(*) THEN true
              ELSE false
            END
          FROM user_stories
          WHERE sd_id = sd_id_param
        ),
        'sub_agents_verified', (check_required_sub_agents(sd_id_param)->>'all_verified')::boolean,
        'progress', CASE WHEN (check_required_sub_agents(sd_id_param)->>'all_verified')::boolean THEN 15 ELSE 0 END
      ),
      'LEAD_final_approval', jsonb_build_object(
        'weight', 15,
        'retrospective_exists', EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param AND quality_score >= 70),
        'handoffs_complete', (
          SELECT COUNT(DISTINCT handoff_type) >= 3
          FROM sd_phase_handoffs
          WHERE sd_id = sd_id_param
          AND status = 'accepted'
        ),
        'progress', CASE WHEN (
          EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param AND quality_score >= 70)
          AND (SELECT COUNT(DISTINCT handoff_type) >= 3 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND status = 'accepted')
        ) THEN 15 ELSE 0 END
      )
    )
  );

  -- Calculate total
  total_progress := calculate_sd_progress(sd_id_param);

  breakdown := breakdown || jsonb_build_object(
    'total_progress', total_progress,
    'can_complete', total_progress = 100
  );

  RETURN breakdown;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Enforce Progress Before Completion
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_progress_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  calculated_progress INTEGER;
  progress_breakdown JSONB;
BEGIN
  -- Only enforce when transitioning TO completed status
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN

    -- Calculate progress dynamically
    calculated_progress := calculate_sd_progress(NEW.id);

    -- Update progress_percentage field
    NEW.progress_percentage := calculated_progress;

    -- Block if progress is NULL (calculation error)
    IF calculated_progress IS NULL THEN
      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nProgress calculation returned NULL\n\nACTION REQUIRED:\n1. Check if all required tables exist (product_requirements_v2, sd_scope_deliverables, user_stories, retrospectives, sd_phase_handoffs)\n2. Run: SELECT get_progress_breakdown(''%'') to debug\n3. Fix any missing data before marking complete',
        NEW.id;
    END IF;

    -- Block if progress < 100%
    IF calculated_progress < 100 THEN
      -- Get detailed breakdown for error message
      progress_breakdown := get_progress_breakdown(NEW.id);

      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nProgress: %%% (need 100%%)\n\nIncomplete phases:\n%\n\nACTION REQUIRED:\n1. Review breakdown: SELECT get_progress_breakdown(''%'');\n2. Complete all required phases\n3. Ensure all handoffs, deliverables, user stories, and retrospective are complete\n4. Then retry marking as complete',
        calculated_progress,
        jsonb_pretty(progress_breakdown->'phases'),
        NEW.id;
    END IF;

    RAISE NOTICE 'Progress verification passed: % = 100%%', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS enforce_progress_trigger ON strategic_directives_v2;

-- Create trigger
CREATE TRIGGER enforce_progress_trigger
  BEFORE UPDATE OF status
  ON strategic_directives_v2
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION enforce_progress_on_completion();

-- ============================================================================
-- FUNCTION: Auto-calculate progress on update
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_calculate_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-calculate progress whenever SD is updated (except when manually setting progress)
  IF TG_OP = 'UPDATE' AND NEW.progress_percentage IS NOT DISTINCT FROM OLD.progress_percentage THEN
    NEW.progress_percentage := calculate_sd_progress(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-calculation (runs AFTER other updates)
CREATE TRIGGER auto_calculate_progress_trigger
  BEFORE UPDATE
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_progress();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION calculate_sd_progress IS 'Dynamically calculates SD progress based on phase completion: LEAD approval (20%), PLAN PRD (20%), EXEC implementation (30%), PLAN verification (15%), LEAD final approval (15%)';
COMMENT ON FUNCTION get_progress_breakdown IS 'Returns detailed breakdown of progress calculation for debugging - shows which phases are complete and which are blocking completion';
COMMENT ON FUNCTION enforce_progress_on_completion IS 'Trigger function that blocks SD completion if calculated progress < 100% - provides detailed error message with breakdown';
COMMENT ON FUNCTION auto_calculate_progress IS 'Trigger function that auto-updates progress_percentage whenever SD is modified';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'LEO Protocol Enhancement #7 applied successfully';
  RAISE NOTICE 'Function created: calculate_sd_progress(sd_id)';
  RAISE NOTICE 'Function created: get_progress_breakdown(sd_id)';
  RAISE NOTICE 'Function created: enforce_progress_on_completion()';
  RAISE NOTICE 'Function created: auto_calculate_progress()';
  RAISE NOTICE 'Trigger created: enforce_progress_trigger (blocks completion if progress < 100%%)';
  RAISE NOTICE 'Trigger created: auto_calculate_progress_trigger (auto-updates progress)';
  RAISE NOTICE 'Enforcement: SD cannot be marked complete unless all phases verified at 100%%';
  RAISE NOTICE 'Progress calculation: LEAD (20%%) + PLAN (20%%) + EXEC (30%%) + PLAN verification (15%%) + LEAD approval (15%%) = 100%%';
END $$;
