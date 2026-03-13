-- Migration: Orchestrator Scope Governance (Phase 1)
-- SD: SD-LEO-INFRA-ORCHESTRATOR-SCOPE-GOVERNANCE-001
-- Adds cancellation audit trail columns, scope_authority, and cancellation trigger

-- 1. Add cancellation audit trail columns
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT;

COMMENT ON COLUMN strategic_directives_v2.cancellation_reason IS 'Required reason when SD is cancelled — enforced by trigger';
COMMENT ON COLUMN strategic_directives_v2.cancelled_by IS 'Who cancelled the SD (chairman, lead, system, session_id)';

-- 2. Add scope_authority column
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS scope_authority TEXT;

COMMENT ON COLUMN strategic_directives_v2.scope_authority IS 'Who authorized the current scope (chairman, lead, system)';

-- 3. Create trigger to enforce cancellation_reason on cancel
CREATE OR REPLACE FUNCTION trg_require_cancellation_reason()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when status transitions TO 'cancelled'
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status != 'cancelled') THEN
    IF NEW.cancellation_reason IS NULL OR TRIM(NEW.cancellation_reason) = '' THEN
      RAISE EXCEPTION 'cancellation_reason is required when setting status to cancelled (SD: %)', NEW.sd_key;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to allow re-runs
DROP TRIGGER IF EXISTS trg_require_cancellation_reason ON strategic_directives_v2;

CREATE TRIGGER trg_require_cancellation_reason
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_require_cancellation_reason();
