-- SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001 (FR-3): report_pid_validation_failure refuses on a
-- fresh row.
--
-- MEASURED (LEAD-phase Explore due diligence): the function as shipped by the 20260509 layer1
-- parity migration has NO heartbeat_at freshness check of its own -- it clears
-- claiming_session_id/active_session_id/is_working_on unconditionally once called, gated only on
-- machine_id match and status IN ('active','idle'). All safety against clearing a genuinely fresh
-- session's claim rested entirely on the JS CALLER's isSessionStale() gate in
-- lib/session-manager.mjs -- exactly the file-based instrument this SD's FR-1/FR-2 fix. This
-- migration makes the RPC itself refuse a fresh row, so it is safe to call from ANY caller,
-- present or future, not only a correctly-gated one.
--
-- The 900-second threshold below duplicates lib/session-manager.mjs's STALE_THRESHOLD_SECONDS by
-- necessity (SQL cannot import a JS constant); TR-1 of this SD keeps that constant unchanged, so
-- if it is ever revised in JS this literal must be revised here in the same PR.

BEGIN;

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

  -- FR-3: a fresh heartbeat refuses the clear outright, regardless of what the caller believed.
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
  'Marks a session as stale when PID validation fails. Includes machine_id check for safety, and (SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001 FR-3) a heartbeat-freshness refusal so no caller can clear a fresh claim through it. Layer 1 parity (LAYER-SIDE-CLAIMING-001): also releases the failed session SD claim by clearing both active_session_id and claiming_session_id. Part of FR-2.';

COMMIT;
