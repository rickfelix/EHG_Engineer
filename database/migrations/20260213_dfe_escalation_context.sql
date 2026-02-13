-- Migration: DFE Escalation Context for Chairman Decisions
-- SD: SD-EVA-FEAT-DFE-PRESENTATION-001
-- Purpose: Add dfe_context JSONB column to chairman_decisions for storing
--          DFE engine output (triggers, severity, recommendation, source data)
--          alongside each decision. Enables the EscalationPanel UI.

-- Step 1: Add dfe_context JSONB column
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS dfe_context JSONB;

-- Step 2: Add mitigation_actions JSONB for storing accept/reject per mitigation
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS mitigation_actions JSONB DEFAULT '[]'::jsonb;

-- Step 3: Index for querying decisions that have DFE escalations
CREATE INDEX IF NOT EXISTS idx_chairman_decisions_has_dfe
  ON chairman_decisions ((dfe_context IS NOT NULL))
  WHERE dfe_context IS NOT NULL;

-- Step 4: GIN index on dfe_context for JSONB queries (trigger type filtering)
CREATE INDEX IF NOT EXISTS idx_chairman_decisions_dfe_context_gin
  ON chairman_decisions USING gin (dfe_context jsonb_path_ops)
  WHERE dfe_context IS NOT NULL;

-- Step 5: Comment for documentation
COMMENT ON COLUMN chairman_decisions.dfe_context IS
  'DFE engine output: { auto_proceed: bool, triggers: [{type, severity, message, details}], recommendation: string, evaluated_at: timestamp }';

COMMENT ON COLUMN chairman_decisions.mitigation_actions IS
  'Chairman actions on mitigations: [{ mitigation_id, action: accept|reject, reason, acted_at, idempotency_key }]';
