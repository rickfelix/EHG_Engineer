-- Migration: Fix get_progress_breakdown() - Replace profile.name with profile.sd_type
-- Issue: Functions reference non-existent profile.name column
-- Fix: Use profile.sd_type instead (the actual column name)
-- Date: 2026-01-31
-- Related: SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001

-- ============================================================================
-- Fix get_progress_breakdown() function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_progress_breakdown(sd_id_param text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  breakdown JSONB;
  total_progress INTEGER;
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INTEGER := 0;
  subagent_check JSONB;
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- QF-POST-COMPLETION-VALIDATOR-001: Detect QF-* prefix and use quick_fix profile
  IF sd.sd_key LIKE 'QF-%' THEN
    sd_type_val := 'quick_fix';
  END IF;

  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE sd_id = sd_id_param
    AND status IN ('approved', 'in_progress', 'implemented', 'verification', 'pending_approval', 'completed')
  ) INTO prd_exists;

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
    deliverables_complete := true;
  END IF;

  IF EXISTS (SELECT 1 FROM user_stories WHERE sd_id = sd_id_param) THEN
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN true
        WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' OR e2e_test_status = 'passing') = COUNT(*) THEN true
        ELSE false
      END INTO user_stories_validated
    FROM user_stories
    WHERE sd_id = sd_id_param;
  ELSE
    user_stories_validated := true;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  BEGIN
    subagent_check := check_required_sub_agents(sd_id_param);
  EXCEPTION WHEN OTHERS THEN
    subagent_check := '{"all_verified": true}'::jsonb;
  END;

  total_progress := calculate_sd_progress(sd_id_param);

  breakdown := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_type_val,
    'profile', profile.sd_type,  -- FIXED: Changed from profile.name to profile.sd_type
    'total_progress', total_progress,
    'can_complete', total_progress = 100,
    'phases', jsonb_build_object(
      'LEAD_approval', jsonb_build_object(
        'weight', profile.lead_weight,
        'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed', 'review'),
        'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed', 'review') THEN profile.lead_weight ELSE 0 END,
        'required', true
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', profile.plan_weight,
        'complete', prd_exists OR NOT profile.requires_prd,
        'progress', CASE WHEN prd_exists OR NOT profile.requires_prd THEN profile.plan_weight ELSE 0 END,
        'required', profile.requires_prd,
        'prd_exists', prd_exists
      ),
      'EXEC_implementation', jsonb_build_object(
        'weight', profile.exec_weight,
        'complete', deliverables_complete OR NOT profile.requires_deliverables,
        'progress', CASE WHEN deliverables_complete OR NOT profile.requires_deliverables THEN profile.exec_weight ELSE 0 END,
        'required', profile.requires_deliverables,
        'deliverables_complete', deliverables_complete
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'complete', (user_stories_validated AND (subagent_check->>'all_verified')::boolean) OR NOT profile.requires_e2e_tests,
        'progress', CASE WHEN (user_stories_validated AND (subagent_check->>'all_verified')::boolean) OR NOT profile.requires_e2e_tests THEN profile.verify_weight ELSE 0 END,
        'required', profile.requires_e2e_tests,
        'user_stories_validated', user_stories_validated,
        'subagent_verified', (subagent_check->>'all_verified')::boolean
      ),
      'LEAD_final_approval', jsonb_build_object(
        'weight', profile.final_weight,
        'complete', retrospective_exists AND handoffs_count >= profile.min_handoffs,
        'progress', CASE WHEN retrospective_exists AND handoffs_count >= profile.min_handoffs THEN profile.final_weight ELSE 0 END,
        'min_handoffs', profile.min_handoffs,
        'handoffs_count', handoffs_count,
        'retrospective_exists', retrospective_exists,
        'retrospective_required', profile.requires_retrospective
      )
    )
  );

  RETURN breakdown;
END;
$function$;

-- ============================================================================
-- Verification Query
-- ============================================================================

-- Test the function with a sample SD
-- SELECT get_progress_breakdown('SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001');

COMMENT ON FUNCTION get_progress_breakdown(text) IS 'Fixed: Use profile.sd_type instead of non-existent profile.name column';
