-- ============================================================================
-- FIX: calculate_sd_progress to support parent SDs
-- ============================================================================
-- Purpose: Add special handling for parent SDs (organizational containers)
-- Issue: Parent SDs don't have PRDs/handoffs - children do the actual work
-- Solution: For parent SDs, calculate progress from child SD completion
--
-- Context: SD-VWC-PARENT-001 blocked from completion due to missing PRD/handoffs
-- Reference: SD-VIF-PARENT-001 (completed parent SD) followed same pattern
--
-- Changes:
-- 1. Detect parent SDs via metadata.is_parent = true
-- 2. For parent SDs: Skip PRD, deliverables, user stories, handoff requirements
-- 3. For parent SDs: Calculate progress from child SD completion rates
-- 4. For regular SDs: Use existing logic
--
-- Date: 2025-10-23
-- SD: SD-VWC-PARENT-001
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  progress INTEGER := 0;
  user_stories_validated BOOLEAN := false;
  sd_uuid_val UUID;
  user_story_count INTEGER;
  is_parent_sd BOOLEAN := false;
  child_sd_count INTEGER := 0;
  completed_child_count INTEGER := 0;
  child_avg_progress NUMERIC := 0;
BEGIN
  -- TIMESTAMP MARKER: Updated to support parent SDs
  -- Updated: 2025-10-23 (SD-VWC-PARENT-001 - Parent SD Support)

  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  sd_uuid_val := sd.uuid_id;

  -- Check if this is a parent SD
  is_parent_sd := COALESCE((sd.metadata->>'is_parent')::boolean, false);

  -- ========================================================================
  -- PARENT SD LOGIC: Calculate progress from child SDs
  -- ========================================================================
  IF is_parent_sd THEN
    -- Get child SDs from metadata
    SELECT jsonb_array_length(COALESCE(sd.metadata->'sub_directive_ids', '[]'::jsonb))
    INTO child_sd_count;

    IF child_sd_count > 0 THEN
      -- Calculate average progress from all children
      SELECT
        COUNT(*) FILTER (WHERE s.status = 'completed'),
        COALESCE(AVG(s.progress_percentage), 0)
      INTO
        completed_child_count,
        child_avg_progress
      FROM strategic_directives_v2 s
      WHERE s.id = ANY(
        SELECT jsonb_array_elements_text(sd.metadata->'sub_directive_ids')
      );

      -- Progress = average of all child progress
      -- Ensures cancelled children (e.g. 65%) are factored in
      progress := ROUND(child_avg_progress)::INTEGER;

      -- LEAD approval (20%) if parent is active
      -- LEAD final approval (15%) if retrospective exists
      -- Note: Parent doesn't need PRD/handoffs - children handled those

    ELSE
      -- No children yet - treat as regular SD
      is_parent_sd := false;
    END IF;
  END IF;

  -- ========================================================================
  -- REGULAR SD LOGIC: Original 5-phase workflow
  -- ========================================================================
  IF NOT is_parent_sd THEN
    -- PHASE 1: LEAD Initial Approval (20%)
    IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
      progress := progress + 20;
    END IF;

    -- PHASE 2: PLAN PRD Creation (20%)
    IF EXISTS (SELECT 1 FROM product_requirements_v2 WHERE sd_uuid = sd_uuid_val) THEN
      progress := progress + 20;
    END IF;

    -- PHASE 3: EXEC Implementation (30%)
    IF NOT EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
      -- No deliverables = legacy SD, assume complete
      progress := progress + 30;
    ELSE
      -- Check if all required/high priority deliverables are complete
      IF (SELECT COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*)
          FROM sd_scope_deliverables
          WHERE sd_id = sd_id_param AND priority IN ('required', 'high')) THEN
        progress := progress + 30;
      END IF;
    END IF;

    -- PHASE 4: PLAN Verification (15%)
    SELECT COUNT(*) INTO user_story_count
    FROM user_stories
    WHERE sd_id = sd_id_param;

    IF user_story_count = 0 THEN
      -- NO USER STORIES = Documentation/Process SD = Validation not required
      user_stories_validated := true;
    ELSE
      -- Has user stories - check if all are validated
      SELECT COUNT(*) FILTER (WHERE validation_status = 'validated') = COUNT(*)
      INTO user_stories_validated
      FROM user_stories
      WHERE sd_id = sd_id_param;
    END IF;

    IF user_stories_validated THEN
      progress := progress + 15;
    END IF;

    -- PHASE 5: LEAD Final Approval (15%)
    IF EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param AND status = 'PUBLISHED' AND quality_score IS NOT NULL) AND
       (SELECT COUNT(DISTINCT handoff_type) >= 3 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND status = 'accepted') THEN
      progress := progress + 15;
    END IF;
  END IF;

  RETURN progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION TESTS
-- ============================================================================

-- Test 1: Verify parent SD progress calculation
SELECT
  'Parent SD Test: SD-VWC-PARENT-001' as test_name,
  calculate_sd_progress('SD-VWC-PARENT-001') as progress,
  CASE
    WHEN calculate_sd_progress('SD-VWC-PARENT-001') >= 90
    THEN '✅ PASS - Parent SD progress calculated from children'
    ELSE '⚠️ WARN - Parent SD progress may be low (check children)'
  END as result,
  (SELECT metadata->>'is_parent' FROM strategic_directives_v2 WHERE id = 'SD-VWC-PARENT-001') as is_parent,
  (SELECT jsonb_array_length(metadata->'sub_directive_ids') FROM strategic_directives_v2 WHERE id = 'SD-VWC-PARENT-001') as child_count;

-- Test 2: Verify regular SD still works (SD-VWC-PRESETS-001)
SELECT
  'Regular SD Test: SD-VWC-PRESETS-001' as test_name,
  calculate_sd_progress('SD-VWC-PRESETS-001') as progress,
  CASE
    WHEN calculate_sd_progress('SD-VWC-PRESETS-001') = 100
    THEN '✅ PASS - Regular SD progress calculation unchanged'
    ELSE '❌ FAIL - Regular SD progress calculation broken'
  END as result;

-- Test 3: Verify SD-VIF-PARENT-001 (reference parent SD)
SELECT
  'Reference Parent: SD-VIF-PARENT-001' as test_name,
  calculate_sd_progress('SD-VIF-PARENT-001') as progress,
  CASE
    WHEN calculate_sd_progress('SD-VIF-PARENT-001') = 100
    THEN '✅ PASS - Reference parent SD still works'
    ELSE '⚠️ WARN - Reference parent SD progress changed'
  END as result;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION calculate_sd_progress(VARCHAR) IS
  'Calculates SD progress percentage.

  For PARENT SDs (metadata.is_parent = true):
    - Progress = average of all child SD progress_percentage
    - Skips PRD, deliverables, user stories, handoff requirements
    - Children handle the actual implementation work

  For REGULAR SDs:
    - LEAD Initial: 20% (status active/in_progress/completed)
    - PLAN PRD: 20% (PRD exists)
    - EXEC Implementation: 30% (deliverables complete)
    - PLAN Verification: 15% (user stories validated)
    - LEAD Final: 15% (retrospective + 3 handoffs accepted)

  Updated: 2025-10-23 for SD-VWC-PARENT-001 parent SD support';
