-- ============================================================================
-- Fix: Trigger-based orchestrator unblock on stage advancement
-- ============================================================================
-- Problem: The frontend "Mark Complete" button calls advance_venture_stage()
--          (without fn_ prefix), which does NOT unblock the orchestrator.
--          fn_advance_venture_stage (with prefix) is called by the backend.
--          Both functions advance current_lifecycle_stage but only one has
--          the orchestrator unblock.
--
-- Solution: A BEFORE UPDATE trigger on ventures that unblocks the orchestrator
--           whenever current_lifecycle_stage changes. This works for ALL
--           functions that advance stages, including direct SQL updates.
--
-- Created: 2026-03-17
-- ============================================================================

CREATE OR REPLACE FUNCTION trg_unblock_orchestrator_on_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  -- When current_lifecycle_stage changes and orchestrator was blocked,
  -- reset to idle so the worker picks the venture back up.
  IF NEW.current_lifecycle_stage IS DISTINCT FROM OLD.current_lifecycle_stage
     AND OLD.orchestrator_state = 'blocked' THEN
    NEW.orchestrator_state := 'idle';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to allow idempotent re-runs
DROP TRIGGER IF EXISTS trg_venture_advance_unblock ON ventures;

CREATE TRIGGER trg_venture_advance_unblock
  BEFORE UPDATE ON ventures
  FOR EACH ROW
  WHEN (OLD.current_lifecycle_stage IS DISTINCT FROM NEW.current_lifecycle_stage)
  EXECUTE FUNCTION trg_unblock_orchestrator_on_stage_change();

COMMENT ON FUNCTION trg_unblock_orchestrator_on_stage_change() IS
'Automatically unblocks orchestrator_state when a venture stage advances.
Works regardless of which RPC or direct SQL update changes the stage.
Paired with fn_advance_venture_stage and advance_venture_stage RPCs.';

-- ============================================================================
-- SUMMARY
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Orchestrator Unblock Trigger Created';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Trigger: trg_venture_advance_unblock';
  RAISE NOTICE 'Fires: BEFORE UPDATE on ventures';
  RAISE NOTICE 'Condition: current_lifecycle_stage changes AND orchestrator_state = blocked';
  RAISE NOTICE 'Action: Sets orchestrator_state = idle';
  RAISE NOTICE '';
END $$;
