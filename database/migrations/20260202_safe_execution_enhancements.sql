-- ============================================================
-- SD-LEO-SELF-IMPROVE-002D: Phase 4 - Safe Execution Enhancements
-- ============================================================
-- Implements CHANGE primitive safety with dry-run preview and 72h rollback
-- Version: 1.0.0
-- ============================================================

-- ============================================================
-- SECTION 1: DRY-RUN PREVIEW COLUMNS (FR-1)
-- ============================================================
-- Add columns for storing structured diff preview and timestamp

ALTER TABLE protocol_improvement_queue
  ADD COLUMN IF NOT EXISTS dry_run_diff JSONB,
  ADD COLUMN IF NOT EXISTS dry_run_at TIMESTAMPTZ;

COMMENT ON COLUMN protocol_improvement_queue.dry_run_diff IS
  'Structured diff preview showing exact changes before application. Required before status=APPLIED.';
COMMENT ON COLUMN protocol_improvement_queue.dry_run_at IS
  'Timestamp when dry-run preview was generated. Must be set before applying change.';

-- ============================================================
-- SECTION 2: ROLLBACK COLUMNS (FR-2)
-- ============================================================
-- Add columns for rollback control and audit trail

ALTER TABLE protocol_improvement_queue
  ADD COLUMN IF NOT EXISTS rollback_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rollback_window_hours INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS rollback_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rolled_back_by VARCHAR,
  ADD COLUMN IF NOT EXISTS rollback_reason TEXT;

-- Constrain rollback window to reasonable range (1-720 hours = 1 hour to 30 days)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'protocol_improvement_queue_rollback_window_check'
  ) THEN
    ALTER TABLE protocol_improvement_queue
      ADD CONSTRAINT protocol_improvement_queue_rollback_window_check
      CHECK (rollback_window_hours >= 1 AND rollback_window_hours <= 720);
  END IF;
END $$;

COMMENT ON COLUMN protocol_improvement_queue.rollback_eligible IS
  'Whether this improvement can be rolled back. Defaults to TRUE.';
COMMENT ON COLUMN protocol_improvement_queue.rollback_window_hours IS
  'Number of hours after creation that rollback is allowed. Default 72h. Range: 1-720.';
COMMENT ON COLUMN protocol_improvement_queue.rollback_expires_at IS
  'Auto-calculated timestamp when rollback eligibility expires. Set by trigger.';
COMMENT ON COLUMN protocol_improvement_queue.rolled_back_at IS
  'Timestamp when improvement was rolled back. NULL if not rolled back.';
COMMENT ON COLUMN protocol_improvement_queue.rolled_back_by IS
  'Identifier of who/what initiated the rollback. Required when rolling back.';
COMMENT ON COLUMN protocol_improvement_queue.rollback_reason IS
  'Explanation for why the improvement was rolled back. Required when rolling back.';

-- ============================================================
-- SECTION 3: SET_ROLLBACK_EXPIRY TRIGGER (FR-3)
-- ============================================================
-- Auto-calculate rollback_expires_at based on rollback_window_hours

CREATE OR REPLACE FUNCTION fn_set_rollback_expiry()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set if rollback_expires_at is NULL and row is not yet applied
  -- (prevents extending rollback window after application)
  IF NEW.rollback_expires_at IS NULL AND (NEW.status IS NULL OR NEW.status != 'APPLIED') THEN
    NEW.rollback_expires_at := COALESCE(NEW.created_at, NOW()) + (NEW.rollback_window_hours || ' hours')::interval;
  END IF;

  -- On UPDATE: recalculate if window_hours changed and not yet applied
  IF TG_OP = 'UPDATE' THEN
    IF OLD.rollback_window_hours != NEW.rollback_window_hours
       AND (NEW.status IS NULL OR NEW.status != 'APPLIED') THEN
      NEW.rollback_expires_at := COALESCE(NEW.created_at, NOW()) + (NEW.rollback_window_hours || ' hours')::interval;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger to ensure clean state
DROP TRIGGER IF EXISTS trg_set_rollback_expiry ON protocol_improvement_queue;

CREATE TRIGGER trg_set_rollback_expiry
  BEFORE INSERT OR UPDATE ON protocol_improvement_queue
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_rollback_expiry();

COMMENT ON FUNCTION fn_set_rollback_expiry() IS
  'Auto-calculates rollback_expires_at = created_at + rollback_window_hours. Does not modify after APPLIED status.';

-- ============================================================
-- SECTION 4: CHANGE WORKFLOW SAFETY ENFORCEMENT (FR-4)
-- ============================================================
-- Enforce: dry-run required before APPLY, rollback audit required

