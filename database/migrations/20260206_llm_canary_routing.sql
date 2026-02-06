-- Migration: LLM Canary Routing Infrastructure
-- SD: SD-LEO-INFRA-INTELLIGENT-LOCAL-LLM-001C
-- Description: Database tables for canary rollout state, metrics, and audit trail
-- Created: 2026-02-06

-- =============================================================================
-- Table: llm_canary_state
-- Persists the current canary rollout state for LLM traffic splitting
-- =============================================================================
CREATE TABLE IF NOT EXISTS llm_canary_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Canary stage: 0 = all cloud, 5 = 5% local, 25 = 25% local, 50 = 50% local, 100 = all local
  stage INTEGER NOT NULL DEFAULT 0 CHECK (stage IN (0, 5, 25, 50, 100)),

  -- Rollout status
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('rolling', 'paused', 'rolled_back', 'complete')),

  -- Target model being rolled out
  target_model TEXT NOT NULL DEFAULT 'qwen3-coder:30b',

  -- Fallback model (cloud)
  fallback_model TEXT NOT NULL DEFAULT 'claude-haiku-3-5-20241022',

  -- Quality gate thresholds
  error_rate_threshold DECIMAL(5,4) NOT NULL DEFAULT 0.05, -- 5%
  latency_multiplier_threshold DECIMAL(3,1) NOT NULL DEFAULT 2.0, -- 2x baseline

  -- Baseline metrics (captured before rollout)
  baseline_latency_p95_ms INTEGER,
  baseline_error_rate DECIMAL(5,4),

  -- Current metrics (updated by quality checks)
  current_latency_p95_ms INTEGER,
  current_error_rate DECIMAL(5,4),

  -- Consecutive failures counter (for quality gate)
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  failures_before_rollback INTEGER NOT NULL DEFAULT 3,

  -- Timestamps
  stage_changed_at TIMESTAMPTZ DEFAULT NOW(),
  last_quality_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Actor tracking
  changed_by TEXT DEFAULT 'system'
);

-- Only one active canary state row
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_canary_state_singleton
ON llm_canary_state ((true));

-- =============================================================================
-- Table: llm_canary_transitions
-- Audit trail for all canary stage transitions
-- =============================================================================
CREATE TABLE IF NOT EXISTS llm_canary_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- State reference
  canary_state_id UUID REFERENCES llm_canary_state(id),

  -- Transition details
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  reason TEXT NOT NULL, -- 'manual', 'auto_advance', 'quality_gate_rollback', 'api_request'

  -- Metrics at transition time
  error_rate_at_transition DECIMAL(5,4),
  latency_p95_at_transition INTEGER,
  requests_since_last_stage INTEGER,

  -- Actor
  triggered_by TEXT NOT NULL DEFAULT 'system',

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_canary_transitions_state
ON llm_canary_transitions(canary_state_id);

CREATE INDEX IF NOT EXISTS idx_llm_canary_transitions_time
ON llm_canary_transitions(created_at DESC);

-- =============================================================================
-- Table: llm_canary_metrics
-- Rolling window of metrics for quality gate evaluation
-- =============================================================================
CREATE TABLE IF NOT EXISTS llm_canary_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request details
  request_id TEXT NOT NULL,
  tier TEXT NOT NULL, -- 'haiku', 'sonnet', 'opus'

  -- Routing decision
  routed_to TEXT NOT NULL CHECK (routed_to IN ('local', 'cloud', 'fallback')),
  model_used TEXT NOT NULL,

  -- Metrics
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  error_type TEXT, -- null if success, otherwise error category

  -- Canary context
  canary_stage INTEGER NOT NULL,
  bucket_id INTEGER NOT NULL, -- 0-9999 for deterministic routing

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for recent metrics queries (quality gate checks)
CREATE INDEX IF NOT EXISTS idx_llm_canary_metrics_recent
ON llm_canary_metrics(created_at DESC);

-- Index for per-tier analysis
CREATE INDEX IF NOT EXISTS idx_llm_canary_metrics_tier
ON llm_canary_metrics(tier, created_at DESC);

