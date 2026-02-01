-- Intelligent Session Lifecycle Management
-- SD-LEO-INFRA-INTELLIGENT-SESSION-LIFECYCLE-001
-- Purpose: Add terminal identity tracking, auto-release, and lifecycle event logging
-- Created: 2026-02-01

-- ============================================================================
-- FR-1: Terminal Identity Tracking for Auto-Release
-- Purpose: Track machine_id and terminal_id to auto-release previous sessions
-- ============================================================================

-- Add machine_id and terminal_id columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions' AND column_name = 'machine_id'
  ) THEN
    ALTER TABLE claude_sessions ADD COLUMN machine_id TEXT;
    RAISE NOTICE 'Added machine_id column to claude_sessions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions' AND column_name = 'terminal_id'
  ) THEN
    ALTER TABLE claude_sessions ADD COLUMN terminal_id TEXT;
    RAISE NOTICE 'Added terminal_id column to claude_sessions';
  END IF;

  -- Add released_reason column for tracking why sessions were released
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions' AND column_name = 'released_reason'
  ) THEN
    ALTER TABLE claude_sessions ADD COLUMN released_reason TEXT;
    RAISE NOTICE 'Added released_reason column to claude_sessions';
  END IF;

  -- Add released_at column for tracking when sessions were released
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions' AND column_name = 'released_at'
  ) THEN
    ALTER TABLE claude_sessions ADD COLUMN released_at TIMESTAMPTZ;
    RAISE NOTICE 'Added released_at column to claude_sessions';
  END IF;

  -- Add stale_at column for tracking when sessions became stale
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions' AND column_name = 'stale_at'
  ) THEN
    ALTER TABLE claude_sessions ADD COLUMN stale_at TIMESTAMPTZ;
    RAISE NOTICE 'Added stale_at column to claude_sessions';
  END IF;

  -- Add stale_reason column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions' AND column_name = 'stale_reason'
  ) THEN
    ALTER TABLE claude_sessions ADD COLUMN stale_reason TEXT;
    RAISE NOTICE 'Added stale_reason column to claude_sessions';
  END IF;

  -- Add pid_validated_at column for PID validation caching
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions' AND column_name = 'pid_validated_at'
  ) THEN
    ALTER TABLE claude_sessions ADD COLUMN pid_validated_at TIMESTAMPTZ;
    RAISE NOTICE 'Added pid_validated_at column to claude_sessions';
  END IF;
END $$;

-- Create computed terminal_identity column
ALTER TABLE claude_sessions DROP COLUMN IF EXISTS terminal_identity;
ALTER TABLE claude_sessions ADD COLUMN terminal_identity TEXT
  GENERATED ALWAYS AS (COALESCE(machine_id, '') || ':' || COALESCE(terminal_id, tty, '')) STORED;

COMMENT ON COLUMN claude_sessions.terminal_identity IS
  'Computed identity from machine_id:terminal_id for uniqueness. Part of FR-1.';

-- ============================================================================
-- FR-1: Partial Unique Index for Single Active Session per Terminal
-- ============================================================================

-- Create partial unique index on terminal_identity for active sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_claude_sessions_unique_terminal_active'
  ) THEN
    CREATE UNIQUE INDEX idx_claude_sessions_unique_terminal_active
    ON claude_sessions (terminal_identity)
    WHERE terminal_identity IS NOT NULL
      AND terminal_identity != ':'
      AND status IN ('active', 'idle');

    RAISE NOTICE 'Created unique index idx_claude_sessions_unique_terminal_active';
  ELSE
    RAISE NOTICE 'Index idx_claude_sessions_unique_terminal_active already exists';
  END IF;
END $$;

COMMENT ON INDEX idx_claude_sessions_unique_terminal_active IS
  'Enforces single active/idle session per terminal identity. Prevents same-terminal duplicates. Part of FR-1.';

-- ============================================================================
-- FR-1: Auto-Release Function for Same Terminal
-- Purpose: Atomically release previous session and create new one
-- ============================================================================

