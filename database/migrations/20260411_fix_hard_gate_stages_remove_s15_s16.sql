-- SD-FIX-HARDGATESTAGES-DATA-DRIFT-ORCH-001-A
-- Fix: Remove S15 and S16 from hard_gate_stages in chairman_dashboard_config
--
-- Root cause: S15 (Design Studio, artifact_only) and S16 were added via ad-hoc
-- DB edit not tracked in any migration. This causes the SAE (_canAutoAdvance)
-- to block all ventures at S15 unnecessarily.
--
-- Canonical list derived from gate-constants.js CHAIRMAN_GATES.BLOCKING:
--   Set([3, 5, 10, 13, 17, 18, 19, 20, 23, 24, 25])
-- Note: S20 is in CHAIRMAN_GATES.BLOCKING but was not in hard_gate_stages
-- previously. We restore to the last known-good migration value from
-- 20260403_fix_gate_enforcement_config.sql:
--   ARRAY[3, 5, 10, 13, 17, 18, 19, 23, 24, 25]

DO $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  UPDATE chairman_dashboard_config
  SET hard_gate_stages = ARRAY[3, 5, 10, 13, 17, 18, 19, 23, 24, 25],
      updated_at = NOW()
  WHERE config_key = 'default';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'hard_gate_stages fix: no rows matched config_key=default. Check chairman_dashboard_config.';
  END IF;

  IF v_rows_updated > 1 THEN
    RAISE EXCEPTION 'hard_gate_stages fix: % rows updated (expected 1). Aborting.', v_rows_updated;
  END IF;

  RAISE NOTICE 'hard_gate_stages corrected: removed S15/S16. Updated % row(s).', v_rows_updated;
END $$;
