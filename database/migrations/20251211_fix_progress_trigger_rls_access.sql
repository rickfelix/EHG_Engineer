-- Fix RLS Access for Progress Calculation Triggers
-- Problem: enforce_progress_trigger can't see retrospectives due to RLS policies
-- Root Cause: Trigger functions execute with privileges of user updating SD
-- Solution: Make progress calculation functions SECURITY DEFINER
-- Date: 2025-12-11
-- Related SD: SD-VISION-TRANSITION-001E

-- ============================================================================
-- FUNCTION: Calculate SD Progress (SECURITY DEFINER)
-- ============================================================================

-- Recreate function with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER  -- Execute with function owner's privileges, not caller's
SET search_path = public  -- Security best practice for SECURITY DEFINER
AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  progress INTEGER := 0;

  -- Phase completion checks
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INT := 0;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  -- Get SD type (default to 'feature' if not set)
  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- Get validation profile for this SD type
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  -- If no profile found, use feature defaults
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
    -- If still not found, create inline defaults
    IF NOT FOUND THEN
      profile := ROW('feature', 20, 20, 30, 15, 15, true, true, true, true, true, 3, 'Default', NOW(), NOW());
    END IF;
  END IF;

  -- ============================================================================
  -- PHASE 1: LEAD Initial Approval
  -- ============================================================================
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    progress := progress + profile.lead_weight;
  END IF;

  -- ============================================================================
  -- PHASE 2: PLAN PRD Creation
  -- ============================================================================
  IF profile.requires_prd THEN
    SELECT EXISTS (
      SELECT 1 FROM product_requirements_v2
      WHERE directive_id = sd_id_param
      AND status IN ('approved', 'in_progress', 'completed')
    ) INTO prd_exists;

    IF prd_exists THEN
      progress := progress + profile.plan_weight;
    END IF;
  ELSE
    -- PRD not required for this SD type - auto-complete
    progress := progress + profile.plan_weight;
  END IF;

  -- ============================================================================
  -- PHASE 3: EXEC Implementation
  -- ============================================================================
  IF profile.requires_deliverables THEN
    -- Check if deliverables exist and are complete
    IF EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true  -- No deliverables = complete
          WHEN COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*) THEN true
          ELSE false
        END INTO deliverables_complete
      FROM sd_scope_deliverables
      WHERE sd_id = sd_id_param
      AND priority IN ('required', 'high');
    ELSE
      -- No deliverables tracked = assume complete (legacy behavior)
      deliverables_complete := true;
    END IF;

    IF deliverables_complete THEN
      progress := progress + profile.exec_weight;
    END IF;
  ELSE
    -- Deliverables not required for this SD type - auto-complete
    progress := progress + profile.exec_weight;
  END IF;

  -- ============================================================================
  -- PHASE 4: PLAN Verification (User Stories + E2E)
  -- ============================================================================
  IF profile.requires_e2e_tests THEN
    -- Check user stories validation
    IF EXISTS (SELECT 1 FROM user_stories WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true
          WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' AND e2e_test_status = 'passing') = COUNT(*) THEN true
          ELSE false
        END INTO user_stories_validated
      FROM user_stories
      WHERE sd_id = sd_id_param;
    ELSE
      -- No user stories = validation not required
      user_stories_validated := true;
    END IF;

    -- Also check sub-agents if required
    IF profile.requires_sub_agents THEN
      BEGIN
        DECLARE
          subagent_check JSONB;
        BEGIN
          subagent_check := check_required_sub_agents(sd_id_param);
          IF user_stories_validated AND (subagent_check->>'all_verified')::boolean THEN
            progress := progress + profile.verify_weight;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Function doesn't exist, just use user story check
          IF user_stories_validated THEN
            progress := progress + profile.verify_weight;
          END IF;
        END;
      END;
    ELSE
      IF user_stories_validated THEN
        progress := progress + profile.verify_weight;
      END IF;
    END IF;
  ELSE
    -- E2E tests not required for this SD type - auto-complete
    progress := progress + profile.verify_weight;
  END IF;

  -- ============================================================================
  -- PHASE 5: LEAD Final Approval
  -- ============================================================================

  -- Check retrospective if required
  -- THIS IS WHERE RLS WAS BLOCKING ACCESS
  IF profile.requires_retrospective THEN
    SELECT EXISTS (
      SELECT 1 FROM retrospectives
      WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;
  ELSE
    retrospective_exists := true;  -- Not required, auto-pass
  END IF;

  -- Check handoffs (with configurable minimum)
  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  IF retrospective_exists AND handoffs_count >= profile.min_handoffs THEN
    progress := progress + profile.final_weight;
  END IF;

  RETURN progress;
END;
$$;

-- ============================================================================
-- FUNCTION: Get Progress Breakdown (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- Execute with function owner's privileges
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  breakdown JSONB;
  total_progress INTEGER;

  -- Component states
  prd_exists BOOLEAN;
  deliverables_complete BOOLEAN;
  user_stories_validated BOOLEAN;
  retrospective_exists BOOLEAN;
  handoffs_count INT;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  -- Get SD type and profile
  sd_type_val := COALESCE(sd.sd_type, 'feature');
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- Check each component
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE directive_id = sd_id_param
  ) INTO prd_exists;

  -- THIS IS WHERE RLS WAS BLOCKING ACCESS
  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  -- Calculate total
  total_progress := calculate_sd_progress(sd_id_param);

  -- Build breakdown
  breakdown := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_type_val,
    'current_phase', sd.current_phase,
    'status', sd.status,
    'profile', jsonb_build_object(
      'name', profile.sd_type,
      'description', profile.description,
      'requires_prd', profile.requires_prd,
      'requires_deliverables', profile.requires_deliverables,
      'requires_e2e_tests', profile.requires_e2e_tests,
      'requires_retrospective', profile.requires_retrospective,
      'requires_sub_agents', profile.requires_sub_agents,
      'min_handoffs', profile.min_handoffs
    ),
    'phases', jsonb_build_object(
      'LEAD_approval', jsonb_build_object(
        'weight', profile.lead_weight,
        'required', true,
        'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed'),
        'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed')
                        THEN profile.lead_weight ELSE 0 END
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', profile.plan_weight,
        'required', profile.requires_prd,
        'prd_exists', prd_exists,
        'complete', (NOT profile.requires_prd) OR prd_exists,
        'progress', CASE WHEN (NOT profile.requires_prd) OR prd_exists
                        THEN profile.plan_weight ELSE 0 END
      ),
      'EXEC_implementation', jsonb_build_object(
        'weight', profile.exec_weight,
        'required', profile.requires_deliverables,
        'complete', NOT profile.requires_deliverables,  -- Simplified for display
        'progress', CASE WHEN NOT profile.requires_deliverables
                        THEN profile.exec_weight ELSE 0 END,
        'note', CASE WHEN NOT profile.requires_deliverables
                     THEN 'Auto-complete: deliverables not required for ' || sd_type_val
                     ELSE 'Check sd_scope_deliverables table' END
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'required', profile.requires_e2e_tests,
        'complete', NOT profile.requires_e2e_tests,  -- Simplified for display
        'progress', CASE WHEN NOT profile.requires_e2e_tests
                        THEN profile.verify_weight ELSE 0 END,
        'note', CASE WHEN NOT profile.requires_e2e_tests
                     THEN 'Auto-complete: E2E tests not required for ' || sd_type_val
                     ELSE 'Check user_stories.e2e_test_status' END
      ),
      'LEAD_final_approval', jsonb_build_object(
        'weight', profile.final_weight,
        'retrospective_required', profile.requires_retrospective,
        'retrospective_exists', retrospective_exists,
        'min_handoffs', profile.min_handoffs,
        'handoffs_count', handoffs_count,
        'complete', (retrospective_exists OR NOT profile.requires_retrospective)
                    AND handoffs_count >= profile.min_handoffs,
        'progress', CASE WHEN (retrospective_exists OR NOT profile.requires_retrospective)
                              AND handoffs_count >= profile.min_handoffs
                        THEN profile.final_weight ELSE 0 END
      )
    ),
    'total_progress', total_progress,
    'can_complete', total_progress = 100
  );

  RETURN breakdown;