CREATE OR REPLACE FUNCTION fn_enforce_change_workflow()
RETURNS TRIGGER AS $$
BEGIN
  -- Rule 1: Cannot transition to APPLIED without dry-run preview
  IF NEW.status = 'APPLIED' AND (OLD.status IS NULL OR OLD.status != 'APPLIED') THEN
    IF NEW.dry_run_diff IS NULL OR NEW.dry_run_at IS NULL THEN
      RAISE EXCEPTION 'CHANGE_WORKFLOW_VIOLATION: Cannot apply improvement without dry-run preview. Set dry_run_diff and dry_run_at first.';
    END IF;
  END IF;

  -- Rule 2: Rollback audit must be complete and valid
  IF NEW.rolled_back_at IS NOT NULL AND OLD.rolled_back_at IS NULL THEN
    -- Must be APPLIED to rollback
    IF OLD.status != 'APPLIED' THEN
      RAISE EXCEPTION 'CHANGE_WORKFLOW_VIOLATION: Cannot rollback improvement that is not APPLIED. Current status: %', OLD.status;
    END IF;

    -- Must pass eligibility check
    IF NOT (
      OLD.rollback_eligible = TRUE
      AND OLD.rolled_back_at IS NULL
      AND OLD.rollback_expires_at IS NOT NULL
      AND NOW() <= OLD.rollback_expires_at
    ) THEN
      RAISE EXCEPTION 'CHANGE_WORKFLOW_VIOLATION: Rollback not allowed. Check rollback_eligible, rollback_expires_at, and prior rollback state.';
    END IF;

    -- Audit fields must be complete
    IF NEW.rolled_back_by IS NULL OR LENGTH(TRIM(NEW.rolled_back_by)) = 0 THEN
      RAISE EXCEPTION 'CHANGE_WORKFLOW_VIOLATION: rolled_back_by is required when rolling back.';
    END IF;

    IF NEW.rollback_reason IS NULL OR LENGTH(TRIM(NEW.rollback_reason)) = 0 THEN
      RAISE EXCEPTION 'CHANGE_WORKFLOW_VIOLATION: rollback_reason is required when rolling back.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_enforce_change_workflow ON protocol_improvement_queue;

CREATE TRIGGER trg_enforce_change_workflow
  BEFORE UPDATE ON protocol_improvement_queue
  FOR EACH ROW
  EXECUTE FUNCTION fn_enforce_change_workflow();

COMMENT ON FUNCTION fn_enforce_change_workflow() IS
  'Enforces CHANGE workflow invariants: dry-run required before APPLY, rollback audit required with proper fields.';

-- ============================================================
-- SECTION 5: CAN_ROLLBACK FUNCTION (FR-5)
-- ============================================================
-- Authoritative function for determining rollback eligibility

CREATE OR REPLACE FUNCTION can_rollback(p_queue_row_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_record RECORD;
BEGIN
  -- Get the record
  SELECT status, rollback_eligible, rolled_back_at, rollback_expires_at
  INTO v_record
  FROM protocol_improvement_queue
  WHERE id = p_queue_row_id;

  -- Row doesn't exist
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Check all eligibility conditions
  RETURN (
    v_record.status = 'APPLIED'
    AND v_record.rollback_eligible = TRUE
    AND v_record.rolled_back_at IS NULL
    AND v_record.rollback_expires_at IS NOT NULL
    AND NOW() <= v_record.rollback_expires_at
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION can_rollback(UUID) IS
  'Returns TRUE if improvement can be rolled back: must be APPLIED, rollback_eligible=TRUE, not already rolled back, within rollback window.';

-- ============================================================
-- SECTION 6: OPERATIONAL INDICES AND VISIBILITY (FR-6)
-- ============================================================
-- Index for efficiently finding improvements nearing rollback expiry

CREATE INDEX IF NOT EXISTS idx_protocol_improvement_rollback_expiry
  ON protocol_improvement_queue (status, rolled_back_at, rollback_expires_at)
  WHERE status = 'APPLIED' AND rolled_back_at IS NULL;

COMMENT ON INDEX idx_protocol_improvement_rollback_expiry IS
  'Supports efficient queries for APPLIED improvements nearing rollback expiry.';

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Verify columns exist
DO $$
DECLARE
  missing_columns TEXT[];
  col_name TEXT;
BEGIN
  missing_columns := ARRAY[]::TEXT[];

  FOR col_name IN
    SELECT unnest(ARRAY['dry_run_diff', 'dry_run_at', 'rollback_eligible',
                        'rollback_window_hours', 'rollback_expires_at',
                        'rolled_back_at', 'rolled_back_by', 'rollback_reason'])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'protocol_improvement_queue' AND column_name = col_name
    ) THEN
      missing_columns := missing_columns || col_name;
    END IF;
  END LOOP;

  IF array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Migration verification failed. Missing columns: %', array_to_string(missing_columns, ', ');
  ELSE
    RAISE NOTICE 'Migration verification passed. All columns present.';
  END IF;
END $$;

-- Verify functions exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_set_rollback_expiry') THEN
    RAISE EXCEPTION 'Migration verification failed. Missing function: fn_set_rollback_expiry';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_enforce_change_workflow') THEN
    RAISE EXCEPTION 'Migration verification failed. Missing function: fn_enforce_change_workflow';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_rollback') THEN
    RAISE EXCEPTION 'Migration verification failed. Missing function: can_rollback';
  END IF;

  RAISE NOTICE 'Migration verification passed. All functions present.';
END $$;

-- ============================================================
-- END OF MIGRATION
-- ============================================================
