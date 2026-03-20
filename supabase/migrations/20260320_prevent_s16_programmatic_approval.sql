-- Migration: Prevent programmatic approval of Stage 16 (Blueprint->Build promotion gate)
-- Stage 16 is the Blueprint->Build boundary and MUST always require manual chairman approval.
-- Programmatic approvals from workers, Claude sessions, and scripts are BLOCKED.
-- Only chairman dashboard UI (decided_by containing 'chairman') can approve stage 16.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_reject_s16_programmatic_approval ON chairman_decisions;
--   DROP FUNCTION IF EXISTS reject_s16_programmatic_approval();

CREATE OR REPLACE FUNCTION reject_s16_programmatic_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enforce on stage 16 transitions from pending to approved
  IF NEW.lifecycle_stage = 16
     AND NEW.status = 'approved'
     AND (OLD.status IS DISTINCT FROM 'approved')
  THEN
    -- Chairman UI sets decided_by to values containing 'chairman'
    -- (e.g., 'chairman_dashboard', 'chairman_ui', 'chairman_manual')
    IF NEW.decided_by IS NULL
       OR LOWER(NEW.decided_by) NOT LIKE '%chairman%'
    THEN
      RAISE EXCEPTION
        'Stage 16 (Blueprint->Build) requires manual chairman approval. '
        'Programmatic approval is blocked. decided_by=% does not indicate chairman UI origin. '
        'Use the chairman dashboard to approve this stage.',
        COALESCE(NEW.decided_by, 'NULL');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reject_s16_programmatic_approval() IS
  'Prevents programmatic approval of Stage 16 (Blueprint->Build gate). '
  'Only chairman dashboard UI (decided_by LIKE %chairman%) can approve stage 16.';

-- Drop existing trigger if present (idempotent)
DROP TRIGGER IF EXISTS trg_reject_s16_programmatic_approval ON chairman_decisions;

CREATE TRIGGER trg_reject_s16_programmatic_approval
  BEFORE UPDATE ON chairman_decisions
  FOR EACH ROW
  EXECUTE FUNCTION reject_s16_programmatic_approval();
