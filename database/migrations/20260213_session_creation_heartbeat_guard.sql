-- ============================================================================
-- Migration: Session Creation Heartbeat Guard
-- Purpose: Prevent create_or_replace_session() from auto-releasing sessions
--          with fresh heartbeats (<5 min). Returns conflict instead.
-- Context: Two Claude instances on same terminal_identity would silently
--          steal each other's sessions. claim_sd() already checks v_active_sessions
--          but create_or_replace_session() never had this safeguard.
--
-- Design: Uses "INSERT-first, handle-conflict" pattern instead of
--         "SELECT-then-INSERT" because PL/pgSQL EXCEPTION blocks create
--         subtransactions that interfere with FOR UPDATE SKIP LOCKED
--         row visibility on Supabase (pgBouncer transaction mode).
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
  v_existing RECORD;
  v_heartbeat_age NUMERIC;
BEGIN
  -- Compute terminal identity (matches the GENERATED ALWAYS column)
  v_terminal_identity := COALESCE(p_machine_id, '') || ':' || COALESCE(p_terminal_id, p_tty, '');

  -- Strategy: Try to insert first. If it succeeds, no conflict exists.
  -- If it fails with unique_violation on terminal_identity, handle in exception.
  BEGIN
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

    -- INSERT succeeded — no terminal conflict
    RETURN jsonb_build_object(
      'success', true,
      'session_id', p_session_id,
      'terminal_identity', v_terminal_identity,
      'auto_released', false,
      'created_at', NOW()
    );

  EXCEPTION
    WHEN unique_violation THEN
      -- Terminal identity conflict: idx_claude_sessions_unique_terminal_active
      -- blocked us because another active/idle session exists on this terminal.
      -- The inner savepoint was rolled back; we can now query safely.
      NULL; -- Fall through to conflict resolution below
  END;

  -- Find the conflicting session
  SELECT session_id, sd_id, status, heartbeat_at INTO v_existing
  FROM claude_sessions
  WHERE terminal_identity = v_terminal_identity
    AND status IN ('active', 'idle')
    AND session_id != p_session_id
  LIMIT 1;

  IF v_existing IS NULL THEN
    -- Edge case: conflict fired but no matching session found (race condition).
    -- Return error so JS fallback can handle it.
    RETURN jsonb_build_object(
      'success', false,
      'session_id', p_session_id,
      'terminal_identity', v_terminal_identity,
      'error', 'terminal_conflict',
      'message', format('Terminal %s had unique violation but no conflicting session found', v_terminal_identity)
    );
  END IF;

  -- Check heartbeat freshness
  v_heartbeat_age := EXTRACT(EPOCH FROM (NOW() - v_existing.heartbeat_at));

  IF v_heartbeat_age < 300 THEN
    -- Fresh heartbeat (<5 min) — return conflict, do NOT release.
    -- The new session was NOT created. Downstream JS blocks SD claiming.
    RETURN jsonb_build_object(
      'success', true,
      'session_id', p_session_id,
      'terminal_identity', v_terminal_identity,
      'auto_released', false,
      'conflict', true,
      'conflict_session_id', v_existing.session_id,
      'conflict_sd_id', v_existing.sd_id,
      'conflict_heartbeat_age_seconds', round(v_heartbeat_age)
    );
  END IF;

  -- Stale heartbeat (>= 5 min) — safe to auto-release and create new session
  UPDATE claude_sessions
  SET status = 'released',
      released_at = NOW(),
      released_reason = 'AUTO_REPLACED',
      updated_at = NOW()
  WHERE session_id = v_existing.session_id;

  -- Release SD claim if the stale session had one
  IF v_existing.sd_id IS NOT NULL THEN
    UPDATE sd_claims
    SET released_at = NOW(), release_reason = 'AUTO_REPLACED'
    WHERE session_id = v_existing.session_id AND released_at IS NULL;

    UPDATE strategic_directives_v2
    SET active_session_id = NULL, is_working_on = false
    WHERE active_session_id = v_existing.session_id;
  END IF;

  RAISE NOTICE 'Auto-released stale session % (heartbeat %s ago) for terminal %',
    v_existing.session_id, round(v_heartbeat_age), v_terminal_identity;

  -- Now insert the new session (stale session is released, unique index is clear)
  BEGIN
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
      'auto_released', true,
      'previous_session_id', v_existing.session_id,
      'created_at', NOW()
    );

  EXCEPTION
    WHEN unique_violation THEN
      -- Lost the race: another session created between our release and insert.
      -- This is extremely unlikely but possible. Return error for JS fallback.
      RETURN jsonb_build_object(
        'success', false,
        'session_id', p_session_id,
        'terminal_identity', v_terminal_identity,
        'error', 'terminal_conflict',
        'message', format('Terminal %s: race condition during stale session replacement', v_terminal_identity)
      );
  END;

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_or_replace_session IS
  'Atomically creates a session, auto-releasing any previous session for the same terminal identity ONLY if heartbeat is stale (>= 300s). Returns conflict flag for fresh sessions. Uses INSERT-first pattern for pgBouncer compatibility. Part of FR-1.';
