-- ============================================================================
-- MANUAL EXECUTION REQUIRED
-- ============================================================================
-- Migration: auto_proceed_sessions table
-- Purpose: Persistent state tracking for AUTO-PROCEED crash recovery (D18)
-- SD: SD-LEO-ENH-AUTO-PROCEED-001-06
--
-- HOW TO EXECUTE:
-- 1. Open Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select project: dedlbzhpgkmetvhbkyzq
-- 3. Go to: SQL Editor
-- 4. Create new query
-- 5. Copy this entire file and paste
-- 6. Click "Run"
--
-- After execution, verify with:
--    node scripts/verify-auto-proceed-sessions-migration.js
-- ============================================================================

-- ============================================================================
-- AUTO_PROCEED_SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS auto_proceed_sessions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session identification
  session_id TEXT NOT NULL,

  -- Auto-proceed state
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Currently executing SD (for crash recovery)
  active_sd_key TEXT NOT NULL,

  -- Orchestrator chaining preference (D21 power user mode)
  chain_orchestrators BOOLEAN DEFAULT FALSE,

  -- Current execution state (for detailed recovery)
  current_phase TEXT CHECK (current_phase IN ('LEAD', 'PLAN', 'EXEC', 'COMPLETE')),

  -- Parent orchestrator if working on child SD
  parent_orchestrator_key TEXT,

  -- Progress tracking for orchestrator children
  completed_children INT DEFAULT 0,
  total_children INT,

  -- Session metadata (extensible)
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft deactivation timestamp (when session ends normally)
  deactivated_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookup by session_id (primary use case for recovery)
CREATE INDEX IF NOT EXISTS idx_auto_proceed_sessions_session_id
  ON auto_proceed_sessions(session_id);

-- Find active sessions (for /leo resume)
CREATE INDEX IF NOT EXISTS idx_auto_proceed_sessions_active
  ON auto_proceed_sessions(is_active)
  WHERE is_active = TRUE;

-- Find sessions by SD (for debugging/auditing)
CREATE INDEX IF NOT EXISTS idx_auto_proceed_sessions_sd_key
  ON auto_proceed_sessions(active_sd_key);

-- Recent sessions (for cleanup)
CREATE INDEX IF NOT EXISTS idx_auto_proceed_sessions_created
  ON auto_proceed_sessions(created_at DESC);

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- Unique constraint: only one active session per session_id
-- This ensures clean state for crash recovery
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_proceed_sessions_unique_active
  ON auto_proceed_sessions(session_id)
  WHERE is_active = TRUE AND deactivated_at IS NULL;

-- ============================================================================
-- TRIGGER: Auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_auto_proceed_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_proceed_sessions_updated_at ON auto_proceed_sessions;
CREATE TRIGGER auto_proceed_sessions_updated_at
  BEFORE UPDATE ON auto_proceed_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_auto_proceed_sessions_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Start or update an AUTO-PROCEED session
CREATE OR REPLACE FUNCTION upsert_auto_proceed_session(
  p_session_id TEXT,
  p_active_sd_key TEXT,
  p_chain_orchestrators BOOLEAN DEFAULT FALSE,
  p_current_phase TEXT DEFAULT NULL,
  p_parent_orchestrator_key TEXT DEFAULT NULL,
  p_total_children INT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Deactivate any existing active session for this session_id
  UPDATE auto_proceed_sessions
  SET is_active = FALSE,
      deactivated_at = NOW()
  WHERE session_id = p_session_id
    AND is_active = TRUE
    AND deactivated_at IS NULL;

  -- Insert new session record
  INSERT INTO auto_proceed_sessions (
    session_id,
    is_active,
    active_sd_key,
    chain_orchestrators,
    current_phase,
    parent_orchestrator_key,
    total_children,
    completed_children,
    metadata
  ) VALUES (
    p_session_id,
    TRUE,
    p_active_sd_key,
    p_chain_orchestrators,
    p_current_phase,
    p_parent_orchestrator_key,
    p_total_children,
    0,
    p_metadata
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql;

-- Update progress (when child SD completes)
CREATE OR REPLACE FUNCTION update_auto_proceed_progress(
  p_session_id TEXT,
  p_completed_children INT DEFAULT NULL,
  p_current_phase TEXT DEFAULT NULL,
  p_active_sd_key TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE auto_proceed_sessions
  SET
    completed_children = COALESCE(p_completed_children, completed_children + 1),
    current_phase = COALESCE(p_current_phase, current_phase),
    active_sd_key = COALESCE(p_active_sd_key, active_sd_key)
  WHERE session_id = p_session_id
    AND is_active = TRUE
    AND deactivated_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Get active session for recovery
CREATE OR REPLACE FUNCTION get_active_auto_proceed_session(p_session_id TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  session_id TEXT,
  active_sd_key TEXT,
  chain_orchestrators BOOLEAN,
  current_phase TEXT,
  parent_orchestrator_key TEXT,
  completed_children INT,
  total_children INT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    aps.id,
    aps.session_id,
    aps.active_sd_key,
    aps.chain_orchestrators,
    aps.current_phase,
    aps.parent_orchestrator_key,
    aps.completed_children,
    aps.total_children,
    aps.metadata,
    aps.created_at,
    aps.updated_at
  FROM auto_proceed_sessions aps
  WHERE aps.is_active = TRUE
    AND aps.deactivated_at IS NULL
    AND (p_session_id IS NULL OR aps.session_id = p_session_id)
  ORDER BY aps.updated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Deactivate session (normal completion or explicit stop)
CREATE OR REPLACE FUNCTION deactivate_auto_proceed_session(p_session_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE auto_proceed_sessions
  SET is_active = FALSE,
      deactivated_at = NOW()
  WHERE session_id = p_session_id
    AND is_active = TRUE
    AND deactivated_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEW: Active AUTO-PROCEED Sessions
-- ============================================================================

CREATE OR REPLACE VIEW v_active_auto_proceed_sessions AS
SELECT
  aps.id,
  aps.session_id,
  aps.active_sd_key,
  aps.chain_orchestrators,
  aps.current_phase,
  aps.parent_orchestrator_key,
  aps.completed_children,
  aps.total_children,
  CASE
    WHEN aps.total_children > 0
    THEN ROUND((aps.completed_children::DECIMAL / aps.total_children) * 100, 1)
    ELSE 0
  END as progress_percentage,
  aps.metadata,
  aps.created_at,
  aps.updated_at,
  NOW() - aps.updated_at as time_since_update
FROM auto_proceed_sessions aps
WHERE aps.is_active = TRUE
  AND aps.deactivated_at IS NULL
ORDER BY aps.updated_at DESC;

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Allow authenticated users to read (for dashboard)
GRANT SELECT ON auto_proceed_sessions TO authenticated;
GRANT SELECT ON v_active_auto_proceed_sessions TO authenticated;

-- Service role can do everything
GRANT ALL ON auto_proceed_sessions TO service_role;
GRANT SELECT ON v_active_auto_proceed_sessions TO service_role;

-- Grant execute on functions to service_role
GRANT EXECUTE ON FUNCTION upsert_auto_proceed_session(TEXT, TEXT, BOOLEAN, TEXT, TEXT, INT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION update_auto_proceed_progress(TEXT, INT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_active_auto_proceed_session(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION deactivate_auto_proceed_session(TEXT) TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- After execution, run verification:
--   node scripts/verify-auto-proceed-sessions-migration.js
