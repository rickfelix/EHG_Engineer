-- 20260727_release_sd_qf_reopen.sql
-- SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 (FR-2)
--
-- THE ROOT OF PART A. release_sd's QF branch cleared claiming_session_id and left status alone:
--
--     IF v_sd_key LIKE 'QF-%' THEN
--       UPDATE quick_fixes SET claiming_session_id = NULL WHERE id = v_sd_key;
--
-- A quick-fix released this way sits at status='in_progress' with a NULL claimant. That row is
-- unreachable by every consumer — all five candidate chokepoints require status='open'
-- (worker-checkin.cjs isAutoStartableQF plus its two candidate queries,
-- lib/checkin/steps/critical-qf-jump.cjs, scripts/coordinator-idle-qf-hint.mjs) — while the supply
-- gauges counted it as available. The work silently left the belt and the gauge said it was still
-- there.
--
-- MEASURED, not argued: 7 rows stranded in this exact shape, 6 of them CRITICAL, 78% of the entire
-- in_progress population, against only 2 rows a worker could actually claim. Two of the stranded
-- rows were the correction notices filed ABOUT this bug, so the defect suppressed its own reports.
--
-- WHY THE RPC AND NOT JUST THE JS. Every JS release path funnels through this function. The JS-side
-- fix (lib/fleet/best-effort-release.mjs clearAndReopenQf, wired into the stale-claim sweep) stops
-- the paths we know about; this stops the ones we do not. New rows kept landing in the stranded
-- state at 19:04 on 2026-07-26 — AFTER a manual revert at 20:01 had cleared the earlier batch —
-- which is the evidence that a sweep is not a fix.
--
-- TWO CHANGES, AND THEY SHIP TOGETHER BECAUSE EITHER ALONE IS UNSAFE:
--
--   1. STATUS REVERT, GUARDED. Reopen only a row that is genuinely stranded. The CASE reuses the
--      exact predicate already proven in scripts/stale-session-sweep.cjs and in the JS helper —
--      in_progress AND no pr_url AND no commit_sha. It deliberately does NOT touch:
--        * terminal rows (completed / cancelled / escalated) — never resurrected;
--        * merge-witnessed rows carrying pr_url/commit_sha, which are non-terminal ON PURPOSE
--          while scope acceptance is outstanding (QF-20260725-691). Reopening those would destroy
--          the attestation gate. Exactly 2 live rows are in that state today.
--
--   2. HOLDER CAS. The QF branch had NO ownership check, unlike the SD branch immediately below it,
--      which has always required (active_session_id = p_session_id OR claiming_session_id =
--      p_session_id). Without CAS, adding a status revert would let a stale caller reopen a
--      quick-fix that ANOTHER session has since claimed — yanking work out from under a live
--      holder. The revert is only safe with the guard, so neither lands without the other. This
--      also brings the two branches to parity, which is how the asymmetry went unnoticed.
--
-- BEHAVIOUR CHANGE WORTH STATING PLAINLY: a non-holder calling release_sd on a QF is now a no-op
-- rather than a silent clear. That is the intended hardening and matches the SD branch. If any
-- caller depended on force-releasing someone else's quick-fix, it must do so explicitly rather
-- than through this path.
--
-- Everything else in release_sd is preserved VERBATIM from
-- 20260502_release_clear_worktree_state.sql. Forward-only; re-apply that file to revert.

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
    -- FR-2: clear the claim AND reopen, so the row returns to the belt instead of stranding.
    UPDATE quick_fixes
    SET claiming_session_id = NULL,
        status = CASE
                   WHEN status = 'in_progress'
                    AND pr_url IS NULL
                    AND commit_sha IS NULL
                   THEN 'open'
                   ELSE status
                 END
    WHERE id = v_sd_key
      -- Holder CAS, parity with the SD branch below: only the session that holds the claim may
      -- release it. Without this the reopen could clobber a concurrent re-claim.
      AND claiming_session_id = p_session_id;
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
  'Release a claim. QF branch reopens a genuinely-stranded quick-fix (in_progress, no PR/commit) '
  'under a holder CAS — SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 FR-2. Clearing the claim '
  'without reverting status made rows unreachable by every open-only chokepoint while the supply '
  'gauges still counted them.';
