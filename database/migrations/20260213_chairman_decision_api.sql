-- Migration: Chairman Decision API + Interactive Review
-- SD: SD-EVA-FEAT-CHAIRMAN-API-001
-- Purpose: Add status workflow to chairman_decisions for interactive review

-- Step 0: Update decision CHECK constraint to include 'pending'
ALTER TABLE chairman_decisions DROP CONSTRAINT IF EXISTS chairman_decisions_decision_check;
ALTER TABLE chairman_decisions ADD CONSTRAINT chairman_decisions_decision_check
  CHECK (decision IN ('proceed', 'pivot', 'fix', 'kill', 'pause', 'override', 'pending'));

-- Step 1: Add status column with default PENDING
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

-- Step 2: Add rationale column for approve/reject reasoning
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS rationale TEXT;

-- Step 3: Add updated_at for tracking status changes
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Step 4: Add summary column for one-line display in list view
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS summary TEXT;

-- Step 5: Add brief_data JSONB for storing the venture brief context
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS brief_data JSONB;

-- Step 6: Partial unique index - only one PENDING decision per venture+stage
CREATE UNIQUE INDEX IF NOT EXISTS idx_chairman_decisions_unique_pending
  ON chairman_decisions (venture_id, lifecycle_stage)
  WHERE status = 'pending';

-- Step 7: Index for status-based queries
CREATE INDEX IF NOT EXISTS idx_chairman_decisions_status
  ON chairman_decisions (status);

-- Step 8: Index for updated_at ordering
CREATE INDEX IF NOT EXISTS idx_chairman_decisions_updated
  ON chairman_decisions (updated_at DESC);

-- Step 9: Trigger to auto-update updated_at on status change
CREATE OR REPLACE FUNCTION update_chairman_decision_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chairman_decision_updated_at ON chairman_decisions;
CREATE TRIGGER trg_chairman_decision_updated_at
  BEFORE UPDATE ON chairman_decisions
  FOR EACH ROW
  EXECUTE FUNCTION update_chairman_decision_updated_at();

-- Step 10: Enable Realtime for chairman_decisions
ALTER PUBLICATION supabase_realtime ADD TABLE chairman_decisions;

-- Step 11: Backfill existing rows to 'approved' (they were auto-decided)
UPDATE chairman_decisions
  SET status = 'approved'
  WHERE status = 'pending'
  AND decision IS NOT NULL
  AND decision != '';
