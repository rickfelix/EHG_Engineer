-- Migration: Continuous LEO Protocol Execution
-- Purpose: Support fully autonomous SD execution with audit trail
-- Author: Claude (Continuous LEO Implementation)
-- Date: 2026-01-04

-- ============================================================================
-- 1. CONTINUOUS EXECUTION LOG
-- ============================================================================
-- Tracks all SD executions in continuous mode

CREATE TABLE IF NOT EXISTS continuous_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  parent_sd_id TEXT REFERENCES strategic_directives_v2(id),
  child_sd_id TEXT REFERENCES strategic_directives_v2(id),
  phase TEXT NOT NULL CHECK (phase IN ('LEAD', 'PLAN', 'EXEC', 'COMPLETE')),
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'skipped', 'retrying')),
  error_message TEXT,
  retry_attempted BOOLEAN DEFAULT FALSE,
  retry_succeeded BOOLEAN,
  duration_seconds INT,
  explorer_agents_used INT DEFAULT 0,
  root_cause_identified TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by session and parent SD
CREATE INDEX IF NOT EXISTS idx_continuous_execution_session ON continuous_execution_log(session_id);
CREATE INDEX IF NOT EXISTS idx_continuous_execution_parent ON continuous_execution_log(parent_sd_id);
CREATE INDEX IF NOT EXISTS idx_continuous_execution_status ON continuous_execution_log(status);
CREATE INDEX IF NOT EXISTS idx_continuous_execution_created ON continuous_execution_log(created_at DESC);

-- ============================================================================
-- 2. CHECKPOINT HISTORY
-- ============================================================================
-- Records checkpoint validations at each phase transition

CREATE TABLE IF NOT EXISTS sd_checkpoint_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT REFERENCES strategic_directives_v2(id),
  phase TEXT NOT NULL,
  transition TEXT, -- e.g., 'LEAD-TO-PLAN', 'PLAN-TO-EXEC'
  validation_passed BOOLEAN NOT NULL,
  protocol_version TEXT,
  claude_md_hash TEXT, -- Hash of CLAUDE.md at checkpoint time
  validation_details JSONB, -- Detailed validation results
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying checkpoints by SD
CREATE INDEX IF NOT EXISTS idx_checkpoint_sd ON sd_checkpoint_history(sd_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_created ON sd_checkpoint_history(created_at DESC);

-- ============================================================================
-- 3. CONTINUOUS MODE SESSION FLAG
-- ============================================================================
-- Add flag to track which sessions are in continuous mode

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions'
    AND column_name = 'is_continuous_mode'
  ) THEN
    ALTER TABLE claude_sessions
    ADD COLUMN is_continuous_mode BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions'
    AND column_name = 'continuous_started_at'
  ) THEN
    ALTER TABLE claude_sessions
    ADD COLUMN continuous_started_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions'
    AND column_name = 'continuous_sds_completed'
  ) THEN
    ALTER TABLE claude_sessions
    ADD COLUMN continuous_sds_completed INT DEFAULT 0;
  END IF;
END;
$$;

-- ============================================================================
-- 4. SD HIERARCHY VIEW
-- ============================================================================
-- View for traversing SD hierarchies (parent → children → grandchildren)

CREATE OR REPLACE VIEW v_sd_hierarchy AS
WITH RECURSIVE hierarchy AS (
  -- Base case: SDs with no parent (root level)
  SELECT
    id,
    legacy_id,
    title,
    status,
    current_phase,
    parent_sd_id,
    0 as depth,
    ARRAY[legacy_id::TEXT] as path,
    legacy_id::TEXT as root_sd
  FROM strategic_directives_v2
  WHERE is_active = TRUE

  UNION ALL

  -- Recursive case: children
  SELECT
    sd.id,
    sd.legacy_id,
    sd.title,
    sd.status,
    sd.current_phase,
    sd.parent_sd_id,
    h.depth + 1,
    h.path || sd.legacy_id::TEXT,
    h.root_sd
  FROM strategic_directives_v2 sd
  INNER JOIN hierarchy h ON sd.parent_sd_id = h.id
  WHERE sd.is_active = TRUE
)
SELECT
  *,
  CASE
    WHEN status IN ('completed', 'cancelled') THEN TRUE
    ELSE FALSE
  END as is_complete
FROM hierarchy;

-- ============================================================================
-- 5. CONTINUOUS EXECUTION SUMMARY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_continuous_execution_summary AS
SELECT
  session_id,
  COUNT(*) as total_operations,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
  COUNT(*) FILTER (WHERE retry_attempted = TRUE) as retries_attempted,
  COUNT(*) FILTER (WHERE retry_succeeded = TRUE) as retries_succeeded,
  SUM(duration_seconds) as total_duration_seconds,
  MIN(created_at) as started_at,
  MAX(created_at) as last_activity
