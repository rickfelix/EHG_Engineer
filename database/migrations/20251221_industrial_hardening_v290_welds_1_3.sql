-- ============================================================================
-- INDUSTRIAL HARDENING v2.9.0 - Missing Welds 1 & 3
--
-- This migration applies only the missing welds from the full v2.9.0 migration:
-- - WELD 1: Memory Partitioning (venture_id in agent_memory_stores)
-- - WELD 3: Identity Locking (idempotent task completion functions)
--
-- WELD 2 already exists (vertical_complexity_multipliers table)
-- ============================================================================

BEGIN;

-- ============================================================================
-- WELD 1: MEMORY PARTITIONING (Pillar 4 - Crew Registry)
-- ============================================================================

-- Add venture_id to agent_memory_stores for memory isolation
ALTER TABLE agent_memory_stores
ADD COLUMN IF NOT EXISTS venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE;

-- Create index for efficient venture-scoped queries
CREATE INDEX IF NOT EXISTS idx_agent_memory_stores_venture
ON agent_memory_stores(venture_id, agent_id, memory_type);

-- Backfill venture_id from agent_registry (agents are linked to ventures)
UPDATE agent_memory_stores ams
SET venture_id = ar.venture_id
FROM agent_registry ar
WHERE ams.agent_id = ar.id
AND ams.venture_id IS NULL;

-- Add constraint: memory MUST be linked to a venture
-- (Deferred - allows existing data to remain until backfilled)
COMMENT ON COLUMN agent_memory_stores.venture_id IS
'INDUSTRIAL-HARDENING-v2.9.0: Venture isolation partition key.
All memory queries MUST filter by venture_id to prevent cross-contamination.
MedSync memory MUST NOT be visible to LogiFlow agents.';

-- ============================================================================
-- WELD 3: IDENTITY LOCKING (LEO Protocol - Concurrency Safety)
-- ============================================================================

-- Add idempotency tracking to agent_task_contracts
ALTER TABLE agent_task_contracts
ADD COLUMN IF NOT EXISTS completion_idempotency_key UUID;

ALTER TABLE agent_task_contracts
ADD COLUMN IF NOT EXISTS completed_by_agent_id UUID;

-- Create unique constraint for idempotent task completion
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_contracts_idempotency
ON agent_task_contracts(id, completion_idempotency_key)
WHERE completion_idempotency_key IS NOT NULL;

-- Idempotent task completion function
CREATE OR REPLACE FUNCTION fn_complete_task_contract_idempotent(
  p_contract_id UUID,
  p_idempotency_key UUID,
  p_output_artifact_id UUID DEFAULT NULL,
  p_result_summary TEXT DEFAULT NULL,
  p_tokens_used INTEGER DEFAULT 0,
  p_agent_id UUID DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  was_duplicate BOOLEAN,
  message TEXT,
  contract_id UUID
) AS $$
DECLARE
  v_existing_key UUID;
  v_current_status VARCHAR;
BEGIN
  -- Check if already completed with this idempotency key
  SELECT completion_idempotency_key, status
  INTO v_existing_key, v_current_status
  FROM agent_task_contracts
  WHERE id = p_contract_id;

  -- If already completed with same key, return idempotent success
  IF v_existing_key = p_idempotency_key THEN
    RETURN QUERY SELECT TRUE, TRUE, 'Already completed (idempotent)'::TEXT, p_contract_id;
    RETURN;
  END IF;

  -- If completed but with different key, reject
  IF v_current_status = 'completed' THEN
    RETURN QUERY SELECT FALSE, FALSE, 'Already completed with different idempotency key'::TEXT, p_contract_id;
    RETURN;
  END IF;

  -- First-time completion: update atomically
  UPDATE agent_task_contracts
  SET
    status = 'completed',
    completed_at = NOW(),
    completion_idempotency_key = p_idempotency_key,
    completed_by_agent_id = p_agent_id,
    output_artifact_id = COALESCE(p_output_artifact_id, output_artifact_id),
    result_summary = COALESCE(p_result_summary, result_summary),
    tokens_used = COALESCE(p_tokens_used, 0),
    updated_at = NOW()
  WHERE id = p_contract_id
  AND status IN ('pending', 'in_progress');

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, FALSE, 'Completed successfully'::TEXT, p_contract_id;
  ELSE
    RETURN QUERY SELECT FALSE, FALSE, 'Contract not found or invalid status'::TEXT, p_contract_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Atomic budget deduction function (prevents overspend race condition)
CREATE OR REPLACE FUNCTION fn_deduct_budget_atomic(
  p_venture_id UUID,
  p_tokens_to_deduct INTEGER,
  p_operation_id UUID DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  budget_remaining INTEGER,
  message TEXT
) AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  -- Atomic update with budget check in WHERE clause
  UPDATE venture_token_budgets
  SET
    budget_remaining = budget_remaining - p_tokens_to_deduct,
    last_operation_id = p_operation_id,
    updated_at = NOW()
  WHERE venture_id = p_venture_id
  AND budget_remaining >= p_tokens_to_deduct
  RETURNING venture_token_budgets.budget_remaining INTO v_remaining;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, v_remaining, 'Budget deducted successfully'::TEXT;
  ELSE
    -- Get current budget for error message
    SELECT vtb.budget_remaining INTO v_remaining
    FROM venture_token_budgets vtb
    WHERE vtb.venture_id = p_venture_id;

    IF v_remaining IS NULL THEN
      RETURN QUERY SELECT FALSE, 0, 'No budget record found for venture'::TEXT;
    ELSE
      RETURN QUERY SELECT FALSE, v_remaining,
        format('Insufficient budget: requested %s, remaining %s', p_tokens_to_deduct, v_remaining)::TEXT;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION COMMENTS
-- ============================================================================

-- Verify memory partitioning
COMMENT ON TABLE agent_memory_stores IS
'INDUSTRIAL-HARDENING-v2.9.0: Memory partition table.
CRITICAL: All queries MUST include venture_id filter.
Example: SELECT * FROM agent_memory_stores WHERE agent_id = ? AND venture_id = ?';

-- Verify identity locking
COMMENT ON FUNCTION fn_complete_task_contract_idempotent IS
'INDUSTRIAL-HARDENING-v2.9.0: Idempotent task completion.
Prevents double-execution and duplicate token charges.
Call with unique idempotency_key per operation.';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these after migration to confirm:

-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'agent_memory_stores' AND column_name = 'venture_id';

-- SELECT proname FROM pg_proc
-- WHERE proname IN ('fn_complete_task_contract_idempotent', 'fn_deduct_budget_atomic');
