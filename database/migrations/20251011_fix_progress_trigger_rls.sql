-- Migration: Fix Progress Trigger RLS Issues
-- Date: 2025-10-11
-- Issue: SD-SUBAGENT-IMPROVE-001 revealed that progress enforcement trigger
--        cannot see handoffs created via direct connection due to RLS policies
-- Solution: Add SECURITY DEFINER to all progress-related functions so they
--           execute with function owner permissions, bypassing RLS

-- ============================================================================
-- 1. Fix calculate_sd_progress function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.calculate_sd_progress(p_sd_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER  -- ← Added: Bypasses RLS for queries in this function
SET search_path = public
AS $function$
DECLARE
    phase_count INTEGER;
    completed_phases INTEGER;
    total_progress INTEGER;
    calculated_progress INTEGER;
BEGIN
    -- Count total phases for this SD
    SELECT COUNT(*) INTO phase_count
    FROM sd_phase_tracking
    WHERE sd_id = p_sd_id;

    -- If no phases exist, return 0
    IF phase_count = 0 THEN
        RETURN 0;
    END IF;

    -- Calculate progress from completed phases
    SELECT COUNT(*) INTO completed_phases
    FROM sd_phase_tracking
    WHERE sd_id = p_sd_id AND is_complete = true;

    -- Calculate weighted progress (completed phases + partial progress of current phase)
    SELECT COALESCE(SUM(progress), 0) INTO total_progress
    FROM sd_phase_tracking
    WHERE sd_id = p_sd_id;

    -- Average progress across all phases
    calculated_progress := total_progress / phase_count;

    RETURN GREATEST(0, LEAST(100, calculated_progress));
END;
$function$;

COMMENT ON FUNCTION public.calculate_sd_progress IS 'Calculates SD progress. Uses SECURITY DEFINER to bypass RLS (SD-SUBAGENT-IMPROVE-001)';

-- ============================================================================
-- 2. Fix get_progress_breakdown function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_progress_breakdown(sd_id_param character varying)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER  -- ← Added: Bypasses RLS for queries in this function
SET search_path = public
AS $function$
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
          -- ← This query now bypasses RLS due to SECURITY DEFINER
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
$function$;

COMMENT ON FUNCTION public.get_progress_breakdown IS 'Returns detailed progress breakdown. Uses SECURITY DEFINER to bypass RLS (SD-SUBAGENT-IMPROVE-001)';

-- ============================================================================
-- 3. Fix enforce_progress_on_completion trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_progress_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- ← Added: Bypasses RLS for queries in this function
SET search_path = public
AS $function$
DECLARE
  calculated_progress INTEGER;
  progress_breakdown JSONB;
BEGIN
  -- Only enforce when transitioning TO completed status
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN

    -- Calculate progress dynamically (now with SECURITY DEFINER, can see all data)
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
$function$;

COMMENT ON FUNCTION public.enforce_progress_on_completion IS 'Enforces 100% progress before completion. Uses SECURITY DEFINER to bypass RLS (SD-SUBAGENT-IMPROVE-001)';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check that functions now have SECURITY DEFINER
DO $$
DECLARE
    func_name TEXT;
    has_definer BOOLEAN;
BEGIN
    FOR func_name IN SELECT unnest(ARRAY['calculate_sd_progress', 'get_progress_breakdown', 'enforce_progress_on_completion']) LOOP
        SELECT prosecdef INTO has_definer
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = func_name
        AND n.nspname = 'public';
        
        IF has_definer THEN
            RAISE NOTICE '✅ % has SECURITY DEFINER', func_name;
        ELSE
            RAISE WARNING '⚠️  % missing SECURITY DEFINER', func_name;
        END IF;
    END LOOP;
END $$;
