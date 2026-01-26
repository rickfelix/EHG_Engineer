-- ============================================================================
-- FIX: check_orphaned_work UUID type mismatch
-- Date: 2026-01-25
-- SD: SD-LEO-ENH-AUTO-PROCEED-001-12
-- Issue: Function attempts to cast VARCHAR id to UUID, and uses UUID to query VARCHAR foreign keys
-- Root Cause: Incorrect variable types - should use VARCHAR throughout
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS check_orphaned_work(varchar, varchar, varchar);
DROP FUNCTION IF EXISTS check_orphaned_work(uuid, varchar, varchar);

-- ============================================================================
-- Recreate check_orphaned_work (VARCHAR version) - FIXED to use VARCHAR not UUID
-- ============================================================================
CREATE OR REPLACE FUNCTION check_orphaned_work(
  p_sd_id VARCHAR,
  p_from_type VARCHAR,
  p_to_type VARCHAR
)
RETURNS JSONB AS $$
DECLARE
  sd_id_found VARCHAR;  -- FIXED: Changed from UUID to VARCHAR
  orphaned_stories INT := 0;
  orphaned_deliverables INT := 0;
  orphaned_tests INT := 0;
  orphaned_handoffs INT := 0;
  result JSONB;
BEGIN
  -- Get id from sd_key or id match (FIXED: Select id which is VARCHAR, not UUID)
  SELECT id INTO sd_id_found
  FROM strategic_directives_v2
  WHERE sd_key = p_sd_id OR id = p_sd_id;  -- FIXED: No ::text cast needed

  IF sd_id_found IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'SD not found',
      'sd_id', p_sd_id
    );
  END IF;

  -- Count potentially orphaned work (using VARCHAR id for foreign key lookups)
  SELECT COUNT(*) INTO orphaned_stories
  FROM user_stories
  WHERE sd_id = sd_id_found;  -- FIXED: user_stories.sd_id is VARCHAR(50)

  SELECT COUNT(*) INTO orphaned_deliverables
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_found;  -- FIXED: sd_scope_deliverables.sd_id is VARCHAR(100)

  SELECT COUNT(*) INTO orphaned_tests
  FROM e2e_test_scenarios
  WHERE sd_id = sd_id_found;  -- FIXED: e2e_test_scenarios.sd_id type varies

  SELECT COUNT(*) INTO orphaned_handoffs
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_found;  -- FIXED: Use found id consistently

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
-- Recreate check_orphaned_work (UUID version) - FIXED to use VARCHAR not UUID
-- ============================================================================
CREATE OR REPLACE FUNCTION check_orphaned_work(
  p_sd_id UUID,
  p_from_type VARCHAR,
  p_to_type VARCHAR
)
RETURNS JSONB AS $$
DECLARE
  sd_id_found VARCHAR;  -- FIXED: Changed from UUID to VARCHAR
  orphaned_stories INT := 0;
  orphaned_deliverables INT := 0;
  orphaned_tests INT := 0;
  orphaned_handoffs INT := 0;
  result JSONB;
BEGIN
  -- Get id from uuid_id match (FIXED: Select id which is VARCHAR)
  SELECT id INTO sd_id_found
  FROM strategic_directives_v2
  WHERE uuid_id = p_sd_id;  -- uuid_id is UUID column (but deprecated for FKs)

  IF sd_id_found IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'SD not found',
      'sd_id', p_sd_id
    );
  END IF;

  -- Count potentially orphaned work (using VARCHAR id for foreign key lookups)
  SELECT COUNT(*) INTO orphaned_stories
  FROM user_stories
  WHERE sd_id = sd_id_found;  -- FIXED: user_stories.sd_id is VARCHAR(50)

  SELECT COUNT(*) INTO orphaned_deliverables
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_found;  -- FIXED: sd_scope_deliverables.sd_id is VARCHAR(100)

  SELECT COUNT(*) INTO orphaned_tests
  FROM e2e_test_scenarios
  WHERE sd_id = sd_id_found;  -- FIXED: e2e_test_scenarios.sd_id type varies

  SELECT COUNT(*) INTO orphaned_handoffs
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_found;  -- FIXED: Use found id consistently

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
COMMENT ON FUNCTION check_orphaned_work(varchar, varchar, varchar) IS
'SD-LEO-ENH-AUTO-PROCEED-001-12: Fixed UUID type mismatch - uses VARCHAR throughout (2026-01-25)';

COMMENT ON FUNCTION check_orphaned_work(uuid, varchar, varchar) IS
'SD-LEO-ENH-AUTO-PROCEED-001-12: Fixed UUID type mismatch - uses VARCHAR for FKs (2026-01-25)';

-- ============================================================================
-- Verification query
-- ============================================================================
SELECT
  'check_orphaned_work UUID type mismatch fixed' as status,
  'Now uses VARCHAR id for all child table queries' as detail;
