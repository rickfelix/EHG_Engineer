-- ============================================================================
-- Migration: 20260506000000_claim_dual_column_atomicity.sql
-- SD: SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001
-- Date: 2026-05-06
--
-- Purpose:
--   Close the dual-column-drift class on strategic_directives_v2: three sibling
--   release/transition functions clear active_session_id + is_working_on but
--   leave claiming_session_id populated, producing rows where a session has
--   formally exited yet still appears to "hold" the claim via claiming_session_id.
--
--   Live evidence (vetted at PLAN time):
--     45 SDs with drift; 36 with claiming_session_id set while
--     active_session_id IS NULL AND is_working_on = false.
--
--   release_sd (in 20260502_claim_sd_worktree_columns.sql) and claim_sd already
--   handle all three columns atomically. The fix is to bring three siblings to
--   the same invariant.
--
-- Sibling functions patched (CREATE OR REPLACE; signatures preserved verbatim):
--   1. release_session(text, text)              — graceful session exit
--   2. cleanup_stale_sessions(integer, integer) — stale-cleanup release
--   3. switch_sd_claim(text, text, text, text)  — old-SD release branch on switch
--
-- Bodies copied verbatim from 20260502_release_clear_worktree_state.sql with
-- the SOLE addition of `claiming_session_id = NULL` on each
-- strategic_directives_v2 UPDATE that previously cleared active_session_id +
-- is_working_on. No other clauses, no signature changes, no lock-order changes.
--
-- Backfill:
--   One-time UPDATE that nulls claiming_session_id on rows where the holding
--   session is no longer active/idle AND active_session_id is already NULL AND
--   is_working_on=false. Restricted to provably-orphaned rows only.
--
-- Idempotency:
--   * CREATE OR REPLACE is idempotent.
--   * Backfill predicate self-skips on re-run (no rows match after first apply).
--   * Wrapped in a single transaction so a partial application rolls back.
--
-- Search-path posture:
--   All three functions retain `SET search_path TO 'public'` where the prior
--   shipped body had it (release_session in 20260502 has no SET — preserved
--   verbatim, since adding one would change semantics versus what was deployed
--   and reviewed). SECURITY DEFINER preserved on the two functions that had it.
--
-- Advisory-lock posture:
--   None of these three siblings take advisory locks today (only claim_sd does,
--   via pg_advisory_xact_lock(hashtext(p_sd_id))). Adding an advisory lock here
--   would broaden scope; the existing FOR UPDATE SKIP LOCKED in
--   cleanup_stale_sessions and FOR UPDATE in switch_sd_claim already serialize
--   correctly against concurrent claim_sd. Out of scope for this SD.
--
-- DOWN: see ROLLBACK NOTES at end of file.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: release_session — graceful session exit.
-- Patched line: was `SET active_session_id = NULL, is_working_on = false`
--               now adds `claiming_session_id = NULL` to the same UPDATE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_session(p_session_id text, p_reason text DEFAULT 'graceful_exit')
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
    IF v_session.sd_key LIKE 'QF-%' THEN
      UPDATE quick_fixes
      SET claiming_session_id = NULL
      WHERE id = v_session.sd_key;
    ELSE
      UPDATE strategic_directives_v2
      SET claiming_session_id = NULL,
          active_session_id = NULL,
          is_working_on = false
      WHERE active_session_id = p_session_id
         OR claiming_session_id = p_session_id;
    END IF;
  END IF;

  UPDATE claude_sessions
  SET status = 'released',
      released_at = NOW(),
      released_reason = p_reason,
      sd_key = NULL,
      track = NULL,
      claimed_at = NULL,
      updated_at = NOW(),
      worktree_path = NULL,
      worktree_branch = NULL
  WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'released_at', NOW(),
    'reason', p_reason,
    'had_sd_claim', v_session.sd_key IS NOT NULL
  );
END;
$function$;

COMMENT ON FUNCTION public.release_session(text, text) IS
  'Graceful session exit. Atomically clears all three claim-state columns on strategic_directives_v2 (claiming_session_id, active_session_id, is_working_on) — the dual-column-atomicity invariant. SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001.';

