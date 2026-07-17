-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-BLOCK-TEST-SESSION-001 (FR-1)
--
-- RCA: claim_sd() never validated that the CALLING p_session_id has a live row in
-- claude_sessions before writing the claim. The terminal `UPDATE claude_sessions SET
-- sd_key=p_sd_id ... WHERE session_id=p_session_id` silently no-ops when no row matches,
-- but the paired `UPDATE strategic_directives_v2 SET claiming_session_id=p_session_id ...`
-- runs unconditionally -- so a phantom/never-registered session_id (witnessed live incident:
-- test-session-nswcf-fenced, zero rows in claude_sessions) can claim a real SD/QF and strand
-- it. Mirrors the existing session_not_found idiom already used by release_session()
-- (database/migrations/20260408_claim_check_hardening.sql).
--
-- A test-session-*-fenced regex fence was considered and DROPPED: tests/database/
-- seat-busy-fence.test.js deliberately registers a REAL claude_sessions row for session_id
-- literally 'test-session-nswcf-fenced' to exercise unrelated seat-busy-fence/checkin logic
-- via the real worker-checkin.cjs CLI -- a regex fence would reject that legitimately
-- registered session and corrupt that test's intent. The NOT-EXISTS check alone is durable
-- (the witnessed incident session had zero claude_sessions rows) and does not collide with it.
--
-- Signature is UNCHANGED (still 5 args, same defaults) -- CREATE OR REPLACE is safe here,
-- no DROP needed (same precedent as 20260704_claim_sd_client_gate_version.sql).
--
-- The body below is the LIVE production claim_sd() definition (database/migrations/
-- 20260712_claim_sd_claim_switch_clobber_guard.sql) with exactly ONE behavioral addition,
-- marked below: a phantom-session existence guard immediately after the advisory lock,
-- before any other read. Every existing guard, comment, and provenance note is preserved
-- verbatim so this migration is a pure additive change.

