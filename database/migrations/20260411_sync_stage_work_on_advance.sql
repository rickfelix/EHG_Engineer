-- SD-FIX-VENTURESTAGEWORK-STATUS-DRIFT-ORCH-001-A
-- Fix: Sync venture_stage_work.stage_status when ventures.current_lifecycle_stage
-- is advanced externally (chairman approval, monitoring agent, admin scripts).
--
-- Root cause: Only _advanceStage() in stage-execution-worker.js updates
-- venture_stage_work. External DB updates leave stage_status as 'blocked'.
-- This causes stale dashboard state, incorrect S20 pause controller behavior,
-- and misleading health checks.
--
-- Guards (per CRO recommendation):
--   1. Concurrency: skip if stage_work already completed (prevents double-write with worker)
--   2. Direction: only fire when stage increases (prevents false completion on rollbacks)

CREATE OR REPLACE FUNCTION fn_sync_stage_work_on_advance()
RETURNS TRIGGER AS $$
BEGIN
  -- Direction guard: only advance, never rollback
  IF NEW.current_lifecycle_stage <= OLD.current_lifecycle_stage THEN
    RETURN NEW;
  END IF;

  -- Mark the prior stage as completed (the stage we're advancing FROM)
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      completed_at = COALESCE(completed_at, NOW()),
      updated_at = NOW()
  WHERE venture_id = NEW.id
    AND lifecycle_stage = OLD.current_lifecycle_stage
    AND stage_status != 'completed';  -- Concurrency guard: no-op if worker already completed

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if any (idempotent)
DROP TRIGGER IF EXISTS trg_sync_stage_work_on_advance ON ventures;

-- Create trigger: BEFORE UPDATE so it fires alongside trg_venture_advance_unblock
CREATE TRIGGER trg_sync_stage_work_on_advance
  BEFORE UPDATE ON ventures
  FOR EACH ROW
  WHEN (OLD.current_lifecycle_stage IS DISTINCT FROM NEW.current_lifecycle_stage)
  EXECUTE FUNCTION fn_sync_stage_work_on_advance();

COMMENT ON FUNCTION fn_sync_stage_work_on_advance() IS
  'Syncs venture_stage_work.stage_status to completed when ventures.current_lifecycle_stage '
  'advances externally (bypassing worker _advanceStage). Concurrency-safe: no-op if already completed. '
  'Direction-safe: no-op on rollbacks. SD-FIX-VENTURESTAGEWORK-STATUS-DRIFT-ORCH-001-A.';