-- Partition hint: Consider partitioning by time for high-volume deployments
COMMENT ON TABLE llm_canary_metrics IS 'Rolling window metrics. Consider BRIN index or partitioning for high volume.';

-- =============================================================================
-- Function: get_canary_state()
-- Returns current canary state (singleton pattern)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_canary_state()
RETURNS llm_canary_state AS $$
DECLARE
  state llm_canary_state;
BEGIN
  SELECT * INTO state FROM llm_canary_state LIMIT 1;

  -- Create default state if none exists
  IF state IS NULL THEN
    INSERT INTO llm_canary_state (stage, status)
    VALUES (0, 'paused')
    RETURNING * INTO state;
  END IF;

  RETURN state;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: advance_canary_stage()
-- Advances to next stage if quality gates pass
-- =============================================================================
CREATE OR REPLACE FUNCTION advance_canary_stage(
  p_triggered_by TEXT DEFAULT 'system',
  p_reason TEXT DEFAULT 'auto_advance'
)
RETURNS TABLE (
  success BOOLEAN,
  new_stage INTEGER,
  message TEXT
) AS $$
DECLARE
  current_state llm_canary_state;
  next_stage INTEGER;
BEGIN
  -- Get current state
  SELECT * INTO current_state FROM llm_canary_state LIMIT 1;

  IF current_state IS NULL THEN
    RETURN QUERY SELECT false, 0, 'No canary state found';
    RETURN;
  END IF;

  -- Check if paused or rolled back
  IF current_state.status IN ('paused', 'rolled_back') THEN
    RETURN QUERY SELECT false, current_state.stage, 'Canary is ' || current_state.status;
    RETURN;
  END IF;

  -- Determine next stage
  next_stage := CASE current_state.stage
    WHEN 0 THEN 5
    WHEN 5 THEN 25
    WHEN 25 THEN 50
    WHEN 50 THEN 100
    WHEN 100 THEN 100 -- Already complete
    ELSE current_state.stage
  END;

  -- If already at 100, mark complete
  IF current_state.stage = 100 THEN
    UPDATE llm_canary_state SET status = 'complete', updated_at = NOW();
    RETURN QUERY SELECT true, 100, 'Rollout already complete';
    RETURN;
  END IF;

  -- Record transition
  INSERT INTO llm_canary_transitions (
    canary_state_id, from_stage, to_stage, reason, triggered_by
  ) VALUES (
    current_state.id, current_state.stage, next_stage, p_reason, p_triggered_by
  );

  -- Update state
  UPDATE llm_canary_state SET
    stage = next_stage,
    status = CASE WHEN next_stage = 100 THEN 'complete' ELSE 'rolling' END,
    stage_changed_at = NOW(),
    consecutive_failures = 0,
    updated_at = NOW(),
    changed_by = p_triggered_by;

  RETURN QUERY SELECT true, next_stage, 'Advanced to ' || next_stage || '%';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: rollback_canary()
-- Emergency rollback to 0% (all cloud)
-- =============================================================================
CREATE OR REPLACE FUNCTION rollback_canary(
  p_triggered_by TEXT DEFAULT 'system',
  p_reason TEXT DEFAULT 'quality_gate_rollback'
)
RETURNS TABLE (
  success BOOLEAN,
  previous_stage INTEGER,
  message TEXT
) AS $$
DECLARE
  current_state llm_canary_state;
BEGIN
  -- Get current state
  SELECT * INTO current_state FROM llm_canary_state LIMIT 1;

  IF current_state IS NULL THEN
    RETURN QUERY SELECT false, 0, 'No canary state found';
    RETURN;
  END IF;

  -- Record transition
  INSERT INTO llm_canary_transitions (
    canary_state_id, from_stage, to_stage, reason,
    error_rate_at_transition, latency_p95_at_transition, triggered_by
  ) VALUES (
    current_state.id, current_state.stage, 0, p_reason,
    current_state.current_error_rate, current_state.current_latency_p95_ms, p_triggered_by
  );

  -- Update state to rolled back
  UPDATE llm_canary_state SET
    stage = 0,
    status = 'rolled_back',
    stage_changed_at = NOW(),
    updated_at = NOW(),
    changed_by = p_triggered_by;

  RETURN QUERY SELECT true, current_state.stage, 'Rolled back from ' || current_state.stage || '% to 0%';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: set_canary_stage()
