-- Migration: Fix model_usage_log phase check constraint
-- Issue: QF-20260425-002 - model_usage_log_phase_check rejects QF_COMPLETION
-- RCA: Constraint allows only ('LEAD','PLAN','EXEC','UNKNOWN'), but database-agent
--      and other agent partials are invoked from completion/handoff paths and
--      self-substitute "PHASE" with values like 'QF_COMPLETION', 'SD_COMPLETION',
--      'HANDOFF', and 'STANDALONE' (per agent template fallback). Inserts are
--      caught downstream as non-fatal, so the routing-verification ledger silently
--      loses rows.
-- Solution: Expand allowlist to include the documented agent-emitted phase values
--           plus the standard LEO sub-phase variants used elsewhere in the schema.

-- Step 1: Drop the existing constraint
ALTER TABLE model_usage_log
DROP CONSTRAINT IF EXISTS model_usage_log_phase_check;

-- Step 2: Re-add with expanded allowlist
ALTER TABLE model_usage_log
ADD CONSTRAINT model_usage_log_phase_check
CHECK (phase IN (
  -- Standard LEO phases (original)
  'LEAD',
  'PLAN',
  'EXEC',
  'UNKNOWN',
  -- Agent-template fallback (per .claude/agents/*.partial line 18)
  'STANDALONE',
  -- Completion paths (the documented offenders)
  'QF_COMPLETION',
  'SD_COMPLETION',
  'HANDOFF',
  'COMPLETE',
  -- LEO sub-phase variants used by sibling tables
  'LEAD_APPROVAL',
  'LEAD_FINAL_APPROVAL',
  'PLAN_DESIGN',
  'PLAN_VERIFY',
  'EXEC_IMPLEMENTATION'
));

-- Add comment documenting the change
COMMENT ON CONSTRAINT model_usage_log_phase_check ON model_usage_log IS
'Valid phase values for model usage tracking. Expanded 2026-04-26 per QF-20260425-002 to accept completion/handoff phases (QF_COMPLETION, SD_COMPLETION, HANDOFF) and standard LEO sub-phase variants. Original allowlist was LEAD/PLAN/EXEC/UNKNOWN only.';

-- Verification query (run after migration to confirm)
-- SELECT DISTINCT phase FROM model_usage_log;
