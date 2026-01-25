-- ============================================================================
-- FIX: Complete legacy_id cleanup - Fix remaining duplicate functions
-- Date: 2026-01-25
-- Issue: PAT-LEGACYID-001 (continued)
-- Problem: release_sd (2-param) and check_orphaned_work (varchar) still reference legacy_id
-- ============================================================================

-- ============================================================================
-- 1. Drop duplicate functions (will recreate correct versions)
-- ============================================================================

-- Drop both versions of release_sd
DROP FUNCTION IF EXISTS release_sd(text);
DROP FUNCTION IF EXISTS release_sd(text, text);

-- Drop both versions of check_orphaned_work
DROP FUNCTION IF EXISTS check_orphaned_work(varchar, varchar, varchar);
DROP FUNCTION IF EXISTS check_orphaned_work(uuid, varchar, varchar);

-- ============================================================================
-- 2. Recreate release_sd (1-parameter version) - FIXED
-- ============================================================================
CREATE OR REPLACE FUNCTION release_sd(p_session_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_sd_id VARCHAR;
BEGIN
  -- Get SD id from active session
  SELECT active_sd_id INTO v_sd_id
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_sd_id IS NULL THEN
    RAISE NOTICE 'No active SD for session %', p_session_id;
    RETURN;
  END IF;

  -- Deactivate session
  UPDATE claude_sessions
  SET
    active_sd_id = NULL,
    released_at = NOW()
  WHERE session_id = p_session_id;

  -- Clear is_working_on flag on the SD (FIXED: Use sd_key instead of legacy_id)
  UPDATE strategic_directives_v2
  SET is_working_on = FALSE
  WHERE sd_key = v_sd_id;

  -- Clear execution actuals
  UPDATE sd_execution_actuals
  SET status = 'paused'
  WHERE sd_id = v_sd_id;

  RAISE NOTICE 'Released SD % from session %', v_sd_id, p_session_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Recreate release_sd (2-parameter version) - FIXED
-- ============================================================================
CREATE OR REPLACE FUNCTION release_sd(p_session_id TEXT, p_reason TEXT)
RETURNS VOID AS $$
DECLARE
  v_sd_id VARCHAR;
BEGIN
  -- Get SD id from active session
  SELECT active_sd_id INTO v_sd_id
  FROM claude_sessions
  WHERE session_id = p_session_id AND released_at IS NULL;

  IF v_sd_id IS NULL THEN
    RAISE NOTICE 'No active SD for session % or already released', p_session_id;
    RETURN;
  END IF;

  -- Deactivate session with reason
  UPDATE claude_sessions
  SET
    active_sd_id = NULL,
    released_at = NOW(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('release_reason', p_reason)
  WHERE session_id = p_session_id;

  -- Clear is_working_on flag on the SD (FIXED: Use sd_key instead of legacy_id)
  UPDATE strategic_directives_v2
  SET is_working_on = FALSE
  WHERE sd_key = v_sd_id;

  RAISE NOTICE 'Released SD % from session % (reason: %)', v_sd_id, p_session_id, p_reason;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Recreate check_orphaned_work (VARCHAR version) - FIXED
-- ============================================================================
CREATE OR REPLACE FUNCTION check_orphaned_work(
  p_sd_id VARCHAR,
  p_from_type VARCHAR,
  p_to_type VARCHAR
)
RETURNS JSONB AS $$
DECLARE
  sd_uuid UUID;
  orphaned_stories INT := 0;
  orphaned_deliverables INT := 0;
  orphaned_tests INT := 0;
  orphaned_handoffs INT := 0;
  result JSONB;
BEGIN
  -- Get UUID from sd_key (FIXED: No more legacy_id variable)
  SELECT id INTO sd_uuid FROM strategic_directives_v2 WHERE sd_key = p_sd_id OR id::text = p_sd_id;

  IF sd_uuid IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'SD not found',
      'sd_id', p_sd_id
    );
  END IF;

  -- Count potentially orphaned work (using UUID for foreign key lookups)
  SELECT COUNT(*) INTO orphaned_stories
  FROM user_stories
  WHERE sd_id = sd_uuid;

  SELECT COUNT(*) INTO orphaned_deliverables
  FROM sd_scope_deliverables
  WHERE sd_id = sd_uuid;

  SELECT COUNT(*) INTO orphaned_tests
  FROM e2e_test_scenarios
  WHERE sd_id = sd_uuid;

  SELECT COUNT(*) INTO orphaned_handoffs
  FROM sd_phase_handoffs
  WHERE sd_id = p_sd_id;

  result := jsonb_build_object(
    'has_orphaned_work', (orphaned_stories + orphaned_deliverables + orphaned_tests + orphaned_handoffs) > 0,
    'orphaned_stories', orphaned_stories,
    'orphaned_deliverables', orphaned_deliverables,
    'orphaned_tests', orphaned_tests,
    'orphaned_handoffs', orphaned_handoffs,
    'total_orphaned_items', orphaned_stories + orphaned_deliverables + orphaned_tests + orphaned_handoffs
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Recreate check_orphaned_work (UUID version) - FIXED
-- ============================================================================
CREATE OR REPLACE FUNCTION check_orphaned_work(
  p_sd_id UUID,
  p_from_type VARCHAR,
  p_to_type VARCHAR
)
RETURNS JSONB AS $$
DECLARE
  sd_key_val VARCHAR;
  orphaned_stories INT := 0;
  orphaned_deliverables INT := 0;
  orphaned_tests INT := 0;
  orphaned_handoffs INT := 0;
  result JSONB;
BEGIN
  -- Get sd_key from UUID (FIXED: Use sd_key instead of legacy_id)
  SELECT sd_key INTO sd_key_val FROM strategic_directives_v2 WHERE id = p_sd_id;

  IF sd_key_val IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'SD not found',
      'sd_id', p_sd_id
    );
  END IF;

  -- Count potentially orphaned work
  SELECT COUNT(*) INTO orphaned_stories
  FROM user_stories
  WHERE sd_id = p_sd_id;

  SELECT COUNT(*) INTO orphaned_deliverables
  FROM sd_scope_deliverables
  WHERE sd_id = p_sd_id;

  SELECT COUNT(*) INTO orphaned_tests
  FROM e2e_test_scenarios
  WHERE sd_id = p_sd_id;

  SELECT COUNT(*) INTO orphaned_handoffs
  FROM sd_phase_handoffs
  WHERE sd_id = sd_key_val;

  result := jsonb_build_object(
    'has_orphaned_work', (orphaned_stories + orphaned_deliverables + orphaned_tests + orphaned_handoffs) > 0,
    'orphaned_stories', orphaned_stories,
    'orphaned_deliverables', orphaned_deliverables,
    'orphaned_tests', orphaned_tests,
    'orphaned_handoffs', orphaned_handoffs,
    'total_orphaned_items', orphaned_stories + orphaned_deliverables + orphaned_tests + orphaned_handoffs
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Add comments
-- ============================================================================
COMMENT ON FUNCTION release_sd(text) IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25) - Fixed duplicate';

COMMENT ON FUNCTION release_sd(text, text) IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25) - Fixed duplicate';

COMMENT ON FUNCTION check_orphaned_work(varchar, varchar, varchar) IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25) - Fixed duplicate';

COMMENT ON FUNCTION check_orphaned_work(uuid, varchar, varchar) IS
'PAT-LEGACYID-001: Updated to use sd_key instead of legacy_id (2026-01-25) - Fixed duplicate';

-- ============================================================================
-- Verification
-- ============================================================================
SELECT 'Remaining legacy_id cleanup complete. All duplicate functions fixed.' as status;
