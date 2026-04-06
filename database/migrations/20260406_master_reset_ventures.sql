-- ============================================================================
-- SD-UNIFIED-STAGE-GATE-ARTIFACTPRECONDITION-ORCH-001-D
-- Master reset: TRUNCATE ventures CASCADE
-- ============================================================================
-- GATED: Only runs when MASTER_RESET_CONFIRMED env var is 'true'.
-- Chairman has authorized this reset for clean artifact gate testing.
--
-- WARNING: This is a destructive operation that removes ALL ventures
-- and their dependent data (artifacts, stage work, transitions).
--
-- To execute:
--   MASTER_RESET_CONFIRMED=true node scripts/run-migration.js database/migrations/20260406_master_reset_ventures.sql
-- ============================================================================

DO $$
DECLARE
  v_venture_count INTEGER;
BEGIN
  -- Count current ventures for audit log
  SELECT count(*) INTO v_venture_count FROM ventures;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'MASTER RESET: ventures table';
  RAISE NOTICE 'Ventures to delete: %', v_venture_count;
  RAISE NOTICE '============================================';

  IF v_venture_count = 0 THEN
    RAISE NOTICE 'No ventures to delete. Skipping.';
    RETURN;
  END IF;

  -- Execute the truncate
  TRUNCATE ventures CASCADE;

  RAISE NOTICE '✅ TRUNCATE ventures CASCADE complete';
  RAISE NOTICE '   Deleted % venture(s) and all dependent data', v_venture_count;
  RAISE NOTICE '';
END $$;
