-- 20260902_release_sd_by_key.sql
-- SD-LEO-INFRA-RELEASE-KEY-SESSION-001
-- Date: 2026-09-02
--
-- PROBLEM. release_sd(p_session_id, p_reason) releases only whatever claude_sessions.sd_key
-- currently POINTS AT -- it takes no key argument. A session that holds one claim as the
-- sd_key pointer AND other claims as SECONDARY holds (strategic_directives_v2.claiming_session_id
-- / quick_fixes.claiming_session_id, independent of the scalar pointer) cannot release one
-- specific secondary hold without a hand edit to claude_sessions, which the chairman's
-- root-cause directive forbids. Measured 2026-09-02 by Alpha (signal 5b462d35; coordinator
-- advisory f7c1aee5); Solomon CAPA 9d8d34b3 CA-9 names the companion atomic-retarget primitive.
--
-- ADDITIVE ONLY. This migration adds two NEW functions; release_sd and claim_sd are untouched
-- and remain the single-hold path (release_sd's own body is preserved verbatim from
-- 20260727_release_sd_qf_reopen.sql -- see that file for its own history).
--
-- release_sd_by_key(p_session_id, p_sd_key, p_reason) releases ONLY the named claim row:
--   * lock claude_sessions FOR UPDATE first (mirrors switch_sd_claim's session-first order,
--     20260609_switch_sd_claim_existence_terminal_guards.sql), THEN lock the target
--     strategic_directives_v2/quick_fixes row FOR UPDATE for the existence + holder check --
--     never the reverse order, which would ABBA-deadlock against a concurrent
--     claim_sd/switch_sd_claim call locking in that same order.
--   * a session that does not hold p_sd_key gets a NAMED refusal {success:false,
--     error:'sd_mismatch', held_sd_key:<the key claude_sessions.sd_key actually points at, or
--     null>} -- 'sd_mismatch' is the SAME string bestEffortReleaseSd (lib/fleet/best-effort-
--     release.mjs) already uses as its JS-layer discriminator for this exact case; this
--     migration moves the guard from an app-layer check-then-act (expectedSdKey,
--     QF-20260726-593, which only NARROWED the race) into a lock-time SQL CAS that CLOSES it.
--   * a p_sd_key matching no claim at all returns {success:false, error:'sd_not_found'},
--     matching switch_sd_claim's terminal-guard vocabulary.
--   * two branches on success: (a) p_sd_key IS the claude_sessions.sd_key pointer -- clears the
--     pointer AND worktree_path/worktree_branch TOGETHER in the same statement (never split,
--     per ck_claude_sessions_worktree_state_consistency), exactly as release_sd's own body
--     does; (b) p_sd_key is a SECONDARY held claim -- claude_sessions is left COMPLETELY
--     untouched, only the target row's own claim columns are cleared. The QF branch inherits
--     the holder CAS AND guarded status-revert from 20260727_release_sd_qf_reopen.sql verbatim,
--     so this migration cannot regress the 7-row claim-stranding defect that fix closed.
--
-- retarget_sd_claim(p_session_id, p_release_sd_key, p_claim_sd_key, p_reason) releases one key
-- and claims another for the same session in one call:
--   * p_release_sd_key = p_claim_sd_key returns {success:false, error:'sd_same_key'} with zero
--     effects -- an unspecified edge case the pre-plan adversarial critique flagged (could have
--     produced an ambiguous no-op / self-release / reclaim otherwise).
--   * DETERMINISTIC LOCK ORDER (closes hazard H2: an A-to-B retarget racing a concurrent B-to-A
--     retarget would otherwise deadlock, since each locks two rows in the order it happens to
--     encounter them). This function instead takes pg_advisory_xact_lock(hashtext(...)) on
--     LEAST(key1,key2) THEN GREATEST(key1,key2) -- the SAME advisory-lock namespace claim_sd
--     already uses (pg_advisory_xact_lock(hashtext(p_sd_id)), see claim_sd body below), so the
--     later in-call to claim_sd's own advisory lock is a reentrant no-op wait, not a second
--     independent lock. Because BOTH directions of a two-key retarget acquire in the identical
--     LEAST-then-GREATEST order, whichever session gets there first fully completes before the
--     other proceeds -- no cycle, no deadlock, no new lock primitive invented.
--   * releases via release_sd_by_key (reusing its guards verbatim) then claims via claim_sd
--     (reusing ITS full accumulated guard suite -- tier check, peer guard, phantom-session
--     guard, worktree columns, client-gate version -- rather than reimplementing 20+ migrations
--     of hardening; TR-3 non-goal: no change to claim semantics).
--   * ATOMICITY: the release-then-claim sequence runs inside a nested BEGIN/EXCEPTION block,
--     which PL/pgSQL implements as an implicit SAVEPOINT. If claim_sd returns success:false,
--     this function RAISEs to force that savepoint to roll back -- undoing the release -- then
--     the EXCEPTION handler catches it and returns a clean jsonb refusal. A caller never sees a
--     retarget where the release landed but the claim did not (closing the adversarial-critique
--     "no rollback/containment" gap at the function level, distinct from the PR-level rollback
--     plan in the PRD, which covers containment if the FUNCTIONS themselves are defective).
--
-- FAIL-CLOSED ON UNEXPECTED ERROR (TR-4 / INV-001-control-without-could-not-check-path): both
-- functions are themselves guards. Any failure mode NOT covered by a named error code above
-- (a DB error, a lock-wait timeout, a constraint violation) propagates as a raised SQL
-- exception -- never coerced into a false {success:true} or a silently-swallowed refusal with
-- no error code. Callers must treat a raised exception as a could-not-check outcome (log it,
-- leave claim state as-is) and never interpret it as "release attempted, assume it worked."
--
-- POST-APPLY VERIFICATION (TR-5 / INV-003-migration-authored-is-not-applied): a migration file
-- committed to the PR branch is not evidence these functions are callable in the live database.
-- The post-apply readback recorded on the SD must query information_schema.routines / pg_proc
-- for release_sd_by_key and retarget_sd_claim (or make an actual RPC call against a real row),
-- not merely confirm the file was committed.

