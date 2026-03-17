-- Migration: Fix chairman_decisions_decision_check + auto-unblock orchestrator trigger
-- SD: SD-LEO-FIX-VENTURE-PIPELINE-GATE-RESILIENCE-001
-- Date: 2026-03-17
-- Purpose:
--   1. Expand chairman_decisions.decision CHECK constraint to include 'review' and 'advisory'
--   2. Create trigger to auto-reset ventures.orchestrator_state to 'idle' when a decision is approved
--
-- Pre-migration validation (run manually to confirm):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conname = 'chairman_decisions_decision_check';

BEGIN;

-- ============================================================
-- Migration 1: Fix chairman_decisions_decision_check constraint
-- ============================================================
-- Current constraint has 28 values but is missing: 'review', 'advisory'
-- Strategy: DROP existing, re-ADD with all original values PLUS the new ones

ALTER TABLE chairman_decisions
  DROP CONSTRAINT IF EXISTS chairman_decisions_decision_check;

ALTER TABLE chairman_decisions
  ADD CONSTRAINT chairman_decisions_decision_check
  CHECK (decision::text = ANY (ARRAY[
    -- Original values (28)
    'pass', 'revise', 'kill', 'conditional_pass',
    'go', 'conditional_go', 'no_go',
    'complete', 'continue', 'blocked', 'fail',
    'approve', 'conditional', 'reject',
    'release', 'hold', 'cancel',
    'no-go', 'pivot', 'expand', 'sunset', 'exit',
    'proceed', 'fix', 'pause', 'override',
    'pending', 'terminate',
    -- New values (2)
    'review', 'advisory'
  ]::text[]));

-- ============================================================
-- Migration 2: Auto-reset orchestrator_state trigger
-- ============================================================
-- When a chairman_decisions row is updated to status='approved',
-- reset the parent venture's orchestrator_state from 'blocked' to 'idle'
-- so the pipeline can resume processing.

CREATE OR REPLACE FUNCTION trg_chairman_approval_unblock_orchestrator()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    UPDATE ventures
    SET orchestrator_state = 'idle'
    WHERE id = NEW.venture_id
      AND orchestrator_state = 'blocked';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS trg_chairman_decision_unblock ON chairman_decisions;

CREATE TRIGGER trg_chairman_decision_unblock
  AFTER UPDATE ON chairman_decisions
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trg_chairman_approval_unblock_orchestrator();

COMMIT;

-- Rollback SQL (for reference):
--   BEGIN;
--   DROP TRIGGER IF EXISTS trg_chairman_decision_unblock ON chairman_decisions;
--   DROP FUNCTION IF EXISTS trg_chairman_approval_unblock_orchestrator();
--   ALTER TABLE chairman_decisions DROP CONSTRAINT IF EXISTS chairman_decisions_decision_check;
--   ALTER TABLE chairman_decisions ADD CONSTRAINT chairman_decisions_decision_check
--     CHECK (decision::text = ANY (ARRAY[
--       'pass','revise','kill','conditional_pass','go','conditional_go','no_go',
--       'complete','continue','blocked','fail','approve','conditional','reject',
--       'release','hold','cancel','no-go','pivot','expand','sunset','exit',
--       'proceed','fix','pause','override','pending','terminate'
--     ]::text[]));
--   COMMIT;
