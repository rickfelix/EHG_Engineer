-- Fix cleanup_stale_sessions to use valid release_reason
-- SD-LEO-INFRA-INTELLIGENT-SESSION-LIFECYCLE-001
-- Issue: sd_claims table has a check constraint on release_reason that doesn't include 'STALE_CLEANUP'
-- Fix: Use 'timeout' for sd_claims which is an allowed value

CREATE OR REPLACE FUNCTION cleanup_stale_sessions(
  p_stale_threshold_seconds INTEGER DEFAULT 120,
  p_batch_size INTEGER DEFAULT 100
) RETURNS JSONB AS $$
DECLARE
  v_stale_count INTEGER := 0;
  v_released_count INTEGER := 0;
BEGIN
  -- Step 1: Mark active sessions as stale if heartbeat too old
  WITH stale_sessions AS (
    SELECT session_id
    FROM claude_sessions
    WHERE status IN ('active', 'idle')
      AND heartbeat_at < NOW() - (p_stale_threshold_seconds || ' seconds')::INTERVAL
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE claude_sessions cs
    SET status = 'stale',
        stale_at = NOW(),
        stale_reason = 'HEARTBEAT_TIMEOUT',
        updated_at = NOW()
    FROM stale_sessions ss
    WHERE cs.session_id = ss.session_id
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_stale_count FROM updated;

  -- Step 2: Release stale sessions that have been stale for >30 seconds
  WITH release_sessions AS (
    SELECT session_id, sd_id
    FROM claude_sessions
    WHERE status = 'stale'
      AND stale_at < NOW() - INTERVAL '30 seconds'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  released AS (
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
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_released_count FROM released;

  -- Release SD claims for any recently released sessions
  -- Use 'timeout' which is a valid value for sd_claims.release_reason
  UPDATE sd_claims
  SET released_at = NOW(), release_reason = 'timeout'
  WHERE session_id IN (
    SELECT session_id FROM claude_sessions
    WHERE status = 'released' AND released_reason = 'STALE_CLEANUP'
    AND released_at > NOW() - INTERVAL '1 minute'
  ) AND released_at IS NULL;

  -- Clear is_working_on for released sessions
  UPDATE strategic_directives_v2
  SET active_session_id = NULL, is_working_on = false
  WHERE active_session_id IN (
    SELECT session_id FROM claude_sessions
    WHERE status = 'released' AND released_reason = 'STALE_CLEANUP'
    AND released_at > NOW() - INTERVAL '1 minute'
  );

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
  'Batch cleanup of stale sessions: marks stale after threshold, releases after 30s stale. Uses timeout for sd_claims release_reason. Part of FR-4.';