-- Manually set canary stage (for operational control)
-- =============================================================================
CREATE OR REPLACE FUNCTION set_canary_stage(
  p_stage INTEGER,
  p_triggered_by TEXT DEFAULT 'api'
)
RETURNS TABLE (
  success BOOLEAN,
  new_stage INTEGER,
  message TEXT
) AS $$
DECLARE
  current_state llm_canary_state;
BEGIN
  -- Validate stage
  IF p_stage NOT IN (0, 5, 25, 50, 100) THEN
    RETURN QUERY SELECT false, -1, 'Invalid stage. Must be 0, 5, 25, 50, or 100';
    RETURN;
  END IF;

  -- Get current state
  SELECT * INTO current_state FROM llm_canary_state LIMIT 1;

  IF current_state IS NULL THEN
    -- Create initial state
    INSERT INTO llm_canary_state (stage, status, changed_by)
    VALUES (p_stage, CASE WHEN p_stage = 100 THEN 'complete' ELSE 'rolling' END, p_triggered_by);
    RETURN QUERY SELECT true, p_stage, 'Created canary state at ' || p_stage || '%';
    RETURN;
  END IF;

  -- Record transition
  INSERT INTO llm_canary_transitions (
    canary_state_id, from_stage, to_stage, reason, triggered_by
  ) VALUES (
    current_state.id, current_state.stage, p_stage, 'manual_set', p_triggered_by
  );

  -- Update state
  UPDATE llm_canary_state SET
    stage = p_stage,
    status = CASE
      WHEN p_stage = 0 THEN 'paused'
      WHEN p_stage = 100 THEN 'complete'
      ELSE 'rolling'
    END,
    stage_changed_at = NOW(),
    consecutive_failures = 0,
    updated_at = NOW(),
    changed_by = p_triggered_by;

  RETURN QUERY SELECT true, p_stage, 'Set canary stage to ' || p_stage || '%';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Function: pause_canary() / resume_canary()
-- Operational pause/resume controls
-- =============================================================================
CREATE OR REPLACE FUNCTION pause_canary(p_triggered_by TEXT DEFAULT 'api')
RETURNS TEXT AS $$
BEGIN
  UPDATE llm_canary_state SET
    status = 'paused',
    updated_at = NOW(),
    changed_by = p_triggered_by;
  RETURN 'Canary paused';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION resume_canary(p_triggered_by TEXT DEFAULT 'api')
RETURNS TEXT AS $$
DECLARE
  current_stage INTEGER;
BEGIN
  SELECT stage INTO current_stage FROM llm_canary_state LIMIT 1;

  UPDATE llm_canary_state SET
    status = CASE WHEN current_stage = 100 THEN 'complete' ELSE 'rolling' END,
    updated_at = NOW(),
    changed_by = p_triggered_by;
  RETURN 'Canary resumed at ' || COALESCE(current_stage, 0) || '%';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Insert default canary state
-- =============================================================================
INSERT INTO llm_canary_state (stage, status, target_model, fallback_model)
VALUES (0, 'paused', 'qwen3-coder:30b', 'claude-haiku-3-5-20241022')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Permissions
-- =============================================================================
GRANT SELECT ON llm_canary_state TO authenticated;
GRANT SELECT ON llm_canary_transitions TO authenticated;
GRANT SELECT ON llm_canary_metrics TO authenticated;

-- Service role can manage canary state
GRANT ALL ON llm_canary_state TO service_role;
GRANT ALL ON llm_canary_transitions TO service_role;
GRANT ALL ON llm_canary_metrics TO service_role;

-- RPC functions
GRANT EXECUTE ON FUNCTION get_canary_state() TO authenticated;
GRANT EXECUTE ON FUNCTION advance_canary_stage(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION rollback_canary(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION set_canary_stage(INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION pause_canary(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION resume_canary(TEXT) TO service_role;