END;
$$;

-- ============================================================================
-- FUNCTION: Auto-calculate progress (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_calculate_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- Execute with function owner's privileges
SET search_path = public
AS $$
BEGIN
  -- Auto-calculate progress whenever SD is updated (except when manually setting progress)
  IF TG_OP = 'UPDATE' AND NEW.progress_percentage IS NOT DISTINCT FROM OLD.progress_percentage THEN
    NEW.progress_percentage := calculate_sd_progress(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- FUNCTION: Enforce progress on completion (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_progress_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- Execute with function owner's privileges
SET search_path = public
AS $$
DECLARE
  calculated_progress INTEGER;
  progress_breakdown JSONB;
  sd_type_val VARCHAR;
BEGIN
  -- Only enforce when transitioning TO completed status
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN

    -- Get SD type for error message
    sd_type_val := COALESCE(NEW.sd_type, 'feature');

    -- Calculate progress dynamically using profile
    calculated_progress := calculate_sd_progress(NEW.id);

    -- Update progress_percentage field
    NEW.progress_percentage := calculated_progress;

    -- Block if progress is NULL
    IF calculated_progress IS NULL THEN
      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nProgress calculation returned NULL for SD type: %\n\nACTION REQUIRED:\n1. Verify sd_type_validation_profiles table has entry for ''%''\n2. Run: SELECT get_progress_breakdown(''%'') to debug',
        sd_type_val, sd_type_val, NEW.id;
    END IF;

    -- Block if progress < 100%
    IF calculated_progress < 100 THEN
      progress_breakdown := get_progress_breakdown(NEW.id);

      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nSD Type: % (using % validation profile)\nProgress: %%% (need 100%%)\n\nProfile Requirements:\n%\n\nPhase Breakdown:\n%\n\nACTION REQUIRED:\n1. Review: SELECT get_progress_breakdown(''%'');\n2. Complete required phases for this SD type\n3. Or update sd_type if miscategorized',
        sd_type_val,
        (progress_breakdown->'profile'->>'name'),
        calculated_progress,
        jsonb_pretty(progress_breakdown->'profile'),
        jsonb_pretty(progress_breakdown->'phases'),
        NEW.id;
    END IF;

    RAISE NOTICE 'Progress verification passed for % (type: %): 100%%', NEW.id, sd_type_val;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- HELPER FUNCTION: Check SD can complete
-- ============================================================================

-- This function might also be used by external scripts, so add SECURITY DEFINER
CREATE OR REPLACE FUNCTION check_sd_can_complete(sd_id_param VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER  -- Execute with function owner's privileges
SET search_path = public
AS $$
DECLARE
  progress_val INTEGER;
  breakdown JSONB;
BEGIN
  -- Calculate current progress
  progress_val := calculate_sd_progress(sd_id_param);
  breakdown := get_progress_breakdown(sd_id_param);

  RETURN jsonb_build_object(
    'can_complete', progress_val = 100,
    'progress', progress_val,
    'blockers', CASE
      WHEN progress_val < 100 THEN
        (SELECT jsonb_agg(phase)
         FROM (
           SELECT key as phase
           FROM jsonb_each(breakdown->'phases')
           WHERE (value->>'complete')::boolean = false
         ) incomplete_phases)
      ELSE '[]'::jsonb
    END,
    'breakdown', breakdown
  );
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION calculate_sd_progress IS
'Profile-aware SD progress calculation with SECURITY DEFINER to bypass RLS. Uses sd_type_validation_profiles to determine requirements.';

COMMENT ON FUNCTION get_progress_breakdown IS
'Returns detailed progress breakdown with SECURITY DEFINER to bypass RLS. Includes profile information and phase-by-phase status.';

COMMENT ON FUNCTION enforce_progress_on_completion IS
'Trigger function that blocks SD completion if calculated progress < 100%. Now SD-type-aware with SECURITY DEFINER for RLS access.';

COMMENT ON FUNCTION auto_calculate_progress IS
'Trigger function that auto-updates progress_percentage with SECURITY DEFINER for RLS access.';

COMMENT ON FUNCTION check_sd_can_complete IS
'Helper function to check if SD can be completed with SECURITY DEFINER for RLS access. Returns blockers if any.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'RLS Access Fix for Progress Triggers - Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed functions:';
  RAISE NOTICE '  - calculate_sd_progress() - Now SECURITY DEFINER';
  RAISE NOTICE '  - get_progress_breakdown() - Now SECURITY DEFINER';
  RAISE NOTICE '  - auto_calculate_progress() - Now SECURITY DEFINER';
  RAISE NOTICE '  - enforce_progress_on_completion() - Now SECURITY DEFINER';
  RAISE NOTICE '  - check_sd_can_complete() - Now SECURITY DEFINER';
  RAISE NOTICE '';
  RAISE NOTICE 'These functions now bypass RLS and can access:';
  RAISE NOTICE '  - retrospectives table (for quality score checks)';
  RAISE NOTICE '  - product_requirements_v2 table';
  RAISE NOTICE '  - sd_scope_deliverables table';
  RAISE NOTICE '  - user_stories table';
  RAISE NOTICE '  - sd_phase_handoffs table';
  RAISE NOTICE '';
  RAISE NOTICE 'Security: Functions use SET search_path = public for safety';
  RAISE NOTICE 'Ready to complete SD-VISION-TRANSITION-001E';
  RAISE NOTICE '============================================================';
END $$;