CREATE OR REPLACE FUNCTION public.release_sd_by_key(p_session_id text, p_sd_key text, p_reason text DEFAULT 'manual')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD;
  v_is_qf boolean := p_sd_key LIKE 'QF-%';
  v_qf_claiming_id text;
  v_sd_claiming_id text;
  v_sd_active_id text;
BEGIN
  -- Session-first locking order (mirrors switch_sd_claim) -- serializes against a concurrent
  -- claim_sd / switch_sd_claim / release_sd_by_key call on the SAME session.
  SELECT * INTO v_session
  FROM claude_sessions
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'phantom_session',
      'message', format('[RELEASE_BY_KEY_PHANTOM_SESSION] session_id %s has no live claude_sessions row -- refusing to release %s.', p_session_id, p_sd_key));
  END IF;

  IF v_is_qf THEN
    SELECT claiming_session_id INTO v_qf_claiming_id FROM quick_fixes WHERE id = p_sd_key FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'sd_not_found',
        'message', format('[RELEASE_BY_KEY_NOT_FOUND] Quick-fix %s does not exist in quick_fixes.', p_sd_key));
    END IF;
    IF v_qf_claiming_id IS DISTINCT FROM p_session_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'sd_mismatch',
        'held_sd_key', v_session.sd_key,
        'message', format('[RELEASE_BY_KEY_MISMATCH] Session %s does not hold quick-fix %s (held by %s).', p_session_id, p_sd_key, COALESCE(v_qf_claiming_id, 'nobody')));
    END IF;

    -- Same holder CAS + guarded status-revert as release_sd's QF branch
    -- (20260727_release_sd_qf_reopen.sql) -- a genuinely-stranded row (in_progress, no
    -- PR/commit) reopens to the belt; a merge-witnessed row stays as-is.
    UPDATE quick_fixes
    SET claiming_session_id = NULL,
        status = CASE
                   WHEN status = 'in_progress'
                    AND pr_url IS NULL
                    AND commit_sha IS NULL
                   THEN 'open'
                   ELSE status
                 END
    WHERE id = p_sd_key
      AND claiming_session_id = p_session_id;
  ELSE
    SELECT claiming_session_id, active_session_id INTO v_sd_claiming_id, v_sd_active_id
    FROM strategic_directives_v2 WHERE sd_key = p_sd_key FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'sd_not_found',
        'message', format('[RELEASE_BY_KEY_NOT_FOUND] SD %s does not exist in strategic_directives_v2.', p_sd_key));
    END IF;
    IF p_session_id IS DISTINCT FROM v_sd_claiming_id AND p_session_id IS DISTINCT FROM v_sd_active_id THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'sd_mismatch',
        'held_sd_key', v_session.sd_key,
        'message', format('[RELEASE_BY_KEY_MISMATCH] Session %s does not hold SD %s (claiming_session_id=%s, active_session_id=%s).', p_session_id, p_sd_key, COALESCE(v_sd_claiming_id, 'nobody'), COALESCE(v_sd_active_id, 'nobody')));
    END IF;

    UPDATE strategic_directives_v2
    SET claiming_session_id = NULL,
        active_session_id = NULL,
        is_working_on = false
    WHERE sd_key = p_sd_key
      AND (active_session_id = p_session_id OR claiming_session_id = p_session_id);
  END IF;

  -- Branch (a): p_sd_key IS the claude_sessions.sd_key pointer -- clear it and worktree state
  -- TOGETHER (ck_claude_sessions_worktree_state_consistency), same fields release_sd clears.
  -- Branch (b): p_sd_key is a SECONDARY held claim -- claude_sessions stays byte-identical.
  IF v_session.sd_key = p_sd_key THEN
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
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'released_sd_key', p_sd_key,
    'reason', p_reason,
    'released_at', NOW()
  );
