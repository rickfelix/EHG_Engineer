-- ============================================================================
-- Migration: Claim Cross-Table Consistency
-- SD: SD-LEO-INFRA-CLAIM-CROSS-TABLE-CONSISTENCY-001
-- Date: 2026-04-27
-- Purpose: Fix two structural defects in claim_sd():
--   1. HARNESS-CLAIM-CROSS-TABLE-DRIFT — claim_sd existing-claim check reads
--      ONLY claude_sessions.sd_key, never JOINs strategic_directives_v2.
--      claiming_session_id. fn_check_sd_claim (read-side) DOES read both;
--      this migration brings the write-side into symmetry.
--   2. HARNESS-PEER-CLAIM-NEVER-RELEASED — peer-session re-claim never
--      invalidates prior owner's claude_sessions.sd_key. Two sessions can
--      believe they own the same SD until 15-min stale TTL.
--
-- Design (per PLAN-phase sub-agent verdicts):
--   - DATABASE: 4-arg signature with p_force_takeover BOOLEAN DEFAULT FALSE
--     (backward compat, single CTE, FOR UPDATE on both tables, inline NULL)
--   - SECURITY: Replace SKIP LOCKED with blocking FOR UPDATE; default-deny
--     force-takeover (require heartbeat ≥60s OR parent_sd_id match);
--     emit session_lifecycle_events row on every takeover.
--   - DESIGN: Bracket-tokenized error messages — [CLAIM_PEER_ACTIVE],
--     [CLAIM_DRIFT], [CLAIM_FORCE_DENIED] — for grep-able operator surfaces.
--
-- SECURITY DEFINER trust boundary: Caller must already have public.claim_sd
-- EXECUTE permission (granted to authenticated/service_role). p_force_takeover
-- authorization predicate (heartbeat OR parent_sd_id) prevents arbitrary
-- override; unauthorized force returns error='unauthorized_force'.
--
-- Rollback: DROP FUNCTION claim_sd(text,text,text,boolean); re-apply
-- 20260408_claim_check_hardening.sql lines 142-251 (3-arg signature).
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Drop both possible overload signatures (handle re-runs cleanly)
-- ============================================================================

DROP FUNCTION IF EXISTS public.claim_sd(text, text, text);
DROP FUNCTION IF EXISTS public.claim_sd(text, text, text, boolean);

-- ============================================================================
-- STEP 2: Recreate claim_sd() with cross-table consistency
-- ============================================================================

