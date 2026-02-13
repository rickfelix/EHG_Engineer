-- SD-LEO-FIX-FIX-SESSION-LIVENESS-001: Session Liveness & Atomic Claim Switching
-- US-002: Add is_alive column and v_live_sessions view
-- US-003: Create switch_sd_claim() atomic RPC

-- ============================================================
-- US-002: is_alive column
-- ============================================================

-- Add is_alive boolean column (default false = not alive until heartbeat starts)
ALTER TABLE claude_sessions
  ADD COLUMN IF NOT EXISTS is_alive BOOLEAN DEFAULT false;

-- Index for fast filtering of live sessions
CREATE INDEX IF NOT EXISTS idx_claude_sessions_is_alive
  ON claude_sessions (is_alive) WHERE is_alive = true;

-- ============================================================
-- US-002: v_live_sessions view
-- ============================================================

-- View that shows only genuinely alive sessions:
-- is_alive=true AND heartbeat within 5 minutes
CREATE OR REPLACE VIEW v_live_sessions AS
SELECT
  cs.*,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) AS heartbeat_age_seconds,
  CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 60 THEN
      ROUND(EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)))::TEXT || 's ago'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 3600 THEN
      ROUND(EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60)::TEXT || 'm ago'
    ELSE
      ROUND(EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 3600)::TEXT || 'h ago'
  END AS heartbeat_age_human
FROM claude_sessions cs
WHERE cs.is_alive = true
  AND cs.status IN ('active', 'idle')
  AND cs.heartbeat_at > NOW() - INTERVAL '5 minutes';

COMMENT ON VIEW v_live_sessions IS
  'Sessions with active heartbeat process (is_alive=true) and recent heartbeat (<5min). '
  'Unlike v_active_sessions which infers liveness from status/heartbeat, this view uses '
  'the explicit is_alive flag set by the heartbeat manager.';

-- ============================================================
-- US-003: switch_sd_claim() atomic RPC
-- ============================================================

-- Atomically switch an SD claim from one SD to another within a single transaction.
-- Prevents the gap where a session has no claim (appears dead) during SD switching.
CREATE OR REPLACE FUNCTION switch_sd_claim(
  p_session_id TEXT,
  p_old_sd_id TEXT,
  p_new_sd_id TEXT,
  p_new_track TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_conflict RECORD;
BEGIN
  -- Validate session exists and owns the old claim
  SELECT * INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or not active'
    );
  END IF;

  -- Verify session currently holds the old SD claim
  IF v_session.sd_id IS DISTINCT FROM p_old_sd_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Session does not hold claim on %s (current: %s)', p_old_sd_id, COALESCE(v_session.sd_id, 'none'))
    );
  END IF;

  -- Check if new SD is already claimed by another active session
  SELECT session_id, sd_id INTO v_conflict
  FROM claude_sessions
  WHERE sd_id = p_new_sd_id
    AND status = 'active'
    AND session_id != p_session_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('SD %s is already claimed by session %s', p_new_sd_id, v_conflict.session_id),
      'conflict_session_id', v_conflict.session_id
    );
  END IF;

  -- Atomic switch: update SD claim in a single UPDATE
  UPDATE claude_sessions
  SET
    sd_id = p_new_sd_id,
    track = COALESCE(p_new_track, track),
    claimed_at = NOW(),
    heartbeat_at = NOW(),
    updated_at = NOW()
  WHERE session_id = p_session_id;

  -- Log the switch in sd_claims if table exists
  BEGIN
    INSERT INTO sd_claims (session_id, sd_id, claimed_at, status)
    VALUES (p_session_id, p_new_sd_id, NOW(), 'active')
    ON CONFLICT DO NOTHING;

    -- Release old claim
    UPDATE sd_claims
    SET status = 'released', released_at = NOW(), release_reason = 'switched'
    WHERE session_id = p_session_id
      AND sd_id = p_old_sd_id
      AND status = 'active';
  EXCEPTION WHEN undefined_table THEN
    -- sd_claims table might not exist, skip
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'old_sd_id', p_old_sd_id,
    'new_sd_id', p_new_sd_id,
    'switched_at', NOW()::TEXT
  );
END;
$$;

COMMENT ON FUNCTION switch_sd_claim IS
  'Atomically switch SD claim from one SD to another without releasing the session. '
  'Prevents the gap where a session has no claim during SD transitions.';
