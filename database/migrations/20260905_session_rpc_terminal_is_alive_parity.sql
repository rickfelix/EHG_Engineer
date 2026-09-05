-- @chairman-gated
-- This is a function-body change to live production RPCs (not an additive/governed-data-row
-- change), so it is not eligible for the Adam-delegated apply path -- staged here awaiting
-- chairman GO per scripts/check-migration-readiness.mjs's CHAIRMAN-GATED-EXEMPT-001 convention
-- (same precedent as 20260904_report_pid_validation_failure_heartbeat_refusal.sql).
--
-- SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (FR-1, RPC leg): the write-side chokepoint
-- (lib/fleet/terminal-session-update.cjs) closes the JS-caller half of the liveness-SSOT defect
-- class -- a claude_sessions row reaching a terminal status (released/stale) without is_alive:false
-- landing in the SAME statement. Four PG functions in
-- 20260509_layer1_claiming_session_id_release_parity.sql (as superseded for
-- report_pid_validation_failure by 20260904_report_pid_validation_failure_heartbeat_refusal.sql)
-- carry the identical defect on the SQL side: each sets status='released' or status='stale'
-- without touching is_alive. This migration is the RPC-side parity leg -- CREATE OR REPLACE
-- FUNCTION preserves grants/ACLs and is atomic from in-flight callers' perspective, matching the
-- convention those two prior migrations already established.
--
-- Every function body below is otherwise BYTE-IDENTICAL to its currently-shipped definition --
-- report_pid_validation_failure is based on the 20260904 heartbeat-refusal supersession (not the
-- older 20260509 body), so this migration does not regress that fix. The only change anywhere is
-- adding `is_alive = false` alongside each UPDATE that sets status to 'released' or 'stale'.

BEGIN;

-- ============================================================================
-- create_or_replace_session — the auto-replace-previous-session branch
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
  v_terminal_identity := COALESCE(p_machine_id, '') || ':' || COALESCE(p_terminal_id, p_tty, '');

  SELECT session_id, sd_key, status INTO v_previous_session
  FROM claude_sessions
  WHERE terminal_identity = v_terminal_identity
    AND status IN ('active', 'idle')
    AND session_id != p_session_id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_previous_session IS NOT NULL THEN
    UPDATE claude_sessions
    SET status = 'released',
        is_alive = false,
        released_at = NOW(),
        released_reason = 'AUTO_REPLACED',
        updated_at = NOW()
    WHERE session_id = v_previous_session.session_id;

    IF v_previous_session.sd_key IS NOT NULL THEN
      -- LAYER-SIDE-CLAIMING-001 FR-2: clear claiming_session_id alongside active_session_id.
      -- (sd_claims table reference removed — table does not exist in current schema.)
      UPDATE strategic_directives_v2
      SET active_session_id = NULL, claiming_session_id = NULL, is_working_on = false
      WHERE active_session_id = v_previous_session.session_id
         OR claiming_session_id = v_previous_session.session_id;
    END IF;

    v_auto_released := true;
    v_previous_session_id := v_previous_session.session_id;

    RAISE NOTICE 'Auto-released previous session % for terminal %',
      v_previous_session.session_id, v_terminal_identity;
  END IF;

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
    RETURN jsonb_build_object(
      'success', false,
      'error', 'terminal_conflict',
      'message', format('Terminal identity %s already claimed by another session', v_terminal_identity)
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_or_replace_session IS
  'Atomically creates a session, auto-releasing any previous session for the same terminal identity. Layer 1 parity (LAYER-SIDE-CLAIMING-001): clears claiming_session_id alongside active_session_id. SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E: the auto-release UPDATE also sets is_alive=false in the same statement.';

-- ============================================================================
-- release_session
-- ============================================================================

CREATE OR REPLACE FUNCTION release_session(
  p_session_id TEXT,
  p_reason TEXT DEFAULT 'graceful_exit'
) RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT session_id, status, sd_key, released_at INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'session_not_found',
      'message', format('Session %s not found', p_session_id)
    );
  END IF;

  IF v_session.status = 'released' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_released', true,
      'session_id', p_session_id,
      'released_at', v_session.released_at
    );
  END IF;

  IF v_session.sd_key IS NOT NULL THEN
    -- LAYER-SIDE-CLAIMING-001 FR-3: clear claiming_session_id alongside active_session_id.
    -- (sd_claims table reference removed — table does not exist in current schema.)
    UPDATE strategic_directives_v2
    SET active_session_id = NULL, claiming_session_id = NULL, is_working_on = false
    WHERE active_session_id = p_session_id
       OR claiming_session_id = p_session_id;
  END IF;

  UPDATE claude_sessions
  SET status = 'released',
      is_alive = false,
      released_at = NOW(),
      released_reason = p_reason,
      sd_key = NULL,
      track = NULL,
      claimed_at = NULL,
      updated_at = NOW()
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'released_at', NOW(),
    'reason', p_reason,
    'had_sd_claim', v_session.sd_key IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION release_session IS
  'Releases a session with reason tracking. Idempotent. Layer 1 parity (LAYER-SIDE-CLAIMING-001): clears claiming_session_id alongside active_session_id. SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E: the release UPDATE also sets is_alive=false in the same statement.';

