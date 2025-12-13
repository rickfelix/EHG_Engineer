-- ============================================================================
-- Migration: Merge Orchestrator Support + Correct Display Logic
-- Date: 2025-12-12
--
-- ROOT CAUSE ANALYSIS (5 Whys - SD-VENTURE-STAGE0-UI-001):
--
-- Why #1: get_progress_breakdown shows EXEC_implementation=0 and PLAN_verification=0
--         even when all deliverables/stories are completed
-- Why #2: The 20251212_orchestrator_sd_completion.sql migration has buggy display logic
-- Why #3: That migration rewrote the function without incorporating the fix from
--         20251211_fix_progress_breakdown_display.sql
-- Why #4: Migrations are independent - each contains full CREATE OR REPLACE FUNCTION
-- Why #5: No single source of truth - functions get overwritten by whichever migration
--         runs last
--
-- FIX: This migration merges:
--   - Orchestrator SD support from 20251212_orchestrator_sd_completion.sql
--   - Correct display logic from 20251211_fix_progress_breakdown_display.sql
--
-- The key difference is that the display logic now ACTUALLY QUERIES the database
-- to check if deliverables are complete and user stories are validated, rather
-- than just checking if the requirements are "not required".
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  breakdown JSONB;
  total_progress INTEGER;
  is_orchestrator_flag BOOLEAN;
  total_children INT;
  completed_children INT;

  -- Component states (must match calculate_sd_progress logic exactly)
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INT := 0;

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

  -- ============================================================================
  -- ORCHESTRATOR FAST-PATH (from 20251212_orchestrator_sd_completion.sql)
  -- ============================================================================
  is_orchestrator_flag := is_orchestrator_sd(sd_id_param);

  IF is_orchestrator_flag THEN
    -- Get child completion stats
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed')
    INTO total_children, completed_children
    FROM strategic_directives_v2
    WHERE parent_sd_id = sd_id_param;

    -- Check retrospective
    SELECT EXISTS (
      SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;

    -- Check PLAN-TO-LEAD handoff
    SELECT COUNT(*) INTO handoffs_count
    FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'PLAN-TO-LEAD'
    AND status = 'accepted';

    -- Calculate orchestrator progress
    total_progress := calculate_orchestrator_progress(sd_id_param);

    -- Return orchestrator-specific breakdown
    RETURN jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', COALESCE(sd.sd_type, 'feature'),
      'is_orchestrator', true,
      'status', sd.status,
      'profile', jsonb_build_object(
        'name', 'orchestrator',
        'description', 'Parent SD that coordinates child SDs. Progress based on child completion.',
        'requires_prd', false,
        'requires_deliverables', false,
        'requires_e2e_tests', false,
        'requires_retrospective', true,
        'min_handoffs', 1
      ),
      'phases', jsonb_build_object(
        'LEAD_initial', jsonb_build_object(
          'weight', 20,
          'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed'),
          'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN 20 ELSE 0 END
        ),
        'CHILDREN_completion', jsonb_build_object(
          'weight', 60,
          'complete', completed_children = total_children,
          'progress', (60 * completed_children / NULLIF(total_children, 0)),
          'total_children', total_children,
          'completed_children', completed_children,
          'note', format('%s of %s children completed', completed_children, total_children)
        ),
        'RETROSPECTIVE', jsonb_build_object(
          'weight', 15,
          'complete', retrospective_exists,
          'progress', CASE WHEN retrospective_exists THEN 15 ELSE 0 END,
          'required', true
        ),
        'PLAN_to_LEAD_handoff', jsonb_build_object(
          'weight', 5,
          'complete', handoffs_count > 0,
          'progress', CASE WHEN handoffs_count > 0 THEN 5 ELSE 0 END,
          'required', true
        )
      ),
      'total_progress', total_progress,
      'can_complete', total_progress = 100
    );
  END IF;

  -- ============================================================================
  -- STANDARD SD BREAKDOWN (with CORRECT display logic from 20251211 fix)
  -- ============================================================================
  sd_type_val := COALESCE(sd.sd_type, 'feature');
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- ============================================================================
  -- PHASE 2: PRD Check
  -- ============================================================================
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE directive_id = sd_id_param
    AND status IN ('approved', 'in_progress', 'completed')
  ) INTO prd_exists;

  -- ============================================================================
  -- PHASE 3: EXEC Implementation Check
  -- FIX: Actually query deliverables completion status (not just check if required)
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
    -- Deliverables not required for this SD type
    exec_complete := true;
    exec_progress := profile.exec_weight;
    deliverables_complete := true;
  END IF;

  -- ============================================================================
  -- PHASE 4: PLAN Verification Check
  -- FIX: Actually query user stories validation status (not just check if required)
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
    -- E2E tests not required for this SD type
    verify_complete := true;
    verify_progress := profile.verify_weight;
    user_stories_validated := true;
  END IF;

  -- ============================================================================
  -- PHASE 5: Final Approval Check
  -- ============================================================================
  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  -- Calculate total progress using the authoritative function
  total_progress := calculate_sd_progress(sd_id_param);

  -- ============================================================================
  -- BUILD BREAKDOWN with ACCURATE display values
  -- ============================================================================
  breakdown := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_type_val,
    'is_orchestrator', false,
    'current_phase', sd.current_phase,
    'status', sd.status,
    'profile', jsonb_build_object(
      'name', profile.sd_type,
      'description', profile.description,
      'requires_prd', profile.requires_prd,
      'requires_deliverables', profile.requires_deliverables,
      'requires_e2e_tests', profile.requires_e2e_tests,
      'requires_sub_agents', profile.requires_sub_agents,
      'requires_retrospective', profile.requires_retrospective,
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
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_progress_breakdown IS
'Returns detailed progress breakdown with ACCURATE phase status.

Merged version (2025-12-12) combining:
- Orchestrator SD support from 20251212_orchestrator_sd_completion.sql
- Correct display logic from 20251211_fix_progress_breakdown_display.sql

Key fix: EXEC_implementation and PLAN_verification now actually query
the database to check completion status, rather than just checking if
requirements are "not required".

This ensures the breakdown display matches what calculate_sd_progress
computes for the total.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'get_progress_breakdown Merged Fix Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'This migration merges:';
  RAISE NOTICE '  - Orchestrator SD support (20251212)';
  RAISE NOTICE '  - Correct display logic (20251211)';
  RAISE NOTICE '';
  RAISE NOTICE 'BEFORE: EXEC_implementation and PLAN_verification showed';
  RAISE NOTICE '        complete=false, progress=0 even when complete';
  RAISE NOTICE '';
  RAISE NOTICE 'AFTER: Display accurately reflects actual completion state';
  RAISE NOTICE '       by querying deliverables and user stories tables';
  RAISE NOTICE '';
  RAISE NOTICE 'Test with: SELECT get_progress_breakdown(''<sd-uuid>'');';
  RAISE NOTICE '============================================================';
END $$;