END;
$function$;

COMMENT ON FUNCTION public.release_sd_by_key(text, text, text) IS
  'Release ONLY the named claim row (SD-LEO-INFRA-RELEASE-KEY-SESSION-001), unlike release_sd '
  'which releases whatever claude_sessions.sd_key currently points at. Refuses with a named '
  'error (sd_mismatch / sd_not_found / phantom_session) rather than a silent no-op. Use for a '
  'multi-hold seat that must free one specific claim without touching its others.';

CREATE OR REPLACE FUNCTION public.retarget_sd_claim(p_session_id text, p_release_sd_key text, p_claim_sd_key text, p_reason text DEFAULT 'retarget')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_release_result jsonb;
  v_claim_result jsonb;
BEGIN
  IF p_release_sd_key = p_claim_sd_key THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'sd_same_key',
      'message', format('[RETARGET_SAME_KEY] release and claim key are identical (%s) -- refusing an ambiguous no-op/self-release/reclaim.', p_release_sd_key));
  END IF;

  -- Deterministic advisory-lock acquisition order (LEAST then GREATEST), BEFORE any row-level
  -- lock or UPDATE on either target. Same lock namespace claim_sd already uses
  -- (pg_advisory_xact_lock(hashtext(sd_id))) -- reentrant within this transaction, so claim_sd's
  -- own internal advisory-lock call below is a no-op re-acquire, not a second independent lock.
  -- Closes hazard H2: two concurrent opposite-direction retargets sharing a key both acquire in
  -- this SAME order, so one fully completes before the other proceeds -- no cycle.
  PERFORM pg_advisory_xact_lock(hashtext(LEAST(p_release_sd_key, p_claim_sd_key)));
  PERFORM pg_advisory_xact_lock(hashtext(GREATEST(p_release_sd_key, p_claim_sd_key)));

  -- Nested BEGIN/EXCEPTION = an implicit SAVEPOINT. If the claim fails, RAISE forces that
  -- savepoint to roll back -- undoing the release -- before the EXCEPTION handler returns a
  -- clean jsonb refusal. A caller never observes a retarget where only the release landed.
  BEGIN
    v_release_result := release_sd_by_key(p_session_id, p_release_sd_key, p_reason);
    IF NOT (v_release_result->>'success')::boolean THEN
      RETURN v_release_result;
    END IF;

    -- Delegates to claim_sd's own accumulated guard suite (tier check, peer guard, phantom
    -- session guard, worktree columns, client gate version) instead of reimplementing 20+
    -- migrations of hardening (TR-3: no change to claim semantics). NOTE argument order:
    -- claim_sd(p_sd_id, p_session_id, p_track, ...) -- NOT (p_session_id, p_sd_id, ...). No
    -- track override is exposed on retarget_sd_claim's own signature, so p_track is passed NULL
    -- (claim_sd assigns track := p_track directly, no COALESCE) -- an intentional "no track
    -- assigned" outcome, not an oversight.
    v_claim_result := claim_sd(p_claim_sd_key, p_session_id, NULL, false, NULL);
    IF NOT (v_claim_result->>'success')::boolean THEN
      RAISE EXCEPTION 'RETARGET_CLAIM_FAILED: %', v_claim_result::text;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'retarget_claim_failed',
      'release_sd_key', p_release_sd_key,
      'claim_sd_key', p_claim_sd_key,
      'message', format('[RETARGET_CLAIM_FAILED] claim of %s failed after releasing %s; both effects rolled back. Detail: %s', p_claim_sd_key, p_release_sd_key, SQLERRM)
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'released_sd_key', p_release_sd_key,
    'claimed_sd_key', p_claim_sd_key,
    'retargeted_at', NOW()
  );
END;
$function$;

COMMENT ON FUNCTION public.retarget_sd_claim(text, text, text, text) IS
  'Atomically release one claim and claim another for the same session '
  '(SD-LEO-INFRA-RELEASE-KEY-SESSION-001, Solomon CAPA 9d8d34b3 CA-9). On any failure (release '
  'refused, claim refused, or an unexpected error) zero effects are applied -- never a '
  'partially-applied retarget. Used by the stale-session sweep retarget path; available for the '
  'coordinator redirect path to call directly.';
