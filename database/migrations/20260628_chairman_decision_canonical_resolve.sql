-- SD-LEO-INFRA-CHAIRMAN-DECISION-RESOLVE-CANONICAL-001
-- Canonical chairman-decision resolve path.
--
-- PROBLEM: fn_chairman_decide (migration 20260213) set status + decided_by + rationale ONLY,
-- leaving decision='pending' under status='approved' (a contradictory "lying" decision field on
-- an approved gate). The dashboard + coordinator CLI route through this RPC and inherited the bug,
-- while the autonomous worker/orchestrator paths hand-wrote their own divergent field sets.
--
-- FIX (FR-1): the canonical resolve writes the COMPLETE, consistent (status, decision, blocking)
-- triple for every action — never leaving decision='pending' under a non-pending status.
--   approved -> (status='approved', decision='proceed', blocking=false)
--   rejected -> (status='rejected', decision='kill',    blocking=false)
-- decision values are members of the LIVE chairman_decisions_decision_check (30 values incl
-- proceed/kill) — deliberately NOT narrowed (the 6-value set was stale migration 20251206).
--
-- FR-2 (trigger-broaden to release rejected/terminal ventures) was SPLIT OUT to a follow-up SD
-- (coordinator decision 2026-06-28): broadening trg_chairman_decision_unblock to fire on
-- 'rejected' is UNSAFE without a paired kill-consumer — chairman REJECT routes through
-- fn_chairman_decide(action='rejected') which does NOT set ventures.status terminal, so an
-- unblocked rejected venture is re-picked by the worker and re-mints a fresh pending gate,
-- resurrecting the killed gate and discarding the chairman's reject (DATABASE review cc6de94c).
-- The rejected-stuck-at-blocked gap is PRE-EXISTING, so leaving the trigger approved-only here
-- is zero-regression. The safe form (fn rejected-branch sets the venture terminal) ships in the
-- follow-up SD.
--
-- Additive + idempotent: CREATE OR REPLACE for the function. No trigger change. No data migration
-- here (a separate one-time backfill handles existing contradictory rows).
--
-- Chairman authorization: session_question decision 73e04cc2 APPROVED (decision=go), 2026-06-28 —
-- "Proceed with your recommendation based on your rationale." Applied via the governed
-- apply-migration.js --prod-deploy path by the coordinator (CONST-002).
-- @approved-by: codestreetlabs@gmail.com

-- ── FR-1: canonical resolve function writes the full triple ──
CREATE OR REPLACE FUNCTION public.fn_chairman_decide(
  p_decision_id uuid,
  p_action text,
  p_decided_by text,
  p_rationale text DEFAULT NULL::text,
  p_force_stale boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_decision RECORD;
  v_rows_updated INT;
  v_decision_value TEXT;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid action. Must be approved or rejected.',
      'code', 'INVALID_ACTION'
    );
  END IF;

  -- Canonical (status, decision) mapping. decision is a member of chairman_decisions_decision_check.
  -- This is the single source of truth for what a resolved decision's decision field becomes.
  v_decision_value := CASE p_action
    WHEN 'approved' THEN 'proceed'
    WHEN 'rejected' THEN 'kill'
  END;

  SELECT cd.*, v.updated_at AS venture_updated_at, v.name AS venture_name
  INTO v_decision
  FROM chairman_decisions cd
  JOIN ventures v ON v.id = cd.venture_id
  WHERE cd.id = p_decision_id
  FOR UPDATE OF cd;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision not found.', 'code', 'NOT_FOUND');
  END IF;

  IF v_decision.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Decision already %s by %s at %s.',
        v_decision.status, COALESCE(v_decision.decided_by, 'unknown'), v_decision.updated_at),
      'code', 'ALREADY_DECIDED',
      'current_status', v_decision.status,
      'decided_by', v_decision.decided_by,
      'decided_at', v_decision.updated_at
    );
  END IF;

  -- Stale-context guard (FR-4): protects human/dashboard resolves against acting on stale venture
  -- state. Autonomous same-tick resolves pass p_force_stale=true (they create/observe the decision
  -- and resolve it in the same pass — never stale) so the guard does not false-block them.
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

  -- FR-1: write the COMPLETE triple — status AND decision AND blocking — never leaving
  -- decision='pending' under a non-pending status.
  UPDATE chairman_decisions
  SET
    status = p_action,
    decision = v_decision_value,
    blocking = false,
    decided_by = p_decided_by,
    rationale = COALESCE(p_rationale, rationale)
  WHERE id = p_decision_id
    AND status = 'pending';  -- second safety check

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision was modified by another session.', 'code', 'CONCURRENT_MODIFICATION');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'action', p_action,
    'decision', v_decision_value,
    'blocking', false,
    'decided_by', p_decided_by,
    'venture_name', v_decision.venture_name
  );
END;
$function$;

-- NOTE: trg_chairman_decision_unblock is intentionally LEFT UNCHANGED (fires on status->'approved'
-- only). The approved path here still sets status='approved', so the existing trigger continues to
-- release the venture exactly as before — no regression. FR-2's rejected-release is deferred to the
-- follow-up SD (see header).
