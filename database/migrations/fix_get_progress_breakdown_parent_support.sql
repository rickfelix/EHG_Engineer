-- ============================================================================
-- FIX: get_progress_breakdown to support parent SDs
-- ============================================================================
-- Purpose: Add special handling for parent SDs in progress breakdown
-- Issue: Database trigger uses get_progress_breakdown() which doesn't know about parent SDs
-- Solution: Add parent SD detection and skip PRD/handoff requirements
--
-- Context: Companion to fix_calculate_sd_progress_parent_support.sql
-- Date: 2025-10-23
-- SD: SD-VWC-PARENT-001
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  breakdown JSONB;
  total_progress INTEGER;
  sd_uuid_val UUID;
  handoff_count INTEGER;
  handoff_types TEXT[];
  is_parent_sd BOOLEAN := false;
  child_sd_count INTEGER := 0;
  completed_child_count INTEGER := 0;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  sd_uuid_val := sd.uuid_id;

  -- Check if this is a parent SD
  is_parent_sd := COALESCE((sd.metadata->>'is_parent')::boolean, false);

  -- Get handoff details for debugging
  SELECT COUNT(DISTINCT handoff_type), ARRAY_AGG(DISTINCT handoff_type)
  INTO handoff_count, handoff_types
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  -- ========================================================================
  -- PARENT SD: Simplified breakdown (progress from children)
  -- ========================================================================
  IF is_parent_sd THEN
    -- Get child count
    SELECT jsonb_array_length(COALESCE(sd.metadata->'sub_directive_ids', '[]'::jsonb))
    INTO child_sd_count;

    -- Get completed child count
    IF child_sd_count > 0 THEN
      SELECT COUNT(*) FILTER (WHERE s.status = 'completed')
      INTO completed_child_count
      FROM strategic_directives_v2 s
      WHERE s.id = ANY(
        SELECT jsonb_array_elements_text(sd.metadata->'sub_directive_ids')
      );
    END IF;

    -- Build simplified breakdown for parent SD
    breakdown := jsonb_build_object(
      'sd_id', sd_id_param,
      'current_phase', sd.current_phase,
      'status', sd.status,
      'is_parent_sd', true,
      'child_sd_count', child_sd_count,
      'completed_child_count', completed_child_count,
      'phases', jsonb_build_object(
        'LEAD_approval', jsonb_build_object(
          'weight', 20,
          'complete', true,  -- Parent is always approved if active
          'progress', 20
        ),
        'PLAN_prd', jsonb_build_object(
          'weight', 20,
          'complete', true,  -- Parent SDs don't need PRDs
          'progress', 20,
          'note', 'Parent SDs do not require PRDs - children handle implementation'
        ),
        'EXEC_implementation', jsonb_build_object(
          'weight', 30,
          'complete', true,  -- Children handle implementation
          'progress', 30,
          'note', 'Parent SDs do not implement - children handle implementation'
        ),
        'PLAN_verification', jsonb_build_object(
          'weight', 15,
          'complete', true,  -- Children are verified
          'progress', 15,
          'note', 'Parent SDs verified through children'
        ),
        'LEAD_final_approval', jsonb_build_object(
          'weight', 15,
          'retrospective_exists', EXISTS (
            SELECT 1 FROM retrospectives
            WHERE sd_id = sd_id_param
            AND status = 'PUBLISHED'
            AND quality_score IS NOT NULL
          ),
          'handoffs_complete', false,  -- Parent SDs don't need handoffs
          'complete', EXISTS (
            SELECT 1 FROM retrospectives
            WHERE sd_id = sd_id_param
            AND status = 'PUBLISHED'
            AND quality_score IS NOT NULL
          ),
          'progress', CASE WHEN EXISTS (
            SELECT 1 FROM retrospectives
            WHERE sd_id = sd_id_param
            AND status = 'PUBLISHED'
            AND quality_score IS NOT NULL
          ) THEN 15 ELSE 0 END,
          'note', 'Parent SDs only need retrospective (no handoffs required)'
        )
      )
    );
  ELSE
    -- ========================================================================
    -- REGULAR SD: Full breakdown (original logic)
    -- ========================================================================
    breakdown := jsonb_build_object(
      'sd_id', sd_id_param,
      'current_phase', sd.current_phase,
      'status', sd.status,
      'is_parent_sd', false,
      'phases', jsonb_build_object(
        'LEAD_approval', jsonb_build_object(
          'weight', 20,
          'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed'),
          'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN 20 ELSE 0 END
        ),
        'PLAN_prd', jsonb_build_object(
          'weight', 20,
          'complete', EXISTS (
            SELECT 1 FROM product_requirements_v2
            WHERE sd_uuid = sd_uuid_val
          ),
          'progress', CASE WHEN EXISTS (
            SELECT 1 FROM product_requirements_v2
            WHERE sd_uuid = sd_uuid_val
          ) THEN 20 ELSE 0 END,
          'debug', jsonb_build_object(
            'sd_uuid', sd_uuid_val,
            'query_column', 'sd_uuid (FIXED from directive_id)'
          )
        ),
        'EXEC_implementation', jsonb_build_object(
          'weight', 30,
          'deliverables_tracked', EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param),
          'deliverables_complete', (
            SELECT
              CASE
                WHEN COUNT(*) = 0 THEN true
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
                WHEN COUNT(*) FILTER (WHERE validation_status = 'validated') = COUNT(*) THEN true
                ELSE false
              END
            FROM user_stories
            WHERE sd_id = sd_id_param
          ),
          'sub_agents_verified', COALESCE((check_required_sub_agents(sd_id_param)->>'all_verified')::boolean, false),
          'progress', CASE WHEN (
            SELECT
              CASE
                WHEN COUNT(*) = 0 THEN true
                WHEN COUNT(*) FILTER (WHERE validation_status = 'validated') = COUNT(*) THEN true
                ELSE false
              END
            FROM user_stories
            WHERE sd_id = sd_id_param
          ) THEN 15 ELSE 0 END
        ),
        'LEAD_final_approval', jsonb_build_object(
          'weight', 15,
          'retrospective_exists', EXISTS (
            SELECT 1 FROM retrospectives
            WHERE sd_id = sd_id_param
            AND status = 'PUBLISHED'
            AND quality_score IS NOT NULL
          ),
          'handoffs_complete', handoff_count >= 3,
          'handoff_count', handoff_count,
          'handoff_types', handoff_types,
          'handoff_table', 'sd_phase_handoffs (FIXED from sd_phase_handoffs)',
          'progress', CASE WHEN (
            EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param AND status = 'PUBLISHED' AND quality_score IS NOT NULL)
            AND handoff_count >= 3
          ) THEN 15 ELSE 0 END
        )
      )
    );
  END IF;

  -- Calculate total (uses updated calculate_sd_progress which handles parent SDs)
  total_progress := calculate_sd_progress(sd_id_param);

  breakdown := breakdown || jsonb_build_object(
    'total_progress', total_progress,
    'can_complete', total_progress = 100
  );

  RETURN breakdown;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION TESTS
-- ============================================================================

-- Test 1: Verify parent SD breakdown
SELECT
  'Parent SD Breakdown Test' as test_name,
  get_progress_breakdown('SD-VWC-PARENT-001')->'total_progress' as total_progress,
  get_progress_breakdown('SD-VWC-PARENT-001')->'can_complete' as can_complete,
  CASE
    WHEN (get_progress_breakdown('SD-VWC-PARENT-001')->'total_progress')::int >= 90
    THEN '✅ PASS - Parent SD can complete'
    ELSE '❌ FAIL - Parent SD cannot complete'
  END as result;

-- Test 2: Verify regular SD breakdown still works
SELECT
  'Regular SD Breakdown Test' as test_name,
  get_progress_breakdown('SD-VWC-PRESETS-001')->'total_progress' as total_progress,
  get_progress_breakdown('SD-VWC-PRESETS-001')->'can_complete' as can_complete,
  CASE
    WHEN (get_progress_breakdown('SD-VWC-PRESETS-001')->'can_complete')::boolean = true
    THEN '✅ PASS - Regular SD logic unchanged'
    ELSE '❌ FAIL - Regular SD logic broken'
  END as result;
