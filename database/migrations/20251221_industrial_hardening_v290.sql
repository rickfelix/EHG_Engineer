-- ============================================================================
-- INDUSTRIAL HARDENING v2.9.0 - Venture Isolation Layer
--
-- SD Authority: SD-PARENT-4.0 (Swarm Genesis)
-- Purpose: Prevent cross-venture memory contamination and implement Truth Normalization
--
-- Three Industrial Welds:
-- 1. Memory Partitioning (P4) - Add venture_id to agent_memory_stores
-- 2. Truth Normalization (P6) - Vertical complexity multipliers
-- 3. Identity Locking (LEO) - Idempotency for task completion
-- ============================================================================

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
-- WELD 2: TRUTH NORMALIZATION (Pillar 6 - Truth Layer)
-- ============================================================================

-- Create vertical complexity multipliers table
CREATE TABLE IF NOT EXISTS vertical_complexity_multipliers (
  vertical_category VARCHAR(50) PRIMARY KEY,
  complexity_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  risk_adjustment_factor NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  min_market_validation_confidence NUMERIC(4,2) NOT NULL DEFAULT 0.70,
  health_threshold_green NUMERIC(4,2) NOT NULL DEFAULT 0.75,
  health_threshold_yellow NUMERIC(4,2) NOT NULL DEFAULT 0.50,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed vertical complexity data
INSERT INTO vertical_complexity_multipliers
(vertical_category, complexity_multiplier, risk_adjustment_factor, min_market_validation_confidence, health_threshold_green, health_threshold_yellow, description)
VALUES
  ('healthcare', 1.5, 1.8, 0.95, 0.90, 0.70, 'Highest complexity: Patient safety, regulatory compliance, clinical validation'),
  ('fintech', 1.3, 1.6, 0.90, 0.85, 0.65, 'High complexity: Regulatory, fraud prevention, financial risk'),
  ('edtech', 1.2, 1.3, 0.75, 0.75, 0.50, 'Moderate complexity: User engagement variance is normal'),
  ('logistics', 1.0, 1.1, 0.70, 0.75, 0.50, 'Baseline complexity: Operational efficiency focus'),
  ('other', 1.0, 1.0, 0.70, 0.75, 0.50, 'Default baseline for unclassified verticals')
ON CONFLICT (vertical_category) DO UPDATE SET
  complexity_multiplier = EXCLUDED.complexity_multiplier,
  risk_adjustment_factor = EXCLUDED.risk_adjustment_factor,
  min_market_validation_confidence = EXCLUDED.min_market_validation_confidence,
  health_threshold_green = EXCLUDED.health_threshold_green,
  health_threshold_yellow = EXCLUDED.health_threshold_yellow,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Add vertical_category to ventures table
ALTER TABLE ventures
ADD COLUMN IF NOT EXISTS vertical_category VARCHAR(50)
  REFERENCES vertical_complexity_multipliers(vertical_category);

-- Add normalized calibration columns to venture_stage_work
ALTER TABLE venture_stage_work
ADD COLUMN IF NOT EXISTS calibration_delta_raw NUMERIC(4,2);

ALTER TABLE venture_stage_work
ADD COLUMN IF NOT EXISTS calibration_delta_normalized NUMERIC(4,2);

ALTER TABLE venture_stage_work
ADD COLUMN IF NOT EXISTS vertical_category VARCHAR(50);

-- Update Genesis Spark ventures with their vertical categories
UPDATE ventures SET vertical_category = 'healthcare'
WHERE id = '22222222-2222-2222-2222-222222222222'; -- MedSync

UPDATE ventures SET vertical_category = 'fintech'
WHERE id = '33333333-3333-3333-3333-333333333333'; -- FinTrack

UPDATE ventures SET vertical_category = 'edtech'
WHERE id = '44444444-4444-4444-4444-444444444444'; -- EduPath

UPDATE ventures SET vertical_category = 'logistics'
WHERE id = '55555555-5555-5555-5555-555555555555'; -- LogiFlow

-- Function to normalize calibration delta by vertical complexity
CREATE OR REPLACE FUNCTION fn_normalize_calibration_delta(
  p_raw_delta NUMERIC,
  p_vertical_category VARCHAR
) RETURNS NUMERIC AS $$
DECLARE
  v_multiplier NUMERIC;
BEGIN
  -- Get complexity multiplier for vertical
  SELECT complexity_multiplier INTO v_multiplier
  FROM vertical_complexity_multipliers
  WHERE vertical_category = COALESCE(p_vertical_category, 'other');

  IF v_multiplier IS NULL THEN
    v_multiplier := 1.0;
  END IF;

  -- Normalize: raw delta divided by complexity (higher complexity = more lenient)
  -- E.g., 0.22 in healthcare (1.5x) becomes 0.22/1.5 = 0.147 (more severe)
  -- Wait, we want opposite: 0.22 in healthcare should be WORSE than 0.22 in logistics
  -- So we MULTIPLY by complexity: 0.22 * 1.5 = 0.33 delta (worse)
  RETURN p_raw_delta * v_multiplier;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to determine health status based on normalized delta and vertical
CREATE OR REPLACE FUNCTION fn_determine_health_status(
  p_normalized_delta NUMERIC,
  p_vertical_category VARCHAR
) RETURNS VARCHAR AS $$
DECLARE
  v_green_threshold NUMERIC;
  v_yellow_threshold NUMERIC;
BEGIN
  -- Get vertical-specific thresholds
  SELECT health_threshold_green, health_threshold_yellow
  INTO v_green_threshold, v_yellow_threshold
  FROM vertical_complexity_multipliers
  WHERE vertical_category = COALESCE(p_vertical_category, 'other');

  -- Default thresholds
  IF v_green_threshold IS NULL THEN
    v_green_threshold := 0.75;
    v_yellow_threshold := 0.50;
  END IF;

  -- Delta is an error measure: lower is better
  -- Convert to accuracy: 1 - delta
  IF (1 - p_normalized_delta) >= v_green_threshold THEN
    RETURN 'green';
  ELSIF (1 - p_normalized_delta) >= v_yellow_threshold THEN
    RETURN 'yellow';
  ELSE
    RETURN 'red';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

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
-- VERIFICATION QUERIES (Run after migration to confirm welds)
-- ============================================================================

-- Verify memory partitioning
COMMENT ON TABLE agent_memory_stores IS
'INDUSTRIAL-HARDENING-v2.9.0: Memory partition table.
CRITICAL: All queries MUST include venture_id filter.
Example: SELECT * FROM agent_memory_stores WHERE agent_id = ? AND venture_id = ?';

-- Verify truth normalization
COMMENT ON TABLE vertical_complexity_multipliers IS
'INDUSTRIAL-HARDENING-v2.9.0: Truth normalization layer.
Maps verticals to complexity multipliers for calibration delta adjustment.
Healthcare (1.5x) > FinTech (1.3x) > EdTech (1.2x) > Logistics (1.0x)';

-- Verify identity locking
COMMENT ON FUNCTION fn_complete_task_contract_idempotent IS
'INDUSTRIAL-HARDENING-v2.9.0: Idempotent task completion.
Prevents double-execution and duplicate token charges.
Call with unique idempotency_key per operation.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Update lib/agents/venture-ceo-runtime.js to include venture_id in memory ops
-- 2. Create lib/governance/portfolio-calibrator.js for EVA:CALIBRATOR
-- 3. Run pre-flight audit to verify isolation