FROM continuous_execution_log
GROUP BY session_id
ORDER BY last_activity DESC;

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Get all children of an SD (depth-first order)
CREATE OR REPLACE FUNCTION get_sd_children_depth_first(p_sd_id TEXT)
RETURNS TABLE (
  id TEXT,
  legacy_id TEXT,
  title TEXT,
  status TEXT,
  depth INT,
  execution_order INT
) AS $$
WITH RECURSIVE children AS (
  -- Start with immediate children
  SELECT
    sd.id,
    sd.legacy_id,
    sd.title,
    sd.status,
    1 as depth,
    ROW_NUMBER() OVER (ORDER BY sd.sequence_rank, sd.created_at) as sibling_order,
    ARRAY[ROW_NUMBER() OVER (ORDER BY sd.sequence_rank, sd.created_at)] as order_path
  FROM strategic_directives_v2 sd
  WHERE sd.parent_sd_id = p_sd_id
    AND sd.is_active = TRUE

  UNION ALL

  -- Recurse to grandchildren
  SELECT
    sd.id,
    sd.legacy_id,
    sd.title,
    sd.status,
    c.depth + 1,
    ROW_NUMBER() OVER (PARTITION BY sd.parent_sd_id ORDER BY sd.sequence_rank, sd.created_at),
    c.order_path || ROW_NUMBER() OVER (PARTITION BY sd.parent_sd_id ORDER BY sd.sequence_rank, sd.created_at)
  FROM strategic_directives_v2 sd
  INNER JOIN children c ON sd.parent_sd_id = c.id
  WHERE sd.is_active = TRUE
)
SELECT
  id,
  legacy_id,
  title,
  status,
  depth,
  ROW_NUMBER() OVER (ORDER BY order_path) as execution_order
FROM children
ORDER BY order_path;
$$ LANGUAGE SQL;

-- Check if SD hierarchy is complete
CREATE OR REPLACE FUNCTION is_sd_hierarchy_complete(p_sd_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_incomplete_count INT;
BEGIN
  SELECT COUNT(*) INTO v_incomplete_count
  FROM get_sd_children_depth_first(p_sd_id)
  WHERE status NOT IN ('completed', 'cancelled');

  RETURN v_incomplete_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Log continuous execution event
CREATE OR REPLACE FUNCTION log_continuous_execution(
  p_session_id TEXT,
  p_parent_sd_id TEXT,
  p_child_sd_id TEXT,
  p_phase TEXT,
  p_status TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_retry_attempted BOOLEAN DEFAULT FALSE,
  p_duration_seconds INT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO continuous_execution_log (
    session_id, parent_sd_id, child_sd_id, phase, status,
    error_message, retry_attempted, duration_seconds
  ) VALUES (
    p_session_id, p_parent_sd_id, p_child_sd_id, p_phase, p_status,
    p_error_message, p_retry_attempted, p_duration_seconds
  )
  RETURNING id INTO v_log_id;

  -- Update session stats if in continuous mode
  UPDATE claude_sessions
  SET continuous_sds_completed = continuous_sds_completed + 1
  WHERE session_id = p_session_id
    AND is_continuous_mode = TRUE
    AND p_status = 'completed';

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. GRANTS
-- ============================================================================

GRANT SELECT ON continuous_execution_log TO authenticated;
GRANT SELECT ON continuous_execution_log TO service_role;
GRANT INSERT ON continuous_execution_log TO service_role;

GRANT SELECT ON sd_checkpoint_history TO authenticated;
GRANT SELECT ON sd_checkpoint_history TO service_role;
GRANT INSERT ON sd_checkpoint_history TO service_role;

GRANT SELECT ON v_sd_hierarchy TO authenticated;
GRANT SELECT ON v_sd_hierarchy TO service_role;

GRANT SELECT ON v_continuous_execution_summary TO authenticated;
GRANT SELECT ON v_continuous_execution_summary TO service_role;

GRANT EXECUTE ON FUNCTION get_sd_children_depth_first(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sd_children_depth_first(TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION is_sd_hierarchy_complete(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_sd_hierarchy_complete(TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION log_continuous_execution(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INT) TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration adds:
-- 1. continuous_execution_log - Audit trail for autonomous execution
-- 2. sd_checkpoint_history - Checkpoint records at phase transitions
-- 3. Session columns for continuous mode tracking
-- 4. v_sd_hierarchy - View for traversing SD hierarchies
-- 5. Helper functions for hierarchy traversal and logging
