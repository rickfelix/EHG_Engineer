-- @approved-by: codestreetlabs@gmail.com
--
-- 20260628_chairman_reject_unblock_terminal.sql
-- SD-LEO-INFRA-CHAIRMAN-REJECT-UNBLOCK-TERMINAL-001 (FR-1 + FR-2, PAIRED)
--
-- A chairman 'rejected' decision must TERMINATE the venture (kill-consumer)
-- when the unblock trigger broadens to fire on 'rejected'. PAIRED change
-- (both or neither):
--   (a) FR-1: broaden trg_chairman_decision_unblock to fire on 'rejected' too
--       (closing the rejected-stuck-at-blocked gap), and unblock on both
--       'approved' and 'rejected' in its function.
--   (b) FR-2: make fn_chairman_decide's 'rejected' branch set the venture
--       TERMINAL (ventures.status='cancelled', mirroring reject_chairman_decision's
--       non-kill-gate terminal status) — a terminal status the worker re-pick
--       predicate (_pollForWork: status='active') excludes.
--
-- WHY PAIRED: with (a) alone, a rejected venture would unblock -> orchestrator
-- idle -> re-picked by the worker (status='active' AND orchestrator_state='idle'
-- AND current_lifecycle_stage<26) -> re-mint a fresh pending gate = RESURRECT
-- the killed gate and DISCARD the chairman's reject. (b) makes the venture
-- terminal (status='cancelled') so _pollForWork excludes it: not re-picked, no
-- new gate minted, reject preserved. Governance: a chairman KILL/reject must
-- STICK (terminal), never be resurrectable.
--
-- FLAGSHIP-ADJACENT: fn_chairman_decide can now terminate ventures. Co-author
-- convergence (coordinator) + Charlie DATABASE review (CONDITIONAL_PASS 88)
-- recorded on the SD; ships through the LEO DATABASE/SECURITY gate review.
--
-- Rollback: restore the prior definitions —
--   - recreate trg_chairman_approval_unblock_orchestrator() with the
--     approved-only guard;
--   - recreate trigger trg_chairman_decision_unblock WHEN (new.status='approved'
--     AND old.status IS DISTINCT FROM new.status);
--   - recreate fn_chairman_decide WITHOUT the IF p_action='rejected' venture
--     terminal branch.

BEGIN;

-- FR-1a: unblock on BOTH 'approved' and 'rejected'.
CREATE OR REPLACE FUNCTION public.trg_chairman_approval_unblock_orchestrator()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- SD-LEO-INFRA-CHAIRMAN-REJECT-UNBLOCK-TERMINAL-001 (FR-1): fire on a decided
  -- transition to EITHER 'approved' OR 'rejected'. For 'rejected', fn_chairman_decide
  -- has already set the venture terminal (status='cancelled'), so unblocking it here
  -- is safe — the worker re-pick predicate excludes status<>'active'.
  IF NEW.status IN ('approved', 'rejected') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    UPDATE ventures
    SET orchestrator_state = 'idle'
    WHERE id = NEW.venture_id
      AND orchestrator_state = 'blocked';
  END IF;
  RETURN NEW;
END;
$function$;

-- FR-1b: broaden the trigger WHEN clause (recreate — a WHEN change requires it).
DROP TRIGGER IF EXISTS trg_chairman_decision_unblock ON public.chairman_decisions;
CREATE TRIGGER trg_chairman_decision_unblock
  AFTER UPDATE ON public.chairman_decisions
  FOR EACH ROW
  WHEN (((new.status = ANY (ARRAY['approved'::text, 'rejected'::text]))
         AND (old.status IS DISTINCT FROM new.status)))
  EXECUTE FUNCTION trg_chairman_approval_unblock_orchestrator();

-- FR-2: fn_chairman_decide's 'rejected' branch sets the venture TERMINAL.
-- Identical to the live definition EXCEPT for the new terminal-on-reject block
-- inserted after the concurrent-modification check (marked FR-2).
CREATE OR REPLACE FUNCTION public.fn_chairman_decide(p_decision_id uuid, p_action text, p_decided_by text, p_rationale text DEFAULT NULL::text, p_force_stale boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_decision RECORD;
  v_venture RECORD;
  v_rows_updated INT;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid action. Must be approved or rejected.',
      'code', 'INVALID_ACTION'
    );
  END IF;
  SELECT cd.*, v.updated_at AS venture_updated_at, v.name AS venture_name
  INTO v_decision
  FROM chairman_decisions cd
  JOIN ventures v ON v.id = cd.venture_id
  WHERE cd.id = p_decision_id
  FOR UPDATE OF cd;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Decision not found.',
      'code', 'NOT_FOUND'
    );
  END IF;
  IF v_decision.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Decision already %s by %s at %s.',
        v_decision.status,
        COALESCE(v_decision.decided_by, 'unknown'),
        v_decision.updated_at
      ),
      'code', 'ALREADY_DECIDED',
      'current_status', v_decision.status,
      'decided_by', v_decision.decided_by,
      'decided_at', v_decision.updated_at
    );
  END IF;
  IF NOT p_force_stale AND v_decision.venture_updated_at > v_decision.created_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Venture "%s" state has changed since this decision was created. Review updated state before deciding.', v_decision.venture_name),
      'code', 'STALE_CONTEXT',
      'decision_created_at', v_decision.created_at,
      'venture_updated_at', v_decision.venture_updated_at,
      'venture_name', v_decision.venture_name
    );
  END IF;
  UPDATE chairman_decisions
  SET
    status = p_action,
    decided_by = p_decided_by,
    rationale = COALESCE(p_rationale, rationale)
  WHERE id = p_decision_id
    AND status = 'pending';  -- Second safety check
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Decision was modified by another session.',
      'code', 'CONCURRENT_MODIFICATION'
    );
  END IF;

  -- SD-LEO-INFRA-CHAIRMAN-REJECT-UNBLOCK-TERMINAL-001 (FR-2): a 'rejected'
  -- decision must terminate the venture. Set it to the terminal status
  -- 'cancelled' (mirrors reject_chairman_decision's non-kill-gate branch) so
  -- the broadened unblock trigger does NOT resurrect it: the worker re-pick
  -- predicate (status='active') excludes a cancelled venture, so it is never
  -- re-picked and no new pending gate is minted. The reject is preserved.
  IF p_action = 'rejected' THEN
    UPDATE ventures
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = v_decision.venture_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'action', p_action,
    'decided_by', p_decided_by,
    'venture_name', v_decision.venture_name
  );
END;
$function$;

COMMIT;
