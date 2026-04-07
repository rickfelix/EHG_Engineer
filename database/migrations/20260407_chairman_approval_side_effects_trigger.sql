-- Migration: Chairman Approval Side-Effects Atomicity
-- SD: SD-CHAIRMAN-APPROVAL-SIDEEFFECTS-ATOMICITY-ORCH-001-A
-- Purpose: Eliminate race condition between UI chairman approval and worker polling.
--          Trigger fires side-effects atomically within the approval transaction.
-- Referenced by: stage-execution-worker.js (guard before processStage)

-- Table: chairman_decision_audit
-- Append-only audit trail of side-effects applied by the chairman approval trigger.
CREATE TABLE IF NOT EXISTS chairman_decision_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES chairman_decisions(id) ON DELETE CASCADE,
  venture_id UUID NOT NULL,
  lifecycle_stage INTEGER NOT NULL,
  effect_type TEXT NOT NULL CHECK (effect_type IN ('vision_unarchive', 'artifact_dedup_skip')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by TEXT NOT NULL DEFAULT 'trigger',
  CONSTRAINT uq_decision_effect UNIQUE (decision_id, effect_type)
);

-- Index for fast worker lookups: query by (venture_id, lifecycle_stage)
CREATE INDEX IF NOT EXISTS idx_chairman_audit_venture_stage
  ON chairman_decision_audit(venture_id, lifecycle_stage);

-- Trigger function: on_chairman_approval_side_effects
-- Fires BEFORE UPDATE on chairman_decisions when status transitions to 'approved'
-- for kill gate stages (3, 5). Un-archives vision documents and records audit row.
CREATE OR REPLACE FUNCTION on_chairman_approval_side_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- Only fire on status transition to 'approved'
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    -- Stage-number guard: only fire for kill gate stages
    IF NEW.lifecycle_stage IN (3, 5) THEN
      -- Un-archive vision documents for this venture
      UPDATE eva_vision_documents
      SET status = 'active', updated_at = NOW()
      WHERE venture_id = NEW.venture_id
        AND status = 'archived';

      -- Record the side-effect in the audit table (idempotent)
      INSERT INTO chairman_decision_audit (decision_id, venture_id, lifecycle_stage, effect_type)
      VALUES (NEW.id, NEW.venture_id, NEW.lifecycle_stage, 'vision_unarchive')
      ON CONFLICT (decision_id, effect_type) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to chairman_decisions table
CREATE TRIGGER trg_chairman_approval_side_effects
  BEFORE UPDATE ON chairman_decisions
  FOR EACH ROW
  EXECUTE FUNCTION on_chairman_approval_side_effects();

-- Rollback:
-- DROP TRIGGER IF EXISTS trg_chairman_approval_side_effects ON chairman_decisions;
-- DROP FUNCTION IF EXISTS on_chairman_approval_side_effects();
-- DROP TABLE IF EXISTS chairman_decision_audit;