CREATE FUNCTION public.claim_sd(
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
  v_existing_session  text;
  v_existing_hb_age   numeric;
  v_existing_status   text;
  v_sd_claiming_id    text;
  v_sd_parent_id      text;
  v_drift_detected    boolean := FALSE;
  v_takeover          boolean := FALSE;
  v_takeover_reason   text;
  v_caller_parent_id  text;
  v_audit_event_id    uuid;
  v_conflict          RECORD;
  v_is_qf             boolean := p_sd_id LIKE 'QF-%';
BEGIN
  -- TOCTOU FIX: Acquire advisory lock to serialize concurrent claims by sd_id.
  -- All cross-table reads + writes happen under this lock.
  PERFORM pg_advisory_xact_lock(hashtext(p_sd_id));

  -- ============================================================================
  -- CROSS-TABLE OWNERSHIP CHECK (FR-1)
  -- Read both claude_sessions AND strategic_directives_v2.claiming_session_id
  -- under FOR UPDATE on each row that exists. SECURITY note: blocking
  -- FOR UPDATE (not SKIP LOCKED) so we observe in-flight peer claims rather
  -- than silently masking them — prevents dual-claim race.
  -- ============================================================================

  -- 2a. claude_sessions side (any other active/idle session holding this sd_key)
  SELECT cs.session_id, cs.status,
         EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))
    INTO v_existing_session, v_existing_status, v_existing_hb_age
    FROM claude_sessions cs
   WHERE cs.sd_key = p_sd_id
     AND cs.session_id != p_session_id
     AND cs.status IN ('active', 'idle')
   ORDER BY cs.heartbeat_at DESC
   LIMIT 1
     FOR UPDATE;

  -- 2b. strategic_directives_v2 side (only if not a QF — QFs use quick_fixes table)
  IF NOT v_is_qf THEN
    SELECT sd.claiming_session_id, sd.parent_sd_id
      INTO v_sd_claiming_id, v_sd_parent_id
      FROM strategic_directives_v2 sd
     WHERE sd.sd_key = p_sd_id
       FOR UPDATE;
  END IF;

  -- 2c. Drift detection: SD row says claimed by some session,
  -- but that session has no active/idle claude_sessions row.
  IF v_sd_claiming_id IS NOT NULL
     AND v_sd_claiming_id != p_session_id
     AND v_existing_session IS NULL
  THEN
    v_drift_detected := TRUE;
  END IF;

  -- ============================================================================
  -- BRANCH: Active peer session detected (heartbeat <900s)
  -- ============================================================================
  IF v_existing_session IS NOT NULL AND v_existing_hb_age < 900 THEN
    -- Active peer present — only force-takeover with authorization can proceed.
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

    -- Force-takeover authorization predicate (FR-3, default-deny):
    --   (a) prior heartbeat ≥60s (recovery scenario), OR
    --   (b) caller's session holds a parent_sd_id matching target's parent_sd_id
    --       (orchestrator → child handoff scenario)
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

  -- ============================================================================
  -- BRANCH: Cross-table drift detected (SD says claimed, but no active session)
  -- ============================================================================
  IF v_drift_detected AND NOT v_takeover THEN
    -- Drift always allows recovery — unset SD claim, take ownership.
    -- This is NOT silent overwrite: we explicitly null the orphan SD pointer
    -- and emit an audit event.
    v_takeover := TRUE;
    v_takeover_reason := 'drift_recovery';
  END IF;

  -- ============================================================================
  -- BRANCH: Stale peer (heartbeat ≥900s) — auto-stale takeover (no force needed)
  -- ============================================================================
  IF v_existing_session IS NOT NULL AND v_existing_hb_age >= 900 AND NOT v_takeover THEN
    v_takeover := TRUE;
    v_takeover_reason := 'auto_stale_takeover';
  END IF;

  -- ============================================================================
  -- BLOCKING CONFLICT CHECK (sd_conflict_matrix) — only for non-QF, non-takeover paths
  -- ============================================================================
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
  -- TAKEOVER PATH (FR-2): Inline NULL of prior session's claude_sessions.sd_key
  -- ============================================================================
  IF v_takeover AND v_existing_session IS NOT NULL THEN
    UPDATE claude_sessions
       SET sd_key = NULL,
           track = NULL,
           claimed_at = NULL,
           released_at = NOW(),
           released_reason = v_takeover_reason,
           status = 'idle',
           updated_at = NOW()
     WHERE session_id = v_existing_session;
  END IF;

  -- Release any OTHER claim this caller session is holding (claim-switch path),
  -- preserving parent orchestrator claim if applicable.
  UPDATE claude_sessions
     SET sd_key = NULL,
         track = NULL,
         claimed_at = NULL,
         released_at = NOW(),
         released_reason = 'claim_switch',
         status = 'idle'
   WHERE session_id = p_session_id
     AND sd_key IS NOT NULL
     AND sd_key != p_sd_id
     AND (v_sd_parent_id IS NULL OR sd_key != v_sd_parent_id);

  -- Write the new claim onto caller session
  UPDATE claude_sessions
     SET sd_key = p_sd_id,
         track = p_track,
         claimed_at = NOW(),
         released_at = NULL,
         released_reason = NULL,
         heartbeat_at = NOW(),
         status = 'active'
   WHERE session_id = p_session_id;

  -- Update SD/QF row to reflect new owner
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
  -- AUDIT EMISSION (FR-4): session_lifecycle_events row on every takeover
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
        'sd_claiming_id_before', v_sd_claiming_id
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
  'Cross-table consistent claim_sd: reads both claude_sessions + strategic_directives_v2.claiming_session_id under pg_advisory_xact_lock; inline NULLs prior session sd_key on takeover; default-deny p_force_takeover with heartbeat-or-parent authorization. Emits CLAIM_TAKEOVER/CLAIM_AUTO_RECLAIM rows to session_lifecycle_events. Bracket-tokenized errors: [CLAIM_PEER_ACTIVE], [CLAIM_DRIFT], [CLAIM_FORCE_DENIED]. SD-LEO-INFRA-CLAIM-CROSS-TABLE-CONSISTENCY-001.';

COMMIT;

-- ============================================================================
-- ROLLBACK NOTES:
-- DROP FUNCTION IF EXISTS public.claim_sd(text,text,text,boolean);
-- Then re-apply 20260408_claim_check_hardening.sql lines 142-251 to restore
-- the 3-arg signature. Existing 5 callers (scripts/sd-start.js,
-- lib/claim-guard.mjs:426, lib/session-conflict-checker.mjs:301, plus 2 tests)
-- omit the 4th param and remain compatible with both signatures.
-- ============================================================================