CREATE OR REPLACE FUNCTION public.claim_sd(p_sd_id text, p_session_id text, p_track text, p_force_takeover boolean DEFAULT false, p_client_gate_version integer DEFAULT NULL)
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
  -- SD-LEO-INFRA-CLAIM-RPC-HONOR-001: armed-silence-window awareness (parity with cleanup_stale_sessions).
  v_respect_inflight       boolean := FALSE;
  v_ttl_minutes            integer := 15;
  v_hardcap_minutes        integer := 45;
  v_existing_silence_until timestamptz;
  v_sd_claim_silence_until timestamptz;
  -- SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-4): the sd_key/QF-id evicted by the
  -- claim-switch UPDATE below, captured so its SD/QF-side claim pointer can be cleared.
  v_evicted_sd_key         text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_sd_id));

  -- SD-LEO-INFRA-BLOCK-TEST-SESSION-001 (FR-1): reject a claim from a session_id with NO
  -- live claude_sessions row. Real sessions always upsert into claude_sessions at
  -- SessionStart (session-register.cjs hook) before ever calling claim_sd, so this never
  -- rejects a genuine worker. Fires before any other read/lock (SD or QF path), so it
  -- applies uniformly to both.
  IF NOT EXISTS (SELECT 1 FROM claude_sessions WHERE session_id = p_session_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'phantom_session',
      'message', format('[CLAIM_PHANTOM_SESSION] session_id %s has no live claude_sessions row — refusing to claim %s.', p_session_id, p_sd_id));
  END IF;

  -- SD-LEO-INFRA-CLAIM-RPC-HONOR-001: read the SAME respect-in-flight flag cleanup_stale_sessions
  -- uses, so the sweep and the claim arbiter never disagree about an armed silence window. FAIL-OPEN:
  -- any error leaves the flag OFF (today's reap-on-stale behavior).
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
  -- Hard-cap ceiling = max in-flight silence window (30 min) + claim TTL margin; beyond this no
  -- expected_silence_until can wedge a dead claim open forever. Mirrors cleanup_stale_sessions.
  v_hardcap_minutes := 30 + GREATEST(COALESCE(v_ttl_minutes, 15), 0);

  -- 2a. Capture prior session's worktree state (for audit metadata) under the
  --     SAME FOR UPDATE row lock as the existing-session check.
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
    -- SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001: reject phantom (non-existent) SD ids instead of
    -- optimistically returning success. claim_sd was OPTIMISTIC -- a typo / stale sd_key used
    -- to self-claim a non-existent SD and write claude_sessions.sd_key. The existing FOR UPDATE
    -- SELECT above sets FOUND only when an sd_key row exists, so this is the minimal guard.
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_not_found',
        'message', format('[CLAIM_SD_NOT_FOUND] SD %s does not exist in strategic_directives_v2 — refusing to claim a phantom id.', p_sd_id));
    END IF;
    -- SD-LEO-FIX-CLAIM-RPC-TERMINAL-001: terminal-status guard. Refuse to claim an SD whose
    -- lifecycle has already ended (completed/cancelled/deferred) instead of optimistically
    -- stomping claiming_session_id. Orthogonal to the sd_not_found guard above; fires BEFORE
    -- the claim UPDATE so it pre-empts trigger 393's raw P0001 with a clean structured failure
    -- and additionally covers completed/deferred which that cancelled-only trigger does not.
    IF v_sd_status IN ('completed', 'cancelled', 'deferred') THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_terminal_status',
        'status', v_sd_status,
        'message', format('[CLAIM_SD_TERMINAL] SD %s is in terminal status %s — refusing to claim a finished/cancelled/deferred SD.', p_sd_id, v_sd_status));
    END IF;

    -- SD-LEO-FIX-CLAIM-RPC-REFUSE-001: capture the SD-side claimant's heartbeat age so the
    -- live-foreign-claim guard below can refuse to stomp a LIVE peer even when its session-side
    -- claude_sessions.sd_key pointer has drifted out of sync with the SD-side claiming_session_id.
    -- SD-LEO-INFRA-CLAIM-RPC-HONOR-001: also capture its expected_silence_until for the silence guard.
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
    -- SD-FDBK-FIX-CLAIM-RPC-VALIDATE-001: same guard for the QF path (claim_sd resolves QFs
    -- by quick_fixes.id = p_sd_id, mirrored from the QF UPDATE below).
    SELECT qf.status INTO v_qf_status FROM quick_fixes qf WHERE qf.id = p_sd_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_not_found',
        'message', format('[CLAIM_QF_NOT_FOUND] Quick-fix %s does not exist in quick_fixes — refusing to claim a phantom id.', p_sd_id));
    END IF;
    -- SD-LEO-FIX-CLAIM-RPC-TERMINAL-001: QF terminal-status guard. 'escalated' is a one-way
    -- promotion to a full SD (classify-quick-fix.js never reverts it), so claiming an escalated
    -- QF resumes superseded work. Mirrors the SD terminal guard; fires before the QF UPDATE.
    IF v_qf_status IN ('completed', 'cancelled', 'escalated') THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'sd_terminal_status',
        'status', v_qf_status,
        'message', format('[CLAIM_QF_TERMINAL] Quick-fix %s is in terminal status %s — refusing to claim a finished/cancelled/escalated quick-fix.', p_sd_id, v_qf_status));
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

  -- SD-LEO-FIX-CLAIM-RPC-REFUSE-001: refuse to overwrite a claim held by a LIVE foreign session.
  -- The session-side refusal above only fires when the live peer's claude_sessions.sd_key still
  -- equals p_sd_id; it misses the case where only the SD-side claim (claiming_session_id) points
  -- to a still-live session whose session pointer drifted. Without this guard the drift_recovery
  -- takeover below would silently stomp that live peer. A stale claimant (hb >= 900s) or an absent
  -- session leaves v_sd_claim_hb_age NULL / >= 900 and still falls through to takeover; --force too.
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

  -- SD-LEO-INFRA-CLAIM-RPC-HONOR-001: drift_recovery choke point. If the SD-side claimant is a
  -- parked worker inside its armed silence window (flag ON, window in the future, heartbeat within
  -- the hard-cap ceiling), refuse to reap it. --force and expired / beyond-cap windows still take
  -- over (this guard requires NOT p_force_takeover and a future window <= hard-cap). Mutually
  -- exclusive with the auto_stale guard below: v_drift_detected implies v_existing_session IS NULL.
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

  -- SD-LEO-INFRA-CLAIM-RPC-HONOR-001: auto_stale_takeover choke point. A session silent past 900s
  -- but inside its armed silence window (flag ON, within the hard-cap ceiling) is a PARKED worker,
  -- not a dead one — refuse the auto-stale takeover. --force and expired / beyond-cap windows still
  -- reap (a window beyond the 45-min hard-cap, or already past, falls through to takeover below).
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

  -- ============================================================================
  -- TAKEOVER PATH: NULL the prior session's claim AND its worktree state.
  -- (FR-1 of SD-LEO-INFRA-LEO-INFRA-SESSION-001 — only the worktree_* columns
  -- are new vs. 20260427.)
  -- ============================================================================
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

  -- Claim-switch path: caller is releasing some OTHER SD to claim p_sd_id.
  -- SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-4): RETURNING captures the evicted sd_key
  -- (NULL if no row matched) so its own claim pointer can be cleared symmetrically below.
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
     AND (v_sd_parent_id IS NULL OR sd_key != v_sd_parent_id)
   RETURNING sd_key INTO v_evicted_sd_key;

  -- SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-4): symmetric clear of the EVICTED SD's/QF's
  -- claim pointer. The claim-switch UPDATE above only clears the CALLING SESSION's
  -- claude_sessions row; without this, strategic_directives_v2.claiming_session_id (or
  -- quick_fixes.claiming_session_id) on the evicted item was never cleared, leaving it
  -- looking claimed by a session that has since moved to a different SD (RCA QF-20260712-310).
  -- Guarded by `claiming_session_id = p_session_id` so this never clobbers a claim some OTHER
  -- session has since legitimately taken on the evicted item.
  IF v_evicted_sd_key IS NOT NULL THEN
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
  END IF;

  -- New-claim UPDATE intentionally does NOT set worktree_path / worktree_branch.
  -- sd-start.js writes them via lib/lifecycle/worktree-state-writer.mjs after
  -- createWorktree completes. Keeping them NULL here means the FR-5 CHECK
  -- constraint is never violated transiently.
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
           status = 'in_progress'
     WHERE id = p_sd_id;
  ELSE
    -- SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001 (FR-2): the ONLY behavioral addition to this
    -- function -- stamp the caller's gate-code version on the SD-side claim mirror so the
    -- observe-only trigger (next migration) can compare it against the version-floor.
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
    'audit_event_id', v_audit_event_id
  );
END;
$function$;

-- Prompt PostgREST to reload its schema cache promptly (unchanged signature, but the
-- function body changed).
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_overload_count int;
BEGIN
  SELECT count(*) INTO v_overload_count FROM pg_proc WHERE proname = 'claim_sd';
  IF v_overload_count != 1 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: expected exactly 1 claim_sd overload, found %', v_overload_count;
  END IF;
  RAISE NOTICE 'claim_sd: exactly one overload confirmed (5-arg, phantom-session guard added).';
END $$;
