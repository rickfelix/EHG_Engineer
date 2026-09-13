-- Rollback for 20260913_claim_sd_parent_child_single_pointer.sql.
-- SD-LEO-INFRA-CLAIM-PARENT-CHILD-001
--
-- This migration only replaced claim_sd's function BODY (CREATE OR REPLACE, unchanged
-- signature) -- it created nothing new to DROP. The rollback is therefore another
-- CREATE OR REPLACE FUNCTION, restoring the pre-fix body byte-for-byte from
-- database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql: the
-- parent-exclusion clause (`AND (v_sd_parent_id IS NULL OR sd_key != v_sd_parent_id)`) is
-- restored on both the capture SELECT and the claim-switch UPDATE, and `parent_preserved`
-- reverts to `v_sd_parent_id IS NOT NULL`.

CREATE OR REPLACE FUNCTION public.claim_sd(p_sd_id text, p_session_id text, p_track text, p_force_takeover boolean DEFAULT false, p_client_gate_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_session    text;
  v_existing_hb_age     numeric;
  v_existing_status     text;
  v_existing_wt_path    text;
  v_existing_wt_branch  text;
  v_sd_claiming_id      text;
  v_sd_parent_id        text;
  v_drift_detected      boolean := FALSE;
  v_takeover            boolean := FALSE;
  v_takeover_reason     text;
  v_caller_parent_id    text;
  v_audit_event_id      uuid;
  v_conflict            RECORD;
  v_is_qf               boolean := p_sd_id LIKE 'QF-%';
  v_sd_status           text;
  v_qf_status           text;
  v_sd_claim_hb_age     numeric;
  v_qf_claiming_id      text;
  v_qf_claim_hb_age     numeric;
  v_respect_inflight       boolean := FALSE;
  v_ttl_minutes            integer := 15;
  v_hardcap_minutes        integer := 45;
  v_existing_silence_until timestamptz;
  v_sd_claim_silence_until timestamptz;
  v_evicted_sd_key         text;
  v_evicted_clear_event_id uuid;
  v_evicted_row_count      integer;
  v_evicted_clear_row_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_sd_id));

  IF NOT EXISTS (SELECT 1 FROM claude_sessions WHERE session_id = p_session_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'phantom_session',
      'message', format('[CLAIM_PHANTOM_SESSION] session_id %s has no live claude_sessions row — refusing to claim %s.', p_session_id, p_sd_id));
  END IF;

  BEGIN
    SELECT
      COALESCE((metadata->>'sweep_respect_inflight_agent')::boolean, FALSE),
      COALESCE((metadata->>'claim_ttl_minutes')::integer, 15)
    INTO v_respect_inflight, v_ttl_minutes
    FROM chairman_dashboard_config
    WHERE config_key = 'default'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_respect_inflight := FALSE;
    v_ttl_minutes := 15;
  END;
  v_hardcap_minutes := 30 + GREATEST(COALESCE(v_ttl_minutes, 15), 0);

  SELECT cs.session_id, cs.status,
         EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)),
         cs.worktree_path, cs.worktree_branch,
         cs.expected_silence_until
    INTO v_existing_session, v_existing_status, v_existing_hb_age,
         v_existing_wt_path, v_existing_wt_branch,
         v_existing_silence_until
    FROM claude_sessions cs
   WHERE cs.sd_key = p_sd_id
     AND cs.session_id != p_session_id
     AND cs.status IN ('active', 'idle')
   ORDER BY cs.heartbeat_at DESC
   LIMIT 1
     FOR UPDATE;

  IF NOT v_is_qf THEN
    SELECT sd.claiming_session_id, sd.parent_sd_id, sd.status
      INTO v_sd_claiming_id, v_sd_parent_id, v_sd_status
      FROM strategic_directives_v2 sd
     WHERE sd.sd_key = p_sd_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_not_found',
        'message', format('[CLAIM_SD_NOT_FOUND] SD %s does not exist in strategic_directives_v2 — refusing to claim a phantom id.', p_sd_id));
    END IF;
    IF v_sd_status IN ('completed', 'cancelled', 'deferred') THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_terminal_status',
        'status', v_sd_status,
        'message', format('[CLAIM_SD_TERMINAL] SD %s is in terminal status %s — refusing to claim a finished/cancelled/deferred SD.', p_sd_id, v_sd_status));
    END IF;

    IF v_sd_claiming_id IS NOT NULL AND v_sd_claiming_id != p_session_id THEN
      SELECT EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)),
             cs.expected_silence_until
        INTO v_sd_claim_hb_age,
             v_sd_claim_silence_until
        FROM claude_sessions cs
       WHERE cs.session_id = v_sd_claiming_id
         AND cs.status IN ('active', 'idle')
       ORDER BY cs.heartbeat_at DESC
       LIMIT 1;
    END IF;
  ELSE
    SELECT qf.status, qf.claiming_session_id
      INTO v_qf_status, v_qf_claiming_id
      FROM quick_fixes qf
     WHERE qf.id = p_sd_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_not_found',
        'message', format('[CLAIM_QF_NOT_FOUND] Quick-fix %s does not exist in quick_fixes — refusing to claim a phantom id.', p_sd_id));
    END IF;
    IF v_qf_status IN ('completed', 'cancelled', 'escalated') THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_terminal_status',
        'status', v_qf_status,
        'message', format('[CLAIM_QF_TERMINAL] Quick-fix %s is in terminal status %s — refusing to claim a finished/cancelled/escalated quick-fix.', p_sd_id, v_qf_status));
    END IF;

    IF v_qf_claiming_id IS NOT NULL AND v_qf_claiming_id != p_session_id THEN
      SELECT EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))
        INTO v_qf_claim_hb_age
        FROM claude_sessions cs
       WHERE cs.session_id = v_qf_claiming_id
         AND cs.status IN ('active', 'idle')
       ORDER BY cs.heartbeat_at DESC
       LIMIT 1;
    END IF;
  END IF;

  IF v_sd_claiming_id IS NOT NULL
     AND v_sd_claiming_id != p_session_id
     AND v_existing_session IS NULL
  THEN
    v_drift_detected := TRUE;
  END IF;

  IF v_existing_session IS NOT NULL AND v_existing_hb_age < 900 THEN
    IF NOT p_force_takeover THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'already_claimed',
        'message', format(
          '[CLAIM_PEER_ACTIVE] SD %s is already claimed by active session %s (heartbeat %ss ago). Use --force to take over or wait for release.',
          p_sd_id, v_existing_session, ROUND(v_existing_hb_age)),
        'claimed_by', v_existing_session,
        'heartbeat_age_seconds', ROUND(v_existing_hb_age)
      );
    END IF;

    SELECT cs2.sd_key INTO v_caller_parent_id
      FROM claude_sessions cs2
     WHERE cs2.session_id = p_session_id
       AND cs2.status IN ('active', 'idle')
     LIMIT 1;

    IF v_existing_hb_age >= 60 THEN
      v_takeover := TRUE;
      v_takeover_reason := 'force_heartbeat_threshold';
    ELSIF v_sd_parent_id IS NOT NULL
          AND v_caller_parent_id = v_sd_parent_id THEN
      v_takeover := TRUE;
      v_takeover_reason := 'force_parent_authority';
    ELSE
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'unauthorized_force',
        'message', format(
          '[CLAIM_FORCE_DENIED] SD %s force-takeover refused: caller session %s lacks authority (prior heartbeat %ss < 60s threshold and no parent SD authority). Use sd:release first or wait.',
          p_sd_id, p_session_id, ROUND(v_existing_hb_age))
      );
    END IF;
  END IF;

  IF v_sd_claiming_id IS NOT NULL
     AND v_sd_claiming_id != p_session_id
     AND v_sd_claim_hb_age IS NOT NULL
     AND v_sd_claim_hb_age < 900
     AND NOT p_force_takeover
  THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'claimed_by_live_peer',
      'message', format(
        '[CLAIM_LIVE_PEER] SD %s is claimed by LIVE session %s (heartbeat %ss ago) — refusing to overwrite a live peer''s claim. Use --force to take over or wait for release.',
        p_sd_id, v_sd_claiming_id, ROUND(v_sd_claim_hb_age)),
      'claimed_by', v_sd_claiming_id,
      'heartbeat_age_seconds', ROUND(v_sd_claim_hb_age)
    );
  END IF;

  IF v_qf_claiming_id IS NOT NULL
     AND v_qf_claiming_id != p_session_id
     AND v_qf_claim_hb_age IS NOT NULL
     AND v_qf_claim_hb_age < 900
     AND NOT p_force_takeover
  THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'claimed_by_live_peer',
      'message', format(
        '[CLAIM_LIVE_PEER] Quick-fix %s is claimed by LIVE session %s (heartbeat %ss ago) — refusing to overwrite a live peer''s claim. Use --force to take over or wait for release.',
        p_sd_id, v_qf_claiming_id, ROUND(v_qf_claim_hb_age)),
      'claimed_by', v_qf_claiming_id,
      'heartbeat_age_seconds', ROUND(v_qf_claim_hb_age)
    );
  END IF;

  IF v_respect_inflight
     AND v_drift_detected AND NOT v_takeover
     AND NOT p_force_takeover
     AND v_sd_claim_silence_until IS NOT NULL
     AND v_sd_claim_silence_until > NOW()
     AND v_sd_claim_hb_age IS NOT NULL
     AND v_sd_claim_hb_age <= (v_hardcap_minutes * 60)
  THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'claimed_by_silenced_peer',
      'message', format(
        '[CLAIM_SILENCED_PEER] SD %s is claimed by session %s parked inside an armed silence window (until %s, heartbeat %ss ago) — refusing to reap a parked worker. Use --force to override.',
        p_sd_id, v_sd_claiming_id, v_sd_claim_silence_until, ROUND(v_sd_claim_hb_age)),
      'claimed_by', v_sd_claiming_id,
      'silence_until', v_sd_claim_silence_until,
      'heartbeat_age_seconds', ROUND(v_sd_claim_hb_age)
    );
  END IF;

  IF v_drift_detected AND NOT v_takeover THEN
    v_takeover := TRUE;
    v_takeover_reason := 'drift_recovery';
  END IF;

  IF v_respect_inflight
     AND v_existing_session IS NOT NULL
     AND v_existing_hb_age >= 900 AND NOT v_takeover
     AND NOT p_force_takeover
     AND v_existing_silence_until IS NOT NULL
     AND v_existing_silence_until > NOW()
     AND v_existing_hb_age <= (v_hardcap_minutes * 60)
  THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'claimed_by_silenced_peer',
      'message', format(
        '[CLAIM_SILENCED_PEER] SD %s is claimed by parked session %s inside an armed silence window (until %s, heartbeat %ss ago) — refusing auto-stale takeover. Use --force to override.',
        p_sd_id, v_existing_session, v_existing_silence_until, ROUND(v_existing_hb_age)),
      'claimed_by', v_existing_session,
      'silence_until', v_existing_silence_until,
      'heartbeat_age_seconds', ROUND(v_existing_hb_age)
    );
  END IF;

  IF v_existing_session IS NOT NULL AND v_existing_hb_age >= 900 AND NOT v_takeover THEN
    v_takeover := TRUE;
    v_takeover_reason := 'auto_stale_takeover';
  END IF;

  IF NOT v_is_qf AND NOT v_takeover THEN
    SELECT cm.*, cs_other.sd_key AS active_sd, cs_other.session_id AS active_session
      INTO v_conflict
      FROM sd_conflict_matrix cm
      JOIN claude_sessions cs_other ON (
        (cm.sd_id_a = p_sd_id AND cm.sd_id_b = cs_other.sd_key) OR
        (cm.sd_id_b = p_sd_id AND cm.sd_id_a = cs_other.sd_key)
      )
     WHERE cm.conflict_severity = 'blocking'
       AND cm.resolved_at IS NULL
       AND cs_other.sd_key IS NOT NULL
       AND cs_other.status IN ('active', 'idle')
       AND EXTRACT(EPOCH FROM (NOW() - cs_other.heartbeat_at)) < 900
       AND cs_other.session_id != p_session_id
     LIMIT 1;

    IF v_conflict IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'blocking_conflict',
        'message', format('SD %s has blocking conflict with active SD %s', p_sd_id, v_conflict.active_sd),
        'conflict_type', v_conflict.conflict_type,
        'conflicting_sd', v_conflict.active_sd,
        'conflicting_session', v_conflict.active_session
      );
    END IF;
  END IF;

  IF v_takeover AND v_existing_session IS NOT NULL THEN
    UPDATE claude_sessions
       SET sd_key = NULL,
           track = NULL,
           claimed_at = NULL,
           released_at = NOW(),
           released_reason = v_takeover_reason,
           status = 'idle',
           updated_at = NOW(),
           worktree_path = NULL,
           worktree_branch = NULL
     WHERE session_id = v_existing_session;
  END IF;

  SELECT sd_key INTO v_evicted_sd_key
    FROM claude_sessions
   WHERE session_id = p_session_id
     AND sd_key IS NOT NULL
     AND sd_key != p_sd_id
     AND (v_sd_parent_id IS NULL OR sd_key != v_sd_parent_id);

  UPDATE claude_sessions
     SET sd_key = NULL,
         track = NULL,
         claimed_at = NULL,
         released_at = NOW(),
         released_reason = 'claim_switch',
         status = 'idle',
         worktree_path = NULL,
         worktree_branch = NULL
   WHERE session_id = p_session_id
     AND sd_key IS NOT NULL
     AND sd_key != p_sd_id
     AND (v_sd_parent_id IS NULL OR sd_key != v_sd_parent_id);

  GET DIAGNOSTICS v_evicted_row_count = ROW_COUNT;

  IF v_evicted_sd_key IS NOT NULL AND v_evicted_row_count > 0 THEN
    IF v_evicted_sd_key LIKE 'QF-%' THEN
      UPDATE quick_fixes
         SET claiming_session_id = NULL
       WHERE id = v_evicted_sd_key
         AND claiming_session_id = p_session_id;
    ELSE
      UPDATE strategic_directives_v2
         SET claiming_session_id = NULL,
             active_session_id = NULL,
             is_working_on = FALSE
       WHERE sd_key = v_evicted_sd_key
         AND claiming_session_id = p_session_id;
    END IF;

    GET DIAGNOSTICS v_evicted_clear_row_count = ROW_COUNT;

    IF v_evicted_clear_row_count > 0 THEN
      INSERT INTO session_lifecycle_events (
        event_type,
        session_id,
        reason,
        metadata
      ) VALUES (
        'CLAIM_SWITCH_EVICTED_CLEARED',
        p_session_id,
        'claim_switch',
        jsonb_build_object(
          'evicted_sd_key', v_evicted_sd_key,
          'new_sd_id', p_sd_id
        )
      )
      RETURNING id INTO v_evicted_clear_event_id;
    END IF;
  END IF;

  UPDATE claude_sessions
     SET sd_key = p_sd_id,
         track = p_track,
         claimed_at = NOW(),
         released_at = NULL,
         released_reason = NULL,
         heartbeat_at = NOW(),
         status = 'active'
   WHERE session_id = p_session_id;

  IF v_is_qf THEN
    UPDATE quick_fixes
       SET claiming_session_id = p_session_id,
           status = 'in_progress',
           started_at = COALESCE(started_at, NOW())
     WHERE id = p_sd_id;
  ELSE
    UPDATE strategic_directives_v2
       SET claiming_session_id = p_session_id,
           active_session_id = p_session_id,
           is_working_on = TRUE,
           claim_gate_client_version = p_client_gate_version
     WHERE sd_key = p_sd_id;
  END IF;

  IF v_takeover THEN
    INSERT INTO session_lifecycle_events (
      event_type,
      session_id,
      reason,
      metadata
    ) VALUES (
      CASE
        WHEN v_takeover_reason = 'auto_stale_takeover' THEN 'CLAIM_AUTO_RECLAIM'
        ELSE 'CLAIM_TAKEOVER'
      END,
      p_session_id,
      v_takeover_reason,
      jsonb_build_object(
        'sd_key', p_sd_id,
        'prior_session_id', v_existing_session,
        'prior_heartbeat_age_seconds', ROUND(COALESCE(v_existing_hb_age, 0)),
        'drift_detected', v_drift_detected,
        'force_authorized_by', CASE
          WHEN v_takeover_reason LIKE 'force_%' THEN v_takeover_reason
          ELSE NULL
        END,
        'sd_claiming_id_before', v_sd_claiming_id,
        'worktree_path_before', v_existing_wt_path,
        'worktree_branch_before', v_existing_wt_branch
      )
    )
    RETURNING id INTO v_audit_event_id;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', format('SD %s claimed successfully', p_sd_id),
    'sd_id', p_sd_id,
    'session_id', p_session_id,
    'track', p_track,
    'parent_preserved', v_sd_parent_id IS NOT NULL,
    'takeover', v_takeover,
    'takeover_reason', v_takeover_reason,
    'prior_session_id', v_existing_session,
    'prior_heartbeat_age_seconds', CASE
      WHEN v_existing_hb_age IS NOT NULL THEN ROUND(v_existing_hb_age)
      ELSE NULL
    END,
    'drift_detected', v_drift_detected,
    'evicted_sd_key', v_evicted_sd_key,
    'evicted_clear_event_id', v_evicted_clear_event_id,
    'audit_event_id', v_audit_event_id
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_overload_count int;
BEGIN
  SELECT count(*) INTO v_overload_count FROM pg_proc WHERE proname = 'claim_sd';
  IF v_overload_count != 1 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: expected exactly 1 claim_sd overload, found %', v_overload_count;
  END IF;
  RAISE NOTICE 'claim_sd: rolled back to parent-exclusion claim-switch behavior (pre-SD-LEO-INFRA-CLAIM-PARENT-CHILD-001).';
END $$;
