-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-FIX-CLAIM-RPC-REFUSE-001
-- claim_sd RPC: refuse to overwrite a LIVE foreign claim (RPC-level dedup guard).
--
-- Bug: claim_sd's drift_recovery path auto-takes the SD-side claim (strategic_directives_v2.
-- claiming_session_id) when no matching session-side pointer (claude_sessions.sd_key) is found —
-- WITHOUT checking whether the SD-side claimant is itself LIVE. So when a live worker holds the
-- SD-side claim but its session pointer is momentarily out of sync (after a defer/sweep/clear), a
-- second self-claiming worker stomps it (observed dce9048d vs 6f1b235c ping-ponging one candidate).
-- The session-side live-foreign refusal (v_existing_session, hb<900) only covers a live peer whose
-- claude_sessions.sd_key still equals p_sd_id; it misses the SD-side-only live claim.
--
-- Fix: capture the SD-side claimant heartbeat age (v_sd_claim_hb_age) and, before the drift_recovery
-- takeover, REFUSE (return {success:false, error:'claimed_by_live_peer'}) when that claimant is a
-- LIVE foreign session (fresh heartbeat < 900s) and p_force_takeover is false. Stale claimants
-- (hb >= 900s) and orphaned/absent sessions still fall through to auto_stale_takeover / drift_recovery;
-- --force still takes over. Generated programmatically from 20260609_claim_sd_terminal_status_guard.sql
-- via exact-string-insert; the rest of the function is carried VERBATIM. CREATE OR REPLACE with the
-- unchanged claim_sd(text,text,text,boolean) signature, so EXECUTE grants are preserved. Out of scope:
-- checkin-side advisory (isSdInFlight) + terminal-status guard (CLAIM-RPC-TERMINAL-001, shipped).

CREATE OR REPLACE FUNCTION public.claim_sd(
  p_sd_id          text,
  p_session_id     text,
  p_track          text,
  p_force_takeover boolean DEFAULT FALSE
)
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
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_sd_id));

  -- 2a. Capture prior session's worktree state (for audit metadata) under the
  --     SAME FOR UPDATE row lock as the existing-session check.
  SELECT cs.session_id, cs.status,
         EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)),
         cs.worktree_path, cs.worktree_branch
    INTO v_existing_session, v_existing_status, v_existing_hb_age,
         v_existing_wt_path, v_existing_wt_branch
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
    -- optimistically returning success. claim_sd was OPTIMISTIC — a typo / stale sd_key used
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
    IF v_sd_claiming_id IS NOT NULL AND v_sd_claiming_id != p_session_id THEN
      SELECT EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))
        INTO v_sd_claim_hb_age
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

  IF v_drift_detected AND NOT v_takeover THEN
    v_takeover := TRUE;
    v_takeover_reason := 'drift_recovery';
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
    UPDATE strategic_directives_v2
       SET claiming_session_id = p_session_id,
           active_session_id = p_session_id,
           is_working_on = TRUE
     WHERE sd_key = p_sd_id;
  END IF;

  -- ============================================================================
  -- AUDIT EMISSION: gains worktree_path_before / worktree_branch_before
  -- per TR-1 risk-mitigation observability addition.
  -- ============================================================================
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
    'audit_event_id', v_audit_event_id
  );
END;
$function$;

COMMENT ON FUNCTION public.claim_sd(text, text, text, boolean) IS
  'Cross-table consistent claim_sd with atomic worktree-state clearing on takeover and claim-switch. Worktree columns left NULL on the new-claim UPDATE — sd-start.js writes them via lib/lifecycle/worktree-state-writer.mjs after createWorktree. Audit metadata includes worktree_path_before / worktree_branch_before. SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-1).';
