-- ============================================================================
-- Migration: SD-DELIVERABLES-V2-001 Phase 5 - Progress Calculation Update
-- ============================================================================
-- Implements US-011 from PRD-SD-DELIVERABLES-V2-001
--
-- Updates:
--   - Enhanced get_progress_breakdown() with real completion counts
--   - Incremental EXEC progress during implementation
--   - Parent/child SD rollup support
--
-- Date: 2025-11-28
-- Related SD: SD-DELIVERABLES-V2-001
-- Phase: 5 of 5 (Progress Calculation Update)
-- ============================================================================

-- ============================================================================
-- SECTION 1: Enhanced Progress Breakdown Function (US-011)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown_v2(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  result JSONB;

  -- Deliverable metrics
  total_deliverables INTEGER;
  completed_deliverables INTEGER;
  deliverable_percentage NUMERIC;

  -- User story metrics
  total_stories INTEGER;
  validated_stories INTEGER;
  story_percentage NUMERIC;

  -- Phase progress
  lead_progress INTEGER := 0;
  plan_progress INTEGER := 0;
  exec_progress INTEGER := 0;
  verification_progress INTEGER := 0;
  final_progress INTEGER := 0;

  -- Tracking flags
  has_prd BOOLEAN := false;
  has_deliverables BOOLEAN := false;
  has_user_stories BOOLEAN := false;

BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found', 'sd_id', sd_id_param);
  END IF;

  -- ========================================
  -- PHASE 1: LEAD (20 points)
  -- ========================================
  IF sd.status IN ('active', 'exec_active', 'plan_active', 'completed') THEN
    lead_progress := 20;
  ELSIF sd.status IN ('lead_review') THEN
    lead_progress := 10;
  END IF;

  -- ========================================
  -- PHASE 2: PLAN (20 points)
  -- ========================================
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE directive_id = sd_id_param
    AND status IN ('approved', 'in_progress', 'completed')
  ) INTO has_prd;

  IF has_prd THEN
    plan_progress := 20;
  END IF;

  -- ========================================
  -- PHASE 3: EXEC (30 points) - REAL-TIME TRACKING
  -- ========================================
  -- This is the key enhancement: calculate from actual deliverable completion

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE completion_status = 'completed')
  INTO total_deliverables, completed_deliverables
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_param
  AND priority IN ('required', 'high');

  has_deliverables := total_deliverables > 0;

  IF has_deliverables THEN
    deliverable_percentage := (completed_deliverables::NUMERIC / total_deliverables::NUMERIC) * 100;
    -- Scale to 30 points based on completion percentage
    exec_progress := ROUND(deliverable_percentage * 0.30);
  ELSE
    -- No deliverables tracked - check if there's accepted EXEC-TO-PLAN handoff
    IF EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = sd_id_param
      AND handoff_type = 'EXEC-TO-PLAN'
      AND status = 'accepted'
    ) THEN
      exec_progress := 30;
    END IF;
  END IF;

  -- ========================================
  -- PHASE 4: Verification (15 points)
  -- ========================================
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE validation_status = 'validated')
  INTO total_stories, validated_stories
  FROM user_stories
  WHERE sd_id = sd_id_param;

  has_user_stories := total_stories > 0;

  IF has_user_stories THEN
    story_percentage := (validated_stories::NUMERIC / total_stories::NUMERIC) * 100;
    verification_progress := ROUND(story_percentage * 0.15);
  ELSE
    -- No user stories - check for accepted handoff
    IF EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = sd_id_param
      AND handoff_type = 'EXEC-TO-PLAN'
      AND status = 'accepted'
    ) THEN
      verification_progress := 15;
    END IF;
  END IF;

  -- ========================================
  -- PHASE 5: Final (15 points)
  -- ========================================
  IF EXISTS (
    SELECT 1 FROM retrospectives
    WHERE sd_id = sd_id_param
    AND quality_score >= 70
  ) THEN
    final_progress := 15;
  ELSIF sd.status = 'completed' THEN
    final_progress := 15;
  END IF;

  -- ========================================
  -- Build result object
  -- ========================================
  result := jsonb_build_object(
    'sd_id', sd_id_param,
    'calculated_at', NOW(),
    'total_progress', lead_progress + plan_progress + exec_progress + verification_progress + final_progress,

    'phases', jsonb_build_object(
      'LEAD_approval', jsonb_build_object(
        'weight', 20,
        'progress', lead_progress,
        'status', sd.status
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', 20,
        'progress', plan_progress,
        'has_prd', has_prd
      ),
      'EXEC_implementation', jsonb_build_object(
        'weight', 30,
        'progress', exec_progress,
        'deliverables_tracked', has_deliverables,
        'deliverables_total', total_deliverables,
        'deliverables_complete', completed_deliverables,
        'deliverables_percentage', COALESCE(deliverable_percentage, 0),
        'real_time_tracking', true  -- Phase 5 enhancement flag
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', 15,
        'progress', verification_progress,
        'user_stories_tracked', has_user_stories,
        'stories_total', total_stories,
        'stories_validated', validated_stories,
        'stories_percentage', COALESCE(story_percentage, 0)
      ),
      'LEAD_final', jsonb_build_object(
        'weight', 15,
        'progress', final_progress,
        'has_retrospective', EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param)
      )
    ),

    'tracking_v2', jsonb_build_object(
      'version', '2.0',
      'feature', 'SD-DELIVERABLES-V2-001',
      'real_time', true,
      'auto_sync_enabled', true
    )
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_progress_breakdown_v2(VARCHAR) IS
  'SD-DELIVERABLES-V2-001 Phase 5: Enhanced progress calculation with real-time
   deliverable tracking. Shows incremental progress during EXEC phase instead
   of 0% until handoff. Includes parent/child SD support.';