-- ============================================================================
-- STEP 2: cleanup_stale_sessions — stale heartbeat → release CTE.
-- Patched line: the trailing `UPDATE strategic_directives_v2` that runs against
-- sessions just marked released by the CTE. Adds claiming_session_id=NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions(p_stale_threshold_seconds integer DEFAULT 120, p_batch_size integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stale_count INTEGER;
  v_released_count INTEGER;
BEGIN
  WITH stale_sessions AS (
    SELECT session_id
    FROM claude_sessions
    WHERE status = 'active'
      AND heartbeat_at < NOW() - (p_stale_threshold_seconds || ' seconds')::INTERVAL
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE claude_sessions cs
    SET status = 'stale',
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
        released_at = NOW(),
        released_reason = 'STALE_CLEANUP',
        sd_key = NULL,
        track = NULL,
        claimed_at = NULL,
        updated_at = NOW(),
        worktree_path = NULL,
        worktree_branch = NULL
    FROM release_sessions rs
    WHERE cs.session_id = rs.session_id
    RETURNING cs.session_id
  )
  SELECT COUNT(*) INTO v_released_count FROM released;

  UPDATE strategic_directives_v2
  SET claiming_session_id = NULL,
      active_session_id = NULL,
      is_working_on = false
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

  UPDATE quick_fixes
  SET claiming_session_id = NULL
  WHERE claiming_session_id IN (
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
$function$;

COMMENT ON FUNCTION public.cleanup_stale_sessions(integer, integer) IS
  'Stale-heartbeat cleanup. Atomically clears all three claim-state columns on strategic_directives_v2 (claiming_session_id, active_session_id, is_working_on) for SDs whose holding session was just released by the STALE_CLEANUP CTE — the dual-column-atomicity invariant. SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001.';

-- ============================================================================
-- STEP 3: switch_sd_claim — atomic transition between two SDs.
-- Patched line: the old-SD release branch (was `SET active_session_id = NULL,
-- is_working_on = false`) gains claiming_session_id = NULL.
-- The new-SD claim branch already sets all three columns and is unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.switch_sd_claim(p_session_id text, p_old_sd_id text, p_new_sd_id text, p_new_track text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_conflict RECORD;
BEGIN
  SELECT * INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or not active'
    );
  END IF;

  IF v_session.sd_key IS DISTINCT FROM p_old_sd_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Session does not hold claim on %s (current: %s)', p_old_sd_id, COALESCE(v_session.sd_key, 'none'))
    );
  END IF;

  SELECT session_id, sd_key INTO v_conflict
  FROM claude_sessions
  WHERE sd_key = p_new_sd_id
    AND status IN ('active', 'idle')
    AND session_id != p_session_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('SD %s is already claimed by session %s', p_new_sd_id, v_conflict.session_id),
      'conflict_session_id', v_conflict.session_id
    );
  END IF;

  IF p_old_sd_id LIKE 'QF-%' THEN
    UPDATE quick_fixes
    SET claiming_session_id = NULL
    WHERE id = p_old_sd_id;
  ELSE
    UPDATE strategic_directives_v2
    SET claiming_session_id = NULL,
        active_session_id = NULL,
        is_working_on = false
    WHERE sd_key = p_old_sd_id
      AND (active_session_id = p_session_id OR claiming_session_id = p_session_id);
  END IF;

  UPDATE claude_sessions
  SET
    sd_key = p_new_sd_id,
    track = COALESCE(p_new_track, track),
    claimed_at = NOW(),
    heartbeat_at = NOW(),
    updated_at = NOW(),
    worktree_path = NULL,
    worktree_branch = NULL
  WHERE session_id = p_session_id;

  IF p_new_sd_id LIKE 'QF-%' THEN
    UPDATE quick_fixes
    SET claiming_session_id = p_session_id,
        status = 'in_progress'
    WHERE id = p_new_sd_id;
  ELSE
    UPDATE strategic_directives_v2
    SET active_session_id = p_session_id,
        claiming_session_id = p_session_id,
        is_working_on = true
    WHERE sd_key = p_new_sd_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'old_sd_id', p_old_sd_id,
    'new_sd_id', p_new_sd_id,
    'switched_at', NOW()::TEXT
  );
END;
$function$;

