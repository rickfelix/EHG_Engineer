-- Eva Orchestrator State Machine - Formalized Execution States
-- SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-G
--
-- Adds orchestrator_state column to eva_ventures to prevent concurrent
-- processStage() calls for the same venture via atomic state transitions.

-- Add orchestrator state columns
ALTER TABLE eva_ventures
  ADD COLUMN IF NOT EXISTS orchestrator_state TEXT DEFAULT 'idle'
    CHECK (orchestrator_state IN ('idle', 'processing', 'blocked', 'failed')),
  ADD COLUMN IF NOT EXISTS orchestrator_lock_id UUID,
  ADD COLUMN IF NOT EXISTS orchestrator_lock_acquired_at TIMESTAMPTZ;

-- Index for lock queries (find ventures in processing state)
CREATE INDEX IF NOT EXISTS idx_eva_ventures_orchestrator_state
  ON eva_ventures(orchestrator_state)
  WHERE orchestrator_state = 'processing';

-- Partial index for lock safety (ensure only one lock per venture)
CREATE UNIQUE INDEX IF NOT EXISTS idx_eva_ventures_orchestrator_lock
  ON eva_ventures(id)
  WHERE orchestrator_lock_id IS NOT NULL;

COMMENT ON COLUMN eva_ventures.orchestrator_state IS 'Current execution state: idle, processing, blocked, failed';
COMMENT ON COLUMN eva_ventures.orchestrator_lock_id IS 'UUID of the processing lock holder (null when idle)';
COMMENT ON COLUMN eva_ventures.orchestrator_lock_acquired_at IS 'When the processing lock was acquired';
