-- Migration: Add orchestrator state columns to ventures table
-- SD: SD-LEO-INFRA-VENTURE-ARTIFACT-PIPELINE-001
--
-- The Stage Execution Worker needs orchestrator_state, orchestrator_lock_id,
-- and orchestrator_lock_acquired_at to manage processing locks. These columns
-- existed on eva_ventures but not on ventures (the table the UI uses).
-- This migration adds them so the worker can poll ventures directly.

ALTER TABLE ventures
  ADD COLUMN IF NOT EXISTS orchestrator_state TEXT DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS orchestrator_lock_id UUID,
  ADD COLUMN IF NOT EXISTS orchestrator_lock_acquired_at TIMESTAMPTZ;

-- Sync existing eva_ventures orchestrator state to ventures (if any)
UPDATE ventures v
SET
  orchestrator_state = ev.orchestrator_state,
  orchestrator_lock_id = ev.orchestrator_lock_id,
  orchestrator_lock_acquired_at = ev.orchestrator_lock_acquired_at
FROM eva_ventures ev
WHERE v.id = ev.venture_id
  AND ev.orchestrator_state IS NOT NULL;

-- Add index for worker polling query performance
CREATE INDEX IF NOT EXISTS idx_ventures_orchestrator_polling
  ON ventures (status, orchestrator_state, current_lifecycle_stage)
  WHERE status = 'active' AND orchestrator_state = 'idle';