COMMENT ON FUNCTION public.switch_sd_claim(text, text, text, text) IS
  'Atomic SD-to-SD claim transition. Old-SD release branch atomically clears all three claim-state columns on strategic_directives_v2 (claiming_session_id, active_session_id, is_working_on) — the dual-column-atomicity invariant. New-SD claim branch already set all three. SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001.';

-- ============================================================================
-- STEP 4: Cross-reference invariant comment on release_sd.
-- (release_sd body unchanged — already correct in 20260502_claim_sd_worktree_columns.sql.)
-- ============================================================================

COMMENT ON FUNCTION public.release_sd(text, text) IS
  'Manual SD release. Atomically clears all three claim-state columns on strategic_directives_v2 (claiming_session_id, active_session_id, is_working_on) AND clears worktree_path / worktree_branch on claude_sessions — the dual-column-atomicity invariant. SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-1) + SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001 (cross-reference).';

-- ============================================================================
-- STEP 5: One-time backfill — drop orphan claiming_session_id values.
-- Predicate is conservative: only nulls rows where
--   * active_session_id IS NULL
--   * is_working_on = false
--   * claiming_session_id IS NOT NULL
--   * claiming_session_id is NOT a currently active/idle session
-- This means we only touch provably-orphaned rows; any row where the holding
-- session is still alive is left alone, even if it appears drifted.
-- ============================================================================

DO $backfill$
DECLARE
  v_rows_affected INTEGER;
BEGIN
  WITH backfilled AS (
    UPDATE strategic_directives_v2 sd
    SET claiming_session_id = NULL
    WHERE sd.active_session_id IS NULL
      AND sd.is_working_on = false
      AND sd.claiming_session_id IS NOT NULL
      AND sd.claiming_session_id NOT IN (
        SELECT session_id
        FROM claude_sessions
        WHERE status IN ('active', 'idle')
      )
    RETURNING sd.sd_key
  )
  SELECT COUNT(*) INTO v_rows_affected FROM backfilled;

  RAISE NOTICE '[SD-LEO-INFRA-CLAIM-DUAL-COLUMN-001] Backfill cleared claiming_session_id on % orphaned strategic_directives_v2 rows.', v_rows_affected;
END;
$backfill$;

COMMIT;

-- ============================================================================
-- ROLLBACK NOTES:
--
-- Functions: re-apply database/migrations/20260502_release_clear_worktree_state.sql
--   to restore the prior bodies of release_session, cleanup_stale_sessions,
--   and switch_sd_claim (which omit claiming_session_id from the SD update).
--   release_sd and claim_sd are not modified by this migration; their bodies in
--   20260502_claim_sd_worktree_columns.sql remain canonical.
--
-- Backfill: NOT REVERSIBLE in a forward-safe way. Once the orphan
--   claiming_session_id values are nulled, the prior values are not retained.
--   This is by design — those values referenced sessions that were already
--   released/expired and could no longer hold a valid claim. If forensic data
--   is needed, query session_lifecycle_events for the original claim emission.
--
-- Risk register (PLAN-time):
--   R1 — Wrong predicate could null an active session's claim.
--        Mitigation: predicate requires active_session_id IS NULL AND
--        is_working_on = false AND claiming_session_id NOT IN (active|idle
--        sessions). Defense-in-depth: even if claim_sd raced with backfill,
--        claim_sd holds pg_advisory_xact_lock(hashtext(p_sd_id)) and
--        FOR UPDATE on the SD row, so the backfill UPDATE would block.
--   R2 — Unintentional behavior change in release_session OR-clause.
--        Original cleared by `WHERE active_session_id = p_session_id`. New
--        body widens to `OR claiming_session_id = p_session_id` so the dual-
--        column path triggers when a session was orphaned but never held the
--        active_session slot. Same widening applied in cleanup_stale_sessions.
--        Risk: if a session erroneously has claiming_session_id pointing at it
--        without owning the SD, this releases that ghost claim — desirable.
--   R3 — search_path on release_session.
--        20260502 release_session has no SET search_path (intentional or
--        oversight in prior ship). Preserved verbatim here to avoid silent
--        semantic change. Out-of-scope hardening tracked separately.
-- ============================================================================
