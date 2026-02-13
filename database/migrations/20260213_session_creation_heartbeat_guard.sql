-- ============================================================================
-- Migration: Session Creation Heartbeat Guard
-- Purpose: Prevent create_or_replace_session() from auto-releasing sessions
--          with fresh heartbeats (<5 min). Returns conflict instead.
-- Context: Two Claude instances on same terminal_identity would silently
--          steal each other's sessions. claim_sd() already checks v_active_sessions
--          but create_or_replace_session() never had this safeguard.
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
  v_heartbeat_age NUMERIC;
BEGIN
  -- Compute terminal identity
  v_terminal_identity := COALESCE(p_machine_id, '') || ':' || COALESCE(p_terminal_id, p_tty, '');

  -- Find any existing active session for this terminal identity
  SELECT session_id, sd_id, status, heartbeat_at INTO v_previous_session
  FROM claude_sessions
  WHERE terminal_identity = v_terminal_identity
    AND status IN ('active', 'idle')
    AND session_id != p_session_id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_previous_session IS NOT NULL THEN
    -- Check heartbeat freshness before auto-releasing
    v_heartbeat_age := EXTRACT(EPOCH FROM (NOW() - v_previous_session.heartbeat_at));

    IF v_heartbeat_age < 300 THEN
      -- Fresh heartbeat — return conflict, do NOT release
      -- The new session is still created (upsert below) but the old one stays active.
      -- Downstream code decides what to do with the conflict flag.

      -- Still upsert the new session so it exists in DB
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
        'auto_released', false,
        'conflict', true,
        'conflict_session_id', v_previous_session.session_id,
        'conflict_sd_id', v_previous_session.sd_id,
        'conflict_heartbeat_age_seconds', round(v_heartbeat_age)
      );
    END IF;

    -- Stale heartbeat (>= 300s) — safe to auto-release
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

    RAISE NOTICE 'Auto-released stale session % (heartbeat %s ago) for terminal %',
      v_previous_session.session_id, round(v_heartbeat_age), v_terminal_identity;
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
    -- Race condition: another session claimed the terminal identity concurrently.
    -- This is a conflict, not an error — the other session is legitimately active.
    RETURN jsonb_build_object(
      'success', true,
      'session_id', p_session_id,
      'terminal_identity', v_terminal_identity,
      'conflict', true,
      'error', 'terminal_conflict',
      'message', format('Terminal identity %s already claimed by another session', v_terminal_identity)
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_or_replace_session IS
  'Atomically creates a session, auto-releasing any previous session for the same terminal identity ONLY if heartbeat is stale (>= 300s). Returns conflict flag for fresh sessions. Part of FR-1.';