CREATE OR REPLACE FUNCTION create_or_replace_session(
  p_session_id TEXT,
  p_machine_id TEXT,
  p_terminal_id TEXT,
  p_tty TEXT,
  p_pid INTEGER,
  p_hostname TEXT,
  p_codebase TEXT,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB AS $$
DECLARE
  v_terminal_identity TEXT;
  v_previous_session RECORD;
  v_auto_released BOOLEAN := false;
  v_previous_session_id TEXT := NULL;
BEGIN
  -- Compute terminal identity
  v_terminal_identity := COALESCE(p_machine_id, '') || ':' || COALESCE(p_terminal_id, p_tty, '');

  -- Find and release any existing active session for this terminal identity
  SELECT session_id, sd_id, status INTO v_previous_session
  FROM claude_sessions
  WHERE terminal_identity = v_terminal_identity
    AND status IN ('active', 'idle')
    AND session_id != p_session_id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_previous_session IS NOT NULL THEN
    -- Auto-release the previous session
    UPDATE claude_sessions
    SET status = 'released',
        released_at = NOW(),
        released_reason = 'AUTO_REPLACED',
        updated_at = NOW()
    WHERE session_id = v_previous_session.session_id;

    -- If it had an SD claim, release that too
    IF v_previous_session.sd_id IS NOT NULL THEN
      UPDATE sd_claims
      SET released_at = NOW(), release_reason = 'AUTO_REPLACED'
      WHERE session_id = v_previous_session.session_id AND released_at IS NULL;

      UPDATE strategic_directives_v2
      SET active_session_id = NULL, is_working_on = false
      WHERE active_session_id = v_previous_session.session_id;
    END IF;

    v_auto_released := true;
    v_previous_session_id := v_previous_session.session_id;

    RAISE NOTICE 'Auto-released previous session % for terminal %',
      v_previous_session.session_id, v_terminal_identity;
  END IF;

  -- Upsert the new session
  INSERT INTO claude_sessions (
    session_id, machine_id, terminal_id, tty, pid, hostname, codebase,
    status, heartbeat_at, metadata, created_at, updated_at
  ) VALUES (
    p_session_id, p_machine_id, p_terminal_id, p_tty, p_pid, p_hostname, p_codebase,
    'idle', NOW(), p_metadata, NOW(), NOW()
  )
  ON CONFLICT (session_id) DO UPDATE SET
    machine_id = EXCLUDED.machine_id,
    terminal_id = EXCLUDED.terminal_id,
    tty = EXCLUDED.tty,
    pid = EXCLUDED.pid,
    hostname = EXCLUDED.hostname,
    heartbeat_at = NOW(),
    metadata = EXCLUDED.metadata,
    status = CASE
      WHEN claude_sessions.status = 'released' THEN 'idle'
      ELSE claude_sessions.status
    END,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'terminal_identity', v_terminal_identity,
    'auto_released', v_auto_released,
    'previous_session_id', v_previous_session_id,
    'created_at', NOW()
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Race condition: another session claimed the terminal identity
    RETURN jsonb_build_object(
      'success', false,
      'error', 'terminal_conflict',
      'message', format('Terminal identity %s already claimed by another session', v_terminal_identity)
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_or_replace_session IS
  'Atomically creates a session, auto-releasing any previous session for the same terminal identity. Part of FR-1.';

-- ============================================================================
-- FR-3: Enhanced Session Release Function
-- Purpose: Release session with reason tracking and idempotency
-- ============================================================================

CREATE OR REPLACE FUNCTION release_session(
  p_session_id TEXT,
  p_reason TEXT DEFAULT 'graceful_exit'
) RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Get current session state
  SELECT session_id, status, sd_id, released_at INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'session_not_found',
      'message', format('Session %s not found', p_session_id)
    );
  END IF;

  -- Idempotent: if already released, return success with original timestamp
  IF v_session.status = 'released' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_released', true,
      'session_id', p_session_id,
      'released_at', v_session.released_at
    );
  END IF;

  -- Release any SD claim first
  IF v_session.sd_id IS NOT NULL THEN
    UPDATE sd_claims
    SET released_at = NOW(), release_reason = p_reason
    WHERE session_id = p_session_id AND released_at IS NULL;

    UPDATE strategic_directives_v2
    SET active_session_id = NULL, is_working_on = false
    WHERE active_session_id = p_session_id;
  END IF;

  -- Update session to released
  UPDATE claude_sessions
  SET status = 'released',
      released_at = NOW(),
      released_reason = p_reason,
      sd_id = NULL,
      track = NULL,
      claimed_at = NULL,
      updated_at = NOW()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'released_at', NOW(),
    'reason', p_reason,
    'had_sd_claim', v_session.sd_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION release_session IS
  'Releases a session with reason tracking. Idempotent - safe to call multiple times. Part of FR-3.';

-- ============================================================================
-- FR-4: Cleanup Stale Sessions Function (Enhanced)
-- Purpose: Mark stale sessions and release them with batch processing
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_stale_sessions(
  p_stale_threshold_seconds INTEGER DEFAULT 120,
  p_batch_size INTEGER DEFAULT 100
) RETURNS JSONB AS $$
DECLARE
  v_stale_count INTEGER := 0;
  v_released_count INTEGER := 0;
  v_stale_ids TEXT[];
  v_release_ids TEXT[];
