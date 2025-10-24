-- ============================================================================
-- FIX: calculate_sd_progress - Fix 65% bug for SDs with no PRD
-- ============================================================================
-- Issue: SDs with no PRD get 65% progress (20+30+15) because function assumes:
--   - No deliverables = legacy SD, assume complete (+30%)
--   - No user stories = validation not required (+15%)
--
-- Root Cause: Backward compatibility logic incorrectly applies to new SDs
--
-- Solution: Only give Phase 3 & 4 credit if Phase 2 (PRD) is complete
--   - Without PRD, SDs should be at 20% (LEAD approval only)
--   - With PRD but no work, proper calculation applies
--
-- Impact: 21+ SDs will drop from 65% to 20% (correct LEAD_APPROVAL progress)
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  progress INTEGER := 0;
  sd_uuid_val UUID;

  -- Explicit boolean flags
  lead_approved BOOLEAN := false;
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  final_approval_complete BOOLEAN := false;

  -- Counts for debugging
  deliverable_total INTEGER;
  deliverable_completed INTEGER;
  user_story_count INTEGER;
  validated_count INTEGER;
  handoff_count INTEGER;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  sd_uuid_val := sd.uuid_id;

  -- =========================================================================
  -- PHASE 1: LEAD Initial Approval (20%)
  -- =========================================================================
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    lead_approved := true;
    progress := progress + 20;
  END IF;

  -- =========================================================================
  -- PHASE 2: PLAN PRD Creation (20%)
  -- =========================================================================
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE sd_uuid = sd_uuid_val
  ) INTO prd_exists;

  IF prd_exists THEN
    progress := progress + 20;
  END IF;

  -- =========================================================================
  -- PHASE 3: EXEC Implementation (30%)
  -- =========================================================================
  -- FIX: Only calculate if PRD exists (otherwise skip this phase)
  IF prd_exists THEN
    -- Check if deliverables exist
    SELECT COUNT(*) INTO deliverable_total
    FROM sd_scope_deliverables
    WHERE sd_id = sd_id_param
    AND priority IN ('required', 'high');

    IF deliverable_total = 0 THEN
      -- No deliverables tracked = legacy SD, assume complete
      deliverables_complete := true;
    ELSE
      -- Count completed deliverables
      SELECT COUNT(*) INTO deliverable_completed
      FROM sd_scope_deliverables
      WHERE sd_id = sd_id_param
      AND priority IN ('required', 'high')
      AND completion_status = 'completed';

      -- Check if all are complete
      IF deliverable_completed = deliverable_total THEN
        deliverables_complete := true;
      END IF;
    END IF;

    IF deliverables_complete THEN
      progress := progress + 30;
    END IF;
  END IF;
  -- If no PRD exists, skip Phase 3 (0% credit)

  -- =========================================================================
  -- PHASE 4: PLAN Verification (15%)
  -- =========================================================================
  -- FIX: Only calculate if PRD exists (otherwise skip this phase)
  IF prd_exists THEN
    -- Count user stories
    SELECT COUNT(*) INTO user_story_count
    FROM user_stories
    WHERE sd_id = sd_id_param;

    IF user_story_count = 0 THEN
      -- No user stories = validation not required
      user_stories_validated := true;
    ELSE
      -- Check if all user stories are validated
      SELECT COUNT(*) INTO validated_count
      FROM user_stories
      WHERE sd_id = sd_id_param
      AND validation_status = 'validated';

      IF validated_count = user_story_count THEN
        user_stories_validated := true;
      END IF;
    END IF;

    IF user_stories_validated THEN
      progress := progress + 15;
    END IF;
  END IF;
  -- If no PRD exists, skip Phase 4 (0% credit)

  -- =========================================================================
  -- PHASE 5: LEAD Final Approval (15%)
  -- =========================================================================
  DECLARE
    retrospective_exists BOOLEAN;
    handoffs_sufficient BOOLEAN;
  BEGIN
    -- Check retrospective
    SELECT EXISTS (
      SELECT 1 FROM retrospectives
      WHERE sd_id = sd_id_param
      AND status = 'PUBLISHED'
      AND quality_score IS NOT NULL
    ) INTO retrospective_exists;

    -- Check handoffs (need at least 3 accepted handoffs)
    SELECT COUNT(DISTINCT handoff_type) INTO handoff_count
    FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND status = 'accepted';

    handoffs_sufficient := (handoff_count >= 3);

    IF retrospective_exists AND handoffs_sufficient THEN
      final_approval_complete := true;
      progress := progress + 15;
    END IF;
  END;

  RETURN progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- After applying this migration, run:
--
-- SELECT id, current_phase, progress_percentage,
--        calculate_sd_progress(id) as new_progress
-- FROM strategic_directives_v2
-- WHERE progress_percentage = 65
-- ORDER BY id;
--
-- Then update all affected SDs:
--
-- UPDATE strategic_directives_v2
-- SET progress_percentage = calculate_sd_progress(id)
-- WHERE progress_percentage = 65;
-- ============================================================================
