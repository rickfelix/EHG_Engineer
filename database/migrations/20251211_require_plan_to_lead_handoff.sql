-- ============================================================================
-- Migration: Require PLAN-TO-LEAD Handoff for SD Completion
-- Purpose: Enforce complete 4-step LEO handoff chain for SD completion
--
-- ROOT CAUSE ANALYSIS (Six Whys):
-- SD-VISION-TRANSITION-001D4 was marked as "completed" at 100% without
-- the PLAN-TO-LEAD handoff because:
-- 1. Progress calculation only checked COUNT(DISTINCT handoff_type) >= min_handoffs
-- 2. min_handoffs=3 for most SD types (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN)
-- 3. No explicit check for PLAN-TO-LEAD as the final handoff
--
-- FIX:
-- 1. Add explicit check for PLAN-TO-LEAD handoff in calculate_sd_progress
-- 2. Add plan_to_lead_exists field to get_progress_breakdown
-- 3. Update LEAD_final_approval phase logic
--
-- Date: 2025-12-11
-- Part of: Six Whys root cause fix for missing PLAN-TO-LEAD handoff
-- ============================================================================

-- ============================================================================
-- STEP 1: Update sd_type_validation_profiles to require 4 handoffs
-- ============================================================================
UPDATE sd_type_validation_profiles
SET min_handoffs = 4
WHERE min_handoffs < 4;

-- ============================================================================
-- STEP 2: Update calculate_sd_progress to require PLAN-TO-LEAD handoff
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
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
  plan_to_lead_exists BOOLEAN := false;
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
      profile := ROW('feature', 20, 20, 30, 15, 15, true, true, true, true, true, 4, 'Default', NOW(), NOW());
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
  -- CRITICAL FIX: Now explicitly requires PLAN-TO-LEAD handoff
  -- ============================================================================

  -- Check retrospective if required
  IF profile.requires_retrospective THEN
    SELECT EXISTS (
      SELECT 1 FROM retrospectives
      WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;
  ELSE
    retrospective_exists := true;  -- Not required, auto-pass
  END IF;

  -- Count distinct handoffs
  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  -- CRITICAL: Explicitly check for PLAN-TO-LEAD handoff (the 4th step)
  -- This ensures the complete LEO cycle is fulfilled, not just 3 handoffs
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'PLAN-TO-LEAD'
    AND status = 'accepted'
  ) INTO plan_to_lead_exists;

  -- Final approval requires:
  -- 1. Retrospective (if required)
  -- 2. Minimum handoffs met
  -- 3. PLAN-TO-LEAD handoff specifically exists
  IF retrospective_exists AND handoffs_count >= profile.min_handoffs AND plan_to_lead_exists THEN
    progress := progress + profile.final_weight;
  END IF;

  RETURN progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 3: Update get_progress_breakdown to show PLAN-TO-LEAD status