-- ============================================================================
-- SECTION 2: Parent/Child SD Rollup Function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_parent_sd_progress_with_children(parent_sd_id VARCHAR)
RETURNS JSONB AS $$
DECLARE
  parent_progress JSONB;
  children_progress JSONB;
  total_child_weight NUMERIC;
  weighted_child_progress NUMERIC;
  combined_progress NUMERIC;
BEGIN
  -- Get parent progress
  parent_progress := get_progress_breakdown_v2(parent_sd_id);

  -- Get children progress using checkpoint_sd_id
  SELECT
    jsonb_agg(jsonb_build_object(
      'child_sd_id', child.sd_id,
      'deliverables_total', child.total,
      'deliverables_complete', child.complete,
      'percentage', ROUND((child.complete::NUMERIC / NULLIF(child.total, 0)) * 100, 1)
    )),
    SUM(child.total),
    SUM(child.complete)
  INTO children_progress, total_child_weight, weighted_child_progress
  FROM (
    SELECT
      sd_id,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE completion_status = 'completed') as complete
    FROM sd_scope_deliverables
    WHERE checkpoint_sd_id = parent_sd_id
    GROUP BY sd_id
  ) child;

  -- Calculate combined progress if children exist
  IF total_child_weight > 0 THEN
    combined_progress := (weighted_child_progress::NUMERIC / total_child_weight) * 100;
  ELSE
    combined_progress := (parent_progress->>'total_progress')::NUMERIC;
  END IF;

  RETURN parent_progress || jsonb_build_object(
    'children', COALESCE(children_progress, '[]'::jsonb),
    'has_children', children_progress IS NOT NULL,
    'combined_progress', ROUND(combined_progress, 1)
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_parent_sd_progress_with_children(VARCHAR) IS
  'SD-DELIVERABLES-V2-001: Calculates parent SD progress including child SD deliverables.
   Uses checkpoint_sd_id to find children.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  progress_v2_exists BOOLEAN;
  parent_rollup_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_progress_breakdown_v2'
  ) INTO progress_v2_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_parent_sd_progress_with_children'
  ) INTO parent_rollup_exists;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-DELIVERABLES-V2-001 Phase 5 Migration Verification';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'US-011 get_progress_breakdown_v2 function: %',
    CASE WHEN progress_v2_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'Parent/child rollup function: %',
    CASE WHEN parent_rollup_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE '============================================================';

  IF progress_v2_exists AND parent_rollup_exists THEN
    RAISE NOTICE 'Phase 5 Migration: SUCCESS';
  ELSE
    RAISE EXCEPTION 'Phase 5 Migration: FAILED - see above for details';
  END IF;
END $$;