BEGIN
  -- Step 1: Mark active sessions as stale if heartbeat too old
  WITH stale_sessions AS (
    SELECT session_id
    FROM claude_sessions
    WHERE status IN ('active', 'idle')
      AND heartbeat_at < NOW() - (p_stale_threshold_seconds || ' seconds')::INTERVAL
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE claude_sessions cs
  SET status = 'stale',
      stale_at = NOW(),
      stale_reason = 'HEARTBEAT_TIMEOUT',
      updated_at = NOW()
  FROM stale_sessions ss
  WHERE cs.session_id = ss.session_id
  RETURNING cs.session_id INTO v_stale_ids;

  v_stale_count := COALESCE(array_length(v_stale_ids, 1), 0);

  -- Step 2: Release stale sessions that have been stale for >30 seconds
  WITH release_sessions AS (
    SELECT session_id, sd_id
    FROM claude_sessions
    WHERE status = 'stale'
      AND stale_at < NOW() - INTERVAL '30 seconds'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE claude_sessions cs
  SET status = 'released',
      released_at = NOW(),
      released_reason = 'STALE_CLEANUP',
      sd_id = NULL,
      track = NULL,
      claimed_at = NULL,
      updated_at = NOW()
  FROM release_sessions rs
  WHERE cs.session_id = rs.session_id
  RETURNING cs.session_id INTO v_release_ids;

  v_released_count := COALESCE(array_length(v_release_ids, 1), 0);

  -- Release SD claims for released sessions
  UPDATE sd_claims
  SET released_at = NOW(), release_reason = 'STALE_CLEANUP'
  WHERE session_id = ANY(v_release_ids) AND released_at IS NULL;

  -- Clear is_working_on for released sessions
  UPDATE strategic_directives_v2
  SET active_session_id = NULL, is_working_on = false
  WHERE active_session_id = ANY(v_release_ids);

  RETURN jsonb_build_object(
    'success', true,
    'sessions_marked_stale', v_stale_count,
    'sessions_released', v_released_count,
    'stale_threshold_seconds', p_stale_threshold_seconds,
    'batch_size', p_batch_size,
    'executed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_stale_sessions IS
  'Batch cleanup of stale sessions: marks stale after threshold, releases after 30s stale. Part of FR-4.';

-- ============================================================================
-- FR-2: PID Validation Reporting Function
-- Purpose: Mark session stale when PID validation fails
-- ============================================================================

CREATE OR REPLACE FUNCTION report_pid_validation_failure(
  p_session_id TEXT,
  p_machine_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Get session info
  SELECT session_id, machine_id, status INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'session_not_found'
    );
  END IF;

  -- Verify machine_id matches (security: prevent cross-machine false positives)
  IF v_session.machine_id IS NOT NULL AND v_session.machine_id != p_machine_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'machine_mismatch',
      'message', 'PID validation must be reported from same machine'
    );
  END IF;

  -- Only mark stale if currently active/idle
  IF v_session.status NOT IN ('active', 'idle') THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'current_status', v_session.status
    );
  END IF;

  -- Mark session as stale due to PID not found
  UPDATE claude_sessions
  SET status = 'stale',
      stale_at = NOW(),
      stale_reason = 'PID_NOT_FOUND',
      pid_validated_at = NOW(),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'new_status', 'stale',
    'stale_reason', 'PID_NOT_FOUND',
    'stale_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION report_pid_validation_failure IS
  'Marks a session as stale when PID validation fails. Includes machine_id check for safety. Part of FR-2.';

-- ============================================================================
-- FR-5: Session Lifecycle Events Table for Observability
-- Purpose: Log all session lifecycle events for metrics and debugging
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  session_id TEXT NOT NULL,
  machine_id TEXT,
  terminal_id TEXT,
  pid INTEGER,
  reason TEXT,
  latency_ms INTEGER,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for querying by session and time
CREATE INDEX IF NOT EXISTS idx_session_lifecycle_events_session
ON session_lifecycle_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_lifecycle_events_type_time
ON session_lifecycle_events (event_type, created_at DESC);

COMMENT ON TABLE session_lifecycle_events IS
  'Audit log for session lifecycle events: create, heartbeat, stale, release. Part of FR-5.';

-- ============================================================================
-- FR-5: Function to Log Lifecycle Events
-- ============================================================================

CREATE OR REPLACE FUNCTION log_session_event(
  p_event_type TEXT,
  p_session_id TEXT,
  p_machine_id TEXT DEFAULT NULL,
  p_terminal_id TEXT DEFAULT NULL,
  p_pid INTEGER DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_latency_ms INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO session_lifecycle_events (
    event_type, session_id, machine_id, terminal_id, pid, reason, latency_ms, metadata
  ) VALUES (
    p_event_type, p_session_id, p_machine_id, p_terminal_id, p_pid, p_reason, p_latency_ms, p_metadata
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_session_event IS
  'Logs a session lifecycle event for observability. Part of FR-5.';

-- ============================================================================
-- FR-5: View for Session Metrics
-- ============================================================================

CREATE OR REPLACE VIEW v_session_metrics AS
SELECT
  (SELECT COUNT(*) FROM claude_sessions WHERE status IN ('active', 'idle')) as active_sessions_count,
  (SELECT COUNT(*) FROM claude_sessions WHERE status = 'stale') as stale_sessions_count,
  (SELECT COUNT(*) FROM session_lifecycle_events
   WHERE event_type = 'SESSION_RELEASED'
   AND created_at > NOW() - INTERVAL '1 hour') as releases_last_hour,
  (SELECT AVG(latency_ms) FROM session_lifecycle_events
   WHERE event_type = 'SESSION_RELEASED'
   AND latency_ms IS NOT NULL
   AND created_at > NOW() - INTERVAL '1 hour') as avg_release_latency_ms,
  (SELECT COUNT(*) FROM session_lifecycle_events
   WHERE event_type = 'PID_VALIDATION_FAILED'
   AND created_at > NOW() - INTERVAL '24 hours') as pid_validation_failures_24h,
  (SELECT COUNT(*) FROM session_lifecycle_events
   WHERE reason = 'AUTO_REPLACED'
   AND created_at > NOW() - INTERVAL '24 hours') as auto_replacements_24h;

COMMENT ON VIEW v_session_metrics IS
  'Aggregated session metrics for observability dashboards. Part of FR-5.';

-- ============================================================================
-- Update v_active_sessions view with new columns
-- ============================================================================

CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
  cs.id,
  cs.session_id,
  cs.sd_id,
  sd.title as sd_title,
  cs.track,
  cs.tty,
  cs.pid,
  cs.hostname,
  cs.codebase,
  cs.machine_id,
  cs.terminal_id,
  cs.terminal_identity,
  cs.claimed_at,
  cs.heartbeat_at,
  cs.status,
  cs.released_reason,
  cs.released_at,
  cs.stale_reason,
  cs.stale_at,
  cs.metadata,
  cs.created_at,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) as heartbeat_age_seconds,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60 as heartbeat_age_minutes,
  GREATEST(0, 300 - EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))) as seconds_until_stale,
  CASE
    WHEN cs.status = 'released' THEN 'released'
    WHEN cs.status = 'stale' THEN 'stale'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) > 300 THEN 'stale'
    WHEN cs.sd_id IS NULL THEN 'idle'
    ELSE 'active'
  END as computed_status,
  CASE
    WHEN cs.claimed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - cs.claimed_at)) / 60
    ELSE NULL
  END as claim_duration_minutes,
  CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 60 THEN
      EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))::int || 's ago'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 3600 THEN
      (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60)::int || 'm ago'
    ELSE
      (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 3600)::int || 'h ago'
  END as heartbeat_age_human
FROM claude_sessions cs
LEFT JOIN strategic_directives_v2 sd ON cs.sd_id = sd.sd_key
WHERE cs.status NOT IN ('released')
ORDER BY cs.track NULLS LAST, cs.claimed_at DESC;

COMMENT ON VIEW v_active_sessions IS
  'Active sessions with terminal identity, staleness info, and lifecycle timestamps. Enhanced for SD-LEO-INFRA-ISL-001.';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Verify terminal_identity index
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_claude_sessions_unique_terminal_active'
  ) THEN
    RAISE NOTICE 'SUCCESS: Terminal identity unique index exists';
  ELSE
    RAISE WARNING 'FAILED: Terminal identity unique index not created';
  END IF;

  -- Verify lifecycle events table
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'session_lifecycle_events'
  ) THEN
    RAISE NOTICE 'SUCCESS: session_lifecycle_events table exists';
  ELSE
    RAISE WARNING 'FAILED: session_lifecycle_events table not created';
  END IF;

  -- Verify new columns
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'claude_sessions' AND column_name = 'terminal_identity'
  ) THEN
    RAISE NOTICE 'SUCCESS: terminal_identity column exists';
  ELSE
    RAISE WARNING 'FAILED: terminal_identity column not created';
  END IF;
END $$;