-- ============================================================================
CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  breakdown JSONB;
  total_progress INTEGER;

  -- Component states (matching calculate_sd_progress logic)
  prd_exists BOOLEAN;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN;
  handoffs_count INT;
  plan_to_lead_exists BOOLEAN;

  -- For display
  exec_complete BOOLEAN := false;
  exec_progress INT := 0;
  verify_complete BOOLEAN := false;
  verify_progress INT := 0;
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

  -- ============================================================================
  -- PHASE 2: PRD Check (same as before)
  -- ============================================================================
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE directive_id = sd_id_param
    AND status IN ('approved', 'in_progress', 'completed')
  ) INTO prd_exists;

  -- ============================================================================
  -- PHASE 3: EXEC Implementation Check (FIXED - now matches calculate_sd_progress)
  -- ============================================================================
  IF profile.requires_deliverables THEN
    IF EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true
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

    exec_complete := deliverables_complete;
    exec_progress := CASE WHEN deliverables_complete THEN profile.exec_weight ELSE 0 END;
  ELSE
    -- Deliverables not required
    exec_complete := true;
    exec_progress := profile.exec_weight;
  END IF;

  -- ============================================================================
  -- PHASE 4: PLAN Verification Check (FIXED - now matches calculate_sd_progress)
  -- ============================================================================
  IF profile.requires_e2e_tests THEN
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

    verify_complete := user_stories_validated;
    verify_progress := CASE WHEN user_stories_validated THEN profile.verify_weight ELSE 0 END;
  ELSE
    -- E2E tests not required
    verify_complete := true;
    verify_progress := profile.verify_weight;
  END IF;

  -- ============================================================================
  -- PHASE 5: Final Approval Check (ENHANCED - now shows PLAN-TO-LEAD status)
  -- ============================================================================
  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  -- CRITICAL: Check for PLAN-TO-LEAD handoff specifically
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'PLAN-TO-LEAD'
    AND status = 'accepted'
  ) INTO plan_to_lead_exists;

  -- Calculate total
  total_progress := calculate_sd_progress(sd_id_param);

  -- Build breakdown with ACCURATE display values
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
        'deliverables_complete', deliverables_complete,
        'complete', exec_complete,
        'progress', exec_progress,
        'note', CASE
          WHEN NOT profile.requires_deliverables THEN 'Auto-complete: deliverables not required for ' || sd_type_val
          WHEN deliverables_complete THEN 'All required/high priority deliverables completed'
          ELSE 'Incomplete: Check sd_scope_deliverables table'
        END
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'required', profile.requires_e2e_tests,
        'user_stories_validated', user_stories_validated,
        'complete', verify_complete,
        'progress', verify_progress,
        'note', CASE
          WHEN NOT profile.requires_e2e_tests THEN 'Auto-complete: E2E tests not required for ' || sd_type_val
          WHEN user_stories_validated THEN 'All user stories validated with passing E2E tests'
          ELSE 'Incomplete: Check user_stories.validation_status and e2e_test_status'
        END
      ),
      'LEAD_final_approval', jsonb_build_object(
        'weight', profile.final_weight,
        'retrospective_required', profile.requires_retrospective,
        'retrospective_exists', retrospective_exists,
        'min_handoffs', profile.min_handoffs,
        'handoffs_count', handoffs_count,
        'plan_to_lead_exists', plan_to_lead_exists,
        'complete', (retrospective_exists OR NOT profile.requires_retrospective)
                    AND handoffs_count >= profile.min_handoffs
                    AND plan_to_lead_exists,
        'progress', CASE WHEN (retrospective_exists OR NOT profile.requires_retrospective)
                              AND handoffs_count >= profile.min_handoffs
                              AND plan_to_lead_exists
                        THEN profile.final_weight ELSE 0 END,
        'note', CASE
          WHEN NOT plan_to_lead_exists THEN 'CRITICAL: Missing PLAN-TO-LEAD handoff - LEO cycle incomplete'
          WHEN handoffs_count < profile.min_handoffs THEN 'Need ' || profile.min_handoffs || ' handoffs, have ' || handoffs_count
          WHEN NOT retrospective_exists AND profile.requires_retrospective THEN 'Missing retrospective'
          ELSE 'All requirements met'
        END
      )
    ),
    'total_progress', total_progress,
    'can_complete', total_progress = 100,
    'handoff_chain', jsonb_build_object(
      'expected', ARRAY['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
      'current_count', handoffs_count,
      'plan_to_lead_complete', plan_to_lead_exists
    )
  );

  RETURN breakdown;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION calculate_sd_progress IS
'Calculates SD progress with mandatory PLAN-TO-LEAD handoff check.
The LEAD_final_approval phase now explicitly requires the PLAN-TO-LEAD handoff
to be accepted, ensuring the complete 4-step LEO Protocol cycle is fulfilled.
Fixed 2025-12-11: Added explicit plan_to_lead_exists check.';

COMMENT ON FUNCTION get_progress_breakdown IS
'Returns detailed progress breakdown with PLAN-TO-LEAD status.
Fixed 2025-12-11: Now shows plan_to_lead_exists and handoff_chain status
to make the 4-step LEO requirement visible in progress breakdown output.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'PLAN-TO-LEAD Handoff Enforcement Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes Made:';
  RAISE NOTICE '1. Updated min_handoffs to 4 for all SD type profiles';
  RAISE NOTICE '2. Added explicit PLAN-TO-LEAD check in calculate_sd_progress';
  RAISE NOTICE '3. Added plan_to_lead_exists to get_progress_breakdown output';
  RAISE NOTICE '4. Added handoff_chain object showing expected 4-step chain';
  RAISE NOTICE '';
  RAISE NOTICE 'BEFORE: SD could reach 100% with only 3 handoffs (no PLAN-TO-LEAD)';
  RAISE NOTICE 'AFTER: SD requires PLAN-TO-LEAD handoff specifically for completion';
  RAISE NOTICE '';
  RAISE NOTICE 'This enforces the complete LEO Protocol cycle:';
  RAISE NOTICE '  LEAD-TO-PLAN -> PLAN-TO-EXEC -> EXEC-TO-PLAN -> PLAN-TO-LEAD';
  RAISE NOTICE '============================================================';
END $$;
