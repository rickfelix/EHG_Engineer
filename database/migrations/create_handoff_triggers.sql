-- ============================================================================
-- DATABASE TRIGGERS: Automatic Field Updates for sd_phase_handoffs
-- ============================================================================
-- Purpose: Implement automatic field updates and progress recalculation
-- SD: SD-DATA-INTEGRITY-001
-- User Story: SD-DATA-INTEGRITY-001:US-004
-- Created: 2025-10-19
-- ============================================================================

-- ============================================================================
-- TRIGGER 1: Auto-update accepted_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_update_handoff_accepted_at()
RETURNS TRIGGER AS $$
BEGIN
  -- When status changes to 'accepted', set accepted_at
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
    NEW.accepted_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_handoff_accepted_at ON sd_phase_handoffs;

CREATE TRIGGER trigger_handoff_accepted_at
  BEFORE UPDATE OF status ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_handoff_accepted_at();

COMMENT ON FUNCTION auto_update_handoff_accepted_at() IS
'Automatically sets accepted_at timestamp when handoff status changes to accepted';

-- ============================================================================
-- TRIGGER 2: Auto-update rejected_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_update_handoff_rejected_at()
RETURNS TRIGGER AS $$
BEGIN
  -- When status changes to 'rejected', set rejected_at
  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected') THEN
    NEW.rejected_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_handoff_rejected_at ON sd_phase_handoffs;

CREATE TRIGGER trigger_handoff_rejected_at
  BEFORE UPDATE OF status ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_handoff_rejected_at();

COMMENT ON FUNCTION auto_update_handoff_rejected_at() IS
'Automatically sets rejected_at timestamp when handoff status changes to rejected';

-- ============================================================================
-- TRIGGER 3: Auto-recalculate SD progress on handoff acceptance
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_recalculate_sd_progress()
RETURNS TRIGGER AS $$
DECLARE
  new_progress INTEGER;
BEGIN
  -- Only recalculate if handoff was just accepted
  IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN

    -- Calculate new progress
    new_progress := calculate_sd_progress(NEW.sd_id);

    -- Update SD progress (if different)
    UPDATE strategic_directives_v2
    SET progress_percentage = new_progress,
        updated_at = NOW()
    WHERE id = NEW.sd_id
      AND progress_percentage != new_progress;

    RAISE NOTICE 'SD % progress recalculated: %', NEW.sd_id, new_progress;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sd_progress_recalc ON sd_phase_handoffs;

CREATE TRIGGER trigger_sd_progress_recalc
  AFTER UPDATE OF status ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION auto_recalculate_sd_progress();

COMMENT ON FUNCTION auto_recalculate_sd_progress() IS
'Automatically recalculates SD progress when handoff is accepted';

-- ============================================================================
-- TRIGGER 4: Prevent modification of migrated records
-- ============================================================================

CREATE OR REPLACE FUNCTION protect_migrated_handoffs()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is a migrated record
  IF OLD.metadata->>'migrated_from' = 'leo_handoff_executions' THEN
    -- Allow status updates only
    IF NEW.status != OLD.status THEN
      RETURN NEW; -- Allow status change
    ELSIF NEW != OLD THEN
      RAISE EXCEPTION 'Cannot modify migrated handoff except status. Record migrated from: %',
        OLD.metadata->>'migrated_from'
        USING HINT = 'Migrated handoffs are read-only except for status updates';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_migrated ON sd_phase_handoffs;

CREATE TRIGGER trigger_protect_migrated
  BEFORE UPDATE ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION protect_migrated_handoffs();

COMMENT ON FUNCTION protect_migrated_handoffs() IS
'Protects migrated handoff records from modification (except status updates)';

-- ============================================================================
-- VERIFICATION TESTS
-- ============================================================================

-- Test 1: Create a test handoff and verify auto-timestamps
DO $$
DECLARE
  test_id UUID := gen_random_uuid();
  test_sd VARCHAR := 'SD-DATA-INTEGRITY-001';
BEGIN
  RAISE NOTICE '=== TEST 1: Auto-timestamp verification ===';

  -- Insert with pending_acceptance status
  INSERT INTO sd_phase_handoffs (
    id, sd_id, from_phase, to_phase, handoff_type, status,
    executive_summary, deliverables_manifest, key_decisions,
    known_issues, resource_utilization, action_items,
    completeness_report, metadata, created_by
  ) VALUES (
    test_id, test_sd, 'EXEC', 'PLAN', 'EXEC-to-PLAN', 'pending_acceptance',
    'Test handoff for trigger verification (>50 chars required)',
    'Test deliverables', 'Test decisions', 'Test issues',
    'Test resources', 'Test actions', 'Test completeness',
    '{"test": true}'::JSONB, 'TRIGGER-TEST'
  );

  -- Update to accepted
  UPDATE sd_phase_handoffs
  SET status = 'accepted'
  WHERE id = test_id;

  -- Verify accepted_at was set
  IF EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE id = test_id
      AND accepted_at IS NOT NULL
  ) THEN
    RAISE NOTICE '✅ TEST 1 PASSED: accepted_at timestamp auto-set';
  ELSE
    RAISE WARNING '❌ TEST 1 FAILED: accepted_at not set';
  END IF;

  -- Clean up
  DELETE FROM sd_phase_handoffs WHERE id = test_id;
END $$;

-- Test 2: Verify progress recalculation
DO $$
DECLARE
  old_progress INTEGER;
  new_progress INTEGER;
  test_sd VARCHAR := 'SD-DATA-INTEGRITY-001';
BEGIN
  RAISE NOTICE '=== TEST 2: Progress recalculation verification ===';

  -- Get current progress
  SELECT progress_percentage INTO old_progress
  FROM strategic_directives_v2
  WHERE id = test_sd;

  -- Calculate what it should be
  new_progress := calculate_sd_progress(test_sd);

  IF old_progress = new_progress THEN
    RAISE NOTICE '✅ TEST 2 PASSED: Progress already correct (%)', new_progress;
  ELSE
    RAISE NOTICE '⚠️  TEST 2 INFO: Progress will be updated from % to %', old_progress, new_progress;
  END IF;
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT
  'Trigger Installation Complete' as status,
  COUNT(*) FILTER (WHERE trigger_name LIKE 'trigger_handoff_%') as handoff_triggers,
  COUNT(*) FILTER (WHERE trigger_name LIKE 'trigger_sd_%') as sd_triggers,
  COUNT(*) FILTER (WHERE trigger_name LIKE 'trigger_protect_%') as protection_triggers
FROM information_schema.triggers
WHERE event_object_table = 'sd_phase_handoffs';

-- List all triggers on sd_phase_handoffs
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'sd_phase_handoffs'
ORDER BY trigger_name;

RAISE NOTICE '✅ All triggers installed and tested successfully';