-- ============================================================================
-- cleanup_stale_sessions — two-phase batch release
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_stale_sessions(
  p_stale_threshold_seconds INTEGER DEFAULT 120,
  p_batch_size INTEGER DEFAULT 100
) RETURNS JSONB AS $$
DECLARE
  v_stale_count INTEGER := 0;
  v_released_count INTEGER := 0;
BEGIN
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
        is_alive = false,
        stale_at = NOW(),
        stale_reason = 'HEARTBEAT_TIMEOUT',
        updated_at = NOW()
    FROM stale_sessions ss
    WHERE cs.session_id = ss.session_id
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_stale_count FROM updated;

  WITH release_sessions AS (
    SELECT session_id, sd_key
    FROM claude_sessions
    WHERE status = 'stale'
      AND stale_at < NOW() - INTERVAL '30 seconds'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  released AS (
    UPDATE claude_sessions cs
    SET status = 'released',
        is_alive = false,
        released_at = NOW(),
        released_reason = 'STALE_CLEANUP',
        sd_key = NULL,
        track = NULL,
        claimed_at = NULL,
        updated_at = NOW()
    FROM release_sessions rs
    WHERE cs.session_id = rs.session_id
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_released_count FROM released;

  -- LAYER-SIDE-CLAIMING-001 FR-4: clear claiming_session_id alongside active_session_id.
  -- (sd_claims table reference removed — table does not exist in current schema.)
  UPDATE strategic_directives_v2
  SET active_session_id = NULL, claiming_session_id = NULL, is_working_on = false
  WHERE active_session_id IN (
    SELECT session_id FROM claude_sessions
    WHERE status = 'released' AND released_reason = 'STALE_CLEANUP'
    AND released_at > NOW() - INTERVAL '1 minute'
  )
  OR claiming_session_id IN (
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
  'Batch cleanup of stale sessions: marks stale after threshold, releases after 30s stale. Layer 1 parity (LAYER-SIDE-CLAIMING-001): clears claiming_session_id alongside active_session_id. SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E: both the stale-marking and release UPDATEs also set is_alive=false in the same statement.';

-- ============================================================================
-- report_pid_validation_failure — based on the 20260904 heartbeat-refusal supersession,
-- NOT the older 20260509 body, so this migration does not regress that fix.
-- ============================================================================

CREATE OR REPLACE FUNCTION report_pid_validation_failure(
  p_session_id TEXT,
  p_machine_id TEXT
) RETURNS JSONB AS $$
DECLARE
  v_session RECORD;
  v_heartbeat_age_seconds NUMERIC;
BEGIN
  SELECT session_id, machine_id, status, sd_key, heartbeat_at INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'session_not_found',
      'message', format('Session %s not found', p_session_id)
    );
  END IF;

  IF v_session.machine_id != p_machine_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'machine_mismatch',
      'message', 'PID validation must be reported from same machine'
    );
  END IF;

  IF v_session.status NOT IN ('active', 'idle') THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'current_status', v_session.status
    );
  END IF;

  -- FR-3 (SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001): a fresh heartbeat refuses the clear
  -- outright, regardless of what the caller believed.
  v_heartbeat_age_seconds := EXTRACT(EPOCH FROM (NOW() - v_session.heartbeat_at));
  IF v_session.heartbeat_at IS NOT NULL AND v_heartbeat_age_seconds < 900 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'heartbeat_fresh',
      'message', format('Refusing to clear session %s: heartbeat_at is %s seconds old (< 900s threshold)', p_session_id, round(v_heartbeat_age_seconds)),
      'heartbeat_age_seconds', v_heartbeat_age_seconds
    );
  END IF;

  -- (1/2) Mark session as stale due to PID not found (existing behavior)
  UPDATE claude_sessions
  SET status = 'stale',
      is_alive = false,
      stale_at = NOW(),
      stale_reason = 'PID_NOT_FOUND',
      pid_validated_at = NOW(),
      updated_at = NOW()
  WHERE session_id = p_session_id;

  -- (2/2) LAYER-SIDE-CLAIMING-001 FR-5: release the failed session's SD claim.
  -- Conditional WHERE narrows to only SDs linked to the failed session via either
  -- column (per validation-agent recommendation — never blanket clobber).
  UPDATE strategic_directives_v2
  SET active_session_id = NULL, claiming_session_id = NULL, is_working_on = false
  WHERE active_session_id = p_session_id
     OR claiming_session_id = p_session_id;

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
  'Marks a session as stale when PID validation fails. Includes machine_id check for safety, and (SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001 FR-3) a heartbeat-freshness refusal so no caller can clear a fresh claim through it. Layer 1 parity (LAYER-SIDE-CLAIMING-001): also releases the failed session SD claim by clearing both active_session_id and claiming_session_id. SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E: the stale-marking UPDATE also sets is_alive=false in the same statement.';

COMMIT;
