-- ============================================================================
-- FORCE UPDATE: calculate_sd_progress with immediate verification
-- ============================================================================
-- This version includes a timestamp in the function to prove it updated
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  progress INTEGER := 0;
  user_stories_validated BOOLEAN := false;
  sd_uuid_val UUID;
  user_story_count INTEGER;
BEGIN
  -- TIMESTAMP MARKER: If you see 100% but this comment doesn't change, function didn't update
  -- Updated: 2025-10-19 16:00:00 UTC

  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  sd_uuid_val := sd.uuid_id;

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

  -- PHASE 4: PLAN Verification (15%) - THE CRITICAL FIX
  -- Count user stories for this SD
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

  RETURN progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- IMMEDIATE TEST: Run this right after the function update
-- ============================================================================

SELECT
  'Verification Test' as test_name,
  calculate_sd_progress('SD-PROOF-DRIVEN-1758340937844') as progress,
  CASE
    WHEN calculate_sd_progress('SD-PROOF-DRIVEN-1758340937844') = 100
    THEN '✅ SUCCESS - Function updated and working'
    WHEN calculate_sd_progress('SD-PROOF-DRIVEN-1758340937844') = 85
    THEN '❌ FAILED - Function still returns 85% (not updated or wrong logic)'
    ELSE '⚠️ UNEXPECTED - Progress is neither 85% nor 100%'
  END as result,
  (SELECT COUNT(*) FROM user_stories WHERE sd_id = 'SD-PROOF-DRIVEN-1758340937844') as user_story_count;
