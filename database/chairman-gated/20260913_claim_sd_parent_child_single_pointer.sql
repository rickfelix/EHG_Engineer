-- database/chairman-gated/20260913_claim_sd_parent_child_single_pointer.sql
-- @chairman-gated
-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-CLAIM-PARENT-CHILD-001
--
-- BUG: claim_sd's claim-switch eviction predicate (database/migrations/
-- 20260903_claim_sd_symmetric_clear_returning_fix.sql:442,458) deliberately skips evicting a
-- session's orchestrator-PARENT claim when that session claims one of the parent's children --
-- both statements end `AND (v_sd_parent_id IS NULL OR sd_key != v_sd_parent_id)`. Because the
-- capture SELECT also excludes the parent, v_evicted_sd_key stays NULL for it, so the
-- symmetric-clear block never fires: strategic_directives_v2 ends up with BOTH the parent and
-- child rows holding the same claiming_session_id, while claude_sessions.sd_key (the session-side
-- claim mirror, surfaced via v_active_sessions) shows only the child. Recorded as "STILL OPEN" in
-- commit 8fd59ab2c3c (2026-08-03, SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-002 FR-6) and rediscovered
-- at least twice since without closure.
--
-- FIX (option (a), this SD's own sourced recommendation): remove the parent-exclusion clause from
-- BOTH the pre-UPDATE capture SELECT and the claim-switch UPDATE, so a session's prior claim is
-- evicted symmetrically regardless of whether it happens to be the parent of the SD now being
-- claimed. One session, one claim pointer, no exception. The now-released parent is re-adopted by
-- the SAME session once its child reaches a terminal status -- handled separately, in JS, by
-- scripts/worker-checkin.cjs's existing orphan re-adopt path (adoptOrphanInProgress /
-- parentLeadPending), extended by this SD's companion commit. This migration only removes the
-- skip; it does not need to know about re-adoption.
--
-- Also corrects the `parent_preserved` result field (line 587 of the base file): it was set to
-- `v_sd_parent_id IS NOT NULL` -- true whenever the claimed SD has ANY parent, regardless of
-- whether a parent-claim-switch was actually skipped. That behavior no longer exists after this
-- fix, so the field is now hardcoded FALSE rather than left asserting something false. The key is
-- kept (not removed) so a caller that merely logs it sees an explicit, honest value instead of a
-- missing key.
--
-- Everything else -- every other guard, branch, comment, and the function signature -- is
-- preserved byte-for-byte from database/migrations/20260903_claim_sd_symmetric_clear_returning_fix.sql.
-- Signature is UNCHANGED (still 5 args, same defaults) -- CREATE OR REPLACE is safe, no DROP needed.
--
-- STAGED ONLY: this file is committed but NOT applied by this SD's own worker. Application happens
-- at an Adam chairman-gated ceremony, with a readback confirming the live function body matches
-- this file. See the _DOWN.sql sibling for the exact rollback (restores the pre-fix body
-- byte-for-byte).

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
  -- SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001: QF-side counterparts of v_sd_claiming_id /
  -- v_sd_claim_hb_age, feeding the new QF live-foreign-claim guard below.
  v_qf_claiming_id      text;
  v_qf_claim_hb_age     numeric;
  -- SD-LEO-INFRA-CLAIM-RPC-HONOR-001: armed-silence-window awareness (parity with cleanup_stale_sessions).
  v_respect_inflight       boolean := FALSE;
  v_ttl_minutes            integer := 15;
  v_hardcap_minutes        integer := 45;
  v_existing_silence_until timestamptz;
  v_sd_claim_silence_until timestamptz;
  -- SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-4): the sd_key/QF-id evicted by the
  -- claim-switch UPDATE below. SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A: now captured via a
  -- preceding SELECT (the OLD value), never via RETURNING on the destructive UPDATE
  -- itself (which always yields the NEW, post-SET value).
  v_evicted_sd_key         text;
  v_evicted_clear_event_id uuid;
  -- Deep-tier adversarial review (SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A): the preceding SELECT
  -- and the claim-switch UPDATE below are two separate statements (no FOR UPDATE lock between
  -- them), so a concurrent retry for the same p_session_id could leave v_evicted_sd_key stale
  -- relative to what the UPDATE actually affects. v_evicted_row_count guards the symmetric-clear
  -- block from firing on that stale value when the UPDATE affected zero rows.
  v_evicted_row_count      integer;
  -- Same review, second round: gates the audit INSERT on the NESTED strategic_directives_v2 /
  -- quick_fixes UPDATE also having matched a row, so the audit trail cannot overcount clears
  -- relative to what actually happened on the SD/QF side (those pointers can drift independently
  -- from claude_sessions.sd_key -- that drift is exactly what this whole block exists to fix).
  v_evicted_clear_row_count integer;
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

    -- SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001: capture the QF-side claimant's heartbeat age so the
    -- QF live-foreign-claim guard below can refuse to stomp a LIVE peer even when its session-side
    -- claude_sessions.sd_key pointer has drifted out of sync with quick_fixes.claiming_session_id.
    -- Mirrors the SD-side capture above (SD-LEO-FIX-CLAIM-RPC-REFUSE-001) variable-for-variable.
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

  -- SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001: QF-branch counterpart of the SD live-foreign-claim
  -- guard immediately above. Without this, a QF whose quick_fixes.claiming_session_id names a
  -- still-live session (drifted claude_sessions.sd_key) could be silently claimed out from
  -- under it. Mirrors the SD guard's condition/message/return shape exactly.
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

  -- SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A: capture the CALLING session's OLD sd_key (if any is
  -- about to be evicted by the claim-switch UPDATE below) via a plain SELECT, BEFORE that UPDATE
  -- runs -- never via that UPDATE's own RETURNING, which reflects the row's NEW (post-SET-NULL)
  -- values, not its old ones. PostgreSQL 17.4 has no RETURNING OLD.col syntax; this is the
  -- correct, minimal way to read a row's pre-UPDATE state in plpgsql. Identical predicate to the
  -- UPDATE immediately below, so it selects the SAME row (or none) that the UPDATE will affect.
  --
  -- SD-LEO-INFRA-CLAIM-PARENT-CHILD-001: the parent-exclusion clause
  -- (`AND (v_sd_parent_id IS NULL OR sd_key != v_sd_parent_id)`) that used to guard this SELECT is
  -- REMOVED. A session's prior claim is now evicted symmetrically whether or not it is the parent
  -- of the SD being claimed -- one session, one claim pointer.
  SELECT sd_key INTO v_evicted_sd_key
    FROM claude_sessions
   WHERE session_id = p_session_id
     AND sd_key IS NOT NULL
     AND sd_key != p_sd_id;

  -- Claim-switch path: caller is releasing some OTHER SD to claim p_sd_id. v_evicted_sd_key was
  -- already captured above (pre-UPDATE); this UPDATE no longer relies on RETURNING for it.
  --
  -- SD-LEO-INFRA-CLAIM-PARENT-CHILD-001: same parent-exclusion removal as the capture SELECT
  -- above, so this UPDATE affects the SAME row (or none) that the SELECT read from.
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
     AND sd_key != p_sd_id;

  GET DIAGNOSTICS v_evicted_row_count = ROW_COUNT;

  -- SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 (FR-4): symmetric clear of the EVICTED SD's/QF's
  -- claim pointer. The claim-switch UPDATE above only clears the CALLING SESSION's
  -- claude_sessions row; without this, strategic_directives_v2.claiming_session_id (or
  -- quick_fixes.claiming_session_id) on the evicted item was never cleared, leaving it
  -- looking claimed by a session that has since moved to a different SD (RCA QF-20260712-310).
  -- Guarded by `claiming_session_id = p_session_id` so this never clobbers a claim some OTHER
  -- session has since legitimately taken on the evicted item.
  -- v_evicted_row_count > 0 confirms the claim-switch UPDATE above actually affected the row
  -- v_evicted_sd_key was read from (deep-tier adversarial review, SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A):
  -- without it, a concurrent retry racing the unlocked SELECT could fire this block, and the
  -- CLAIM_SWITCH_EVICTED_CLEARED audit event, on a stale value the UPDATE never actually applied.
  -- SD-LEO-INFRA-CLAIM-PARENT-CHILD-001: this block now also fires for an evicted PARENT -- the
  -- parent's strategic_directives_v2 row gets claiming_session_id cleared exactly like any other
  -- evicted SD. Re-adoption (re-claiming the parent once the child reaches a terminal status) is
  -- handled separately, in JS, by scripts/worker-checkin.cjs -- this function does not re-claim
  -- anything on its own.
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

    -- SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-A (success criterion #3): the symmetric clear had NO
    -- durable trail at all before this fix, making its production fire-rate unverifiable. One
    -- row per actual clear, so `SELECT count(*) FROM session_lifecycle_events WHERE event_type
    -- = 'CLAIM_SWITCH_EVICTED_CLEARED'` is the re-verifiable instrument this criterion asks for.
    -- Gated on v_evicted_clear_row_count > 0 (deep-tier adversarial review, round 2): without
    -- this, the nested UPDATE above matching zero rows (the SD/QF side already cleared or
    -- re-claimed by someone else) would still log a CLEARED event, overstating the real count.
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
    -- SD-LEO-INFRA-QF-CLAIM-PEER-GUARD-001: stamp started_at on claim, parity with
    -- scripts/create-quick-fix.js's one-time creation-claim stamp. COALESCE preserves the
    -- original start time across a takeover/re-claim rather than resetting it.
    UPDATE quick_fixes
       SET claiming_session_id = p_session_id,
           status = 'in_progress',
           started_at = COALESCE(started_at, NOW())
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
    -- SD-LEO-INFRA-CLAIM-PARENT-CHILD-001: hardcoded FALSE -- the parent-exclusion behavior this
    -- field used to describe no longer exists (see the capture SELECT / UPDATE above). Kept as a
    -- key (not removed) so a caller that merely logs/reads it sees an explicit, honest value
    -- rather than a missing key.
    'parent_preserved', FALSE,
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
  RAISE NOTICE 'claim_sd: exactly one overload confirmed (5-arg, parent-exclusion removed, single-pointer fix applied).';
END $$;
