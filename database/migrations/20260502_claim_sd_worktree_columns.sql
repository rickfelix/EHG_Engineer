-- ============================================================================
-- Migration: Atomic worktree-state clear in claim_sd + release_sd
-- SD: SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-1)
-- Date: 2026-05-02
-- Purpose: Close the partial-state class where claude_sessions rows ended up
--          with sd_key=NULL but worktree_path / worktree_branch left populated.
--          That stale state was inherited by the next /leo start and resolved
--          to the wrong worktree directory.
--
-- Changes vs prior versions of these functions:
--   * claim_sd takeover UPDATE (prior session inheritance):
--       + worktree_path = NULL, worktree_branch = NULL
--   * claim_sd claim-switch UPDATE (caller's other claim):
--       + worktree_path = NULL, worktree_branch = NULL
--   * claim_sd new-claim UPDATE (caller takes p_sd_id):
--       UNCHANGED — sd-start.js writes worktree_path / worktree_branch via
--       lib/lifecycle/worktree-state-writer.mjs AFTER createWorktree succeeds.
--   * release_sd UPDATE:
--       + worktree_path = NULL, worktree_branch = NULL
--   * Audit metadata on CLAIM_TAKEOVER / CLAIM_AUTO_RECLAIM gains
--       worktree_path_before, worktree_branch_before — preserves diagnostic
--       value (Risk #1 mitigation) even though the live row clears.
--
-- Signatures preserved exactly (4-arg claim_sd, 2-arg release_sd with default).
-- Backward compatibility per TR-1.
--
-- DOWN: re-apply database/migrations/20260427_claim_sd_cross_table_consistency.sql
--       and reinstall the prior release_sd body. See ROLLBACK NOTES below.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Re-create claim_sd with worktree-column NULLing on takeover/switch
-- ============================================================================

DROP FUNCTION IF EXISTS public.claim_sd(text, text, text, boolean);

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
    SELECT sd.claiming_session_id, sd.parent_sd_id
      INTO v_sd_claiming_id, v_sd_parent_id
      FROM strategic_directives_v2 sd
     WHERE sd.sd_key = p_sd_id
       FOR UPDATE;
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

-- ============================================================================
-- STEP 2: Re-create release_sd to also NULL the worktree columns
-- ============================================================================

DROP FUNCTION IF EXISTS public.release_sd(text, text);
DROP FUNCTION IF EXISTS public.release_sd(text);

CREATE FUNCTION public.release_sd(p_session_id text, p_reason text DEFAULT 'manual')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sd_key TEXT;
BEGIN
  SELECT sd_key INTO v_sd_key
  FROM claude_sessions
  WHERE session_id = p_session_id;

  IF v_sd_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No SD to release'
    );
  END IF;

  UPDATE claude_sessions
     SET sd_key = NULL,
         track = NULL,
         claimed_at = NULL,
         released_at = NOW(),
         released_reason = p_reason,
         heartbeat_at = NOW(),
         status = 'idle',
         worktree_path = NULL,
         worktree_branch = NULL
   WHERE session_id = p_session_id;

  IF v_sd_key LIKE 'QF-%' THEN
    UPDATE quick_fixes
       SET claiming_session_id = NULL
     WHERE id = v_sd_key;
  ELSE
    UPDATE strategic_directives_v2
       SET claiming_session_id = NULL,
           active_session_id = NULL,
           is_working_on = false
     WHERE sd_key = v_sd_key
       AND (active_session_id = p_session_id OR claiming_session_id = p_session_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'released_sd', v_sd_key,
    'reason', p_reason,
    'released_at', NOW()
  );
END;
$function$;

COMMENT ON FUNCTION public.release_sd(text, text) IS
  'Releases a session''s SD claim and atomically NULLs worktree_path / worktree_branch. SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-1).';

COMMIT;

-- ============================================================================
-- ROLLBACK NOTES:
--
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.claim_sd(text,text,text,boolean);
--   DROP FUNCTION IF EXISTS public.release_sd(text,text);
--   -- Re-apply database/migrations/20260427_claim_sd_cross_table_consistency.sql
--   -- to restore the prior claim_sd (without worktree NULLing).
--   -- For release_sd, restore the prior body via psql or a follow-up migration
--   -- (the prior body is preserved in git history, last shipped before this
--   -- migration). See feedback memory
--   -- reference_pr_tracking_canonical_join_ship_review_findings.md for context.
-- COMMIT;
--
-- After rollback, partial-state rows can re-emerge. The lib/lifecycle/
-- worktree-state-writer.mjs module (Phase 1) and the FR-5 CHECK constraint
-- (Phase 4) provide defense-in-depth, so a temporary rollback to the prior
-- SQL is recoverable.
-- ============================================================================
