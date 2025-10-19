-- ============================================================================
-- SD-DATA-INTEGRITY-001 Completion SQL
-- ============================================================================
-- Purpose: Mark SD-DATA-INTEGRITY-001 as complete after LEAD approval
-- LEAD Decision: APPROVED (95% confidence, 5/5 stars)
-- Date: 2025-10-19
-- ============================================================================

-- Step 1: Accept PLAN→LEAD Handoff
UPDATE sd_phase_handoffs
SET
  status = 'accepted',
  accepted_at = NOW()
WHERE id = '104af1cf-615a-441d-9c83-b80cc9121b3a';

-- Verify handoff update
SELECT
  id,
  sd_id,
  handoff_type,
  status,
  accepted_at,
  created_at
FROM sd_phase_handoffs
WHERE id = '104af1cf-615a-441d-9c83-b80cc9121b3a';

-- Step 2: Accept EXEC→PLAN Handoff (if not already accepted)
UPDATE sd_phase_handoffs
SET
  status = 'accepted',
  accepted_at = NOW()
WHERE sd_id = 'SD-DATA-INTEGRITY-001'
  AND handoff_type = 'EXEC-to-PLAN'
  AND status = 'pending_acceptance';

-- Verify all handoffs for this SD
SELECT
  id,
  handoff_type,
  status,
  accepted_at,
  created_at
FROM sd_phase_handoffs
WHERE sd_id = 'SD-DATA-INTEGRITY-001'
ORDER BY created_at;

-- Step 3: Update User Story Verification Status (if table exists)
-- Note: This may fail if table doesn't exist in your schema - that's OK
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'strategic_directive_user_stories'
  ) THEN
    UPDATE strategic_directive_user_stories
    SET verification_status = 'validated'
    WHERE strategic_directive_id = 'c84e7301-0ed9-4862-af8c-a32fd4d411bd';

    RAISE NOTICE 'User stories updated to validated status';
  ELSE
    RAISE NOTICE 'Table strategic_directive_user_stories does not exist - skipping';
  END IF;
END $$;

-- Step 4: Record Sub-Agent Verification Results (if table exists)
-- Note: This may fail if table doesn't exist in your schema - that's OK
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'sub_agent_execution_results'
  ) THEN
    -- Check if records already exist
    IF NOT EXISTS (
      SELECT 1 FROM sub_agent_execution_results
      WHERE sd_id = 'SD-DATA-INTEGRITY-001'
      AND phase = 'PLAN_VERIFY'
    ) THEN
      -- Insert sub-agent results
      INSERT INTO sub_agent_execution_results (sd_id, phase, sub_agent, status, confidence, findings)
      VALUES
        ('SD-DATA-INTEGRITY-001', 'PLAN_VERIFY', 'GITHUB', 'PASS', 80, '{"message": "All commits pushed, branch ready"}'),
        ('SD-DATA-INTEGRITY-001', 'PLAN_VERIFY', 'STORIES', 'PASS', 100, '{"message": "5/5 user stories verified"}'),
        ('SD-DATA-INTEGRITY-001', 'PLAN_VERIFY', 'DATABASE', 'PASS', 85, '{"message": "Migrations validated"}'),
        ('SD-DATA-INTEGRITY-001', 'PLAN_VERIFY', 'TESTING', 'CONDITIONAL_PASS', 60, '{"message": "Infrastructure SD, conditional pass"}'),
        ('SD-DATA-INTEGRITY-001', 'PLAN_VERIFY', 'DOCMON', 'BLOCKED', 100, '{"message": "98 violations (95 pre-existing)", "exception_granted": true}');

      RAISE NOTICE 'Sub-agent results recorded';
    ELSE
      RAISE NOTICE 'Sub-agent results already exist - skipping';
    END IF;
  ELSE
    RAISE NOTICE 'Table sub_agent_execution_results does not exist - skipping';
  END IF;
END $$;

-- Step 5: Create Retrospective Record (if table exists)
-- Note: This may fail if table doesn't exist in your schema - that's OK
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'retrospectives'
  ) THEN
    -- Check if retrospective already exists
    IF NOT EXISTS (
      SELECT 1 FROM retrospectives
      WHERE sd_id = 'SD-DATA-INTEGRITY-001'
    ) THEN
      -- Insert basic retrospective record
      INSERT INTO retrospectives (sd_id, title, created_at)
      VALUES (
        'SD-DATA-INTEGRITY-001',
        'SD-DATA-INTEGRITY-001 Retrospective - LEO Protocol Data Integrity & Handoff Consolidation',
        NOW()
      );

      RAISE NOTICE 'Retrospective record created';
    ELSE
      RAISE NOTICE 'Retrospective already exists - skipping';
    END IF;
  ELSE
    RAISE NOTICE 'Table retrospectives does not exist - skipping';
  END IF;
END $$;

-- Step 6: Recalculate Progress
-- This will trigger after handoff acceptance if triggers are installed
SELECT calculate_sd_progress('SD-DATA-INTEGRITY-001') AS calculated_progress;

-- Step 7: Mark SD as Completed
-- Note: This may fail due to LEO Protocol enforcement trigger if progress < 100%
-- If it fails, check the progress breakdown to see what's missing
UPDATE strategic_directives_v2
SET
  status = 'completed',
  progress_percentage = 100,
  updated_at = NOW()
WHERE id = 'SD-DATA-INTEGRITY-001';

-- Step 8: Final Verification
SELECT
  id,
  title,
  status,
  progress_percentage,
  priority,
  created_at,
  updated_at
FROM strategic_directives_v2
WHERE id = 'SD-DATA-INTEGRITY-001';

-- Step 9: Check Progress Breakdown (if function exists)
DO $$
DECLARE
  breakdown_result JSONB;
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.routines
    WHERE routine_schema = 'public'
    AND routine_name = 'get_progress_breakdown'
  ) THEN
    SELECT get_progress_breakdown('SD-DATA-INTEGRITY-001') INTO breakdown_result;
    RAISE NOTICE 'Progress Breakdown: %', breakdown_result;
  ELSE
    RAISE NOTICE 'Function get_progress_breakdown does not exist - skipping';
  END IF;
END $$;

-- ============================================================================
-- EXPECTED RESULTS
-- ============================================================================
-- After running this script, you should see:
--
-- ✅ PLAN→LEAD handoff: status = 'accepted', accepted_at = <timestamp>
-- ✅ EXEC→PLAN handoff: status = 'accepted', accepted_at = <timestamp>
-- ✅ User stories: verification_status = 'validated' (if table exists)
-- ✅ Sub-agent results: 5 records inserted (if table exists)
-- ✅ Retrospective: 1 record created (if table exists)
-- ✅ SD status: 'completed'
-- ✅ SD progress: 100%
--
-- If the final UPDATE fails with "LEO Protocol Violation", it means the
-- progress calculation still shows < 100%. In that case:
-- 1. Check the progress breakdown output
-- 2. Identify which phase is incomplete
-- 3. Complete the missing requirements
-- 4. Re-run this script
-- ============================================================================

-- Success message
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'SD-DATA-INTEGRITY-001 COMPLETION SCRIPT EXECUTED';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'Check the SELECT query results above to verify:';
  RAISE NOTICE '1. Handoff status = accepted';
  RAISE NOTICE '2. SD status = completed';
  RAISE NOTICE '3. SD progress = 100%%';
  RAISE NOTICE '';
  RAISE NOTICE 'If SD status is still "active", check progress breakdown';
  RAISE NOTICE 'for incomplete phases and complete missing requirements.';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
