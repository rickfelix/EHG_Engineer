-- 20260502_release_clear_worktree_state.sql
--
-- Closes feedback row 35c8e3ef-c5e2-... (filed 2026-05-02): every release path
-- in 20260408_claim_check_hardening.sql NULL-clears sd_key, track, claimed_at
-- when releasing a claim, but leaves claude_sessions.worktree_path and
-- claude_sessions.worktree_branch populated from the prior claim. The next
-- /leo start <NEW-SD> reads those columns via sd-start.js's
-- worktree.resolved (source=db) and points the operator at the WRONG worktree
-- path. Risk: working in the wrong worktree corrupts unrelated SD branches
-- with unmerged commits.
--
-- Forward-only fix: re-CREATE OR REPLACE the four release/transition functions
-- to also NULL worktree_path and worktree_branch on the claude_sessions UPDATE.
--   1. release_sd            (manual release of an SD claim)
--   2. release_session       (graceful session exit)
--   3. cleanup_stale_sessions (stale-cleanup release CTE)
--   4. switch_sd_claim       (transition from one SD to another — the new SD's
--                             worktree is set by the caller after switch, so
--                             clearing the old values is the safe pre-state)
--
-- All other UPDATE clauses are preserved verbatim from 20260408_claim_check_hardening.sql.

-- 1. release_sd
CREATE OR REPLACE FUNCTION public.release_sd(p_session_id text, p_reason text DEFAULT 'manual')
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

-- 2. release_session
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
      SET active_session_id = NULL, is_working_on = false
      WHERE active_session_id = p_session_id;
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

-- 3. cleanup_stale_sessions — only the inner `released` CTE needs the new clauses.
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
  SET active_session_id = NULL, is_working_on = false
  WHERE active_session_id IN (
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

-- 4. switch_sd_claim — clear the old worktree on transition; the caller writes
-- the new SD's worktree_path/branch via sd-start.js after the switch returns.
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
    SET active_session_id = NULL, is_working_on = false
    WHERE sd_key = p_old_sd_id AND active_session_id = p_session_id;
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
