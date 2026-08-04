CREATE OR REPLACE FUNCTION public.fn_chairman_decide(p_decision_id uuid, p_action text, p_decided_by text, p_rationale text DEFAULT NULL::text, p_force_stale boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_decision RECORD;
  v_rows_updated INT;
  v_decision_value TEXT;
  v_is_kill_gate BOOLEAN;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be approved or rejected.', 'code', 'INVALID_ACTION');
  END IF;

  v_decision_value := CASE p_action WHEN 'approved' THEN 'proceed' WHEN 'rejected' THEN 'kill' END;

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
      'error', format('Decision already %s by %s at %s.', v_decision.status, COALESCE(v_decision.decided_by, 'unknown'), v_decision.updated_at),
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

  -- FR-1 (live): write the COMPLETE triple — status AND decision AND blocking.
  UPDATE chairman_decisions
  SET status = p_action, decision = v_decision_value, blocking = false, decided_by = p_decided_by, rationale = COALESCE(p_rationale, rationale)
  WHERE id = p_decision_id AND status = 'pending';
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision was modified by another session.', 'code', 'CONCURRENT_MODIFICATION');
  END IF;

  -- SD-LEO-INFRA-CHAIRMAN-DECIDE-REJECT-AUDIT-TRAIL-001 (FR-2/FR-4): on reject, terminate the venture
  -- (status='cancelled' so the unblock trigger cannot resurrect it) and, on a KILL GATE, set the killed
  -- columns + write the kill-audit-trail via the shared helper (parity with reject_chairman_decision).
  IF p_action = 'rejected' THEN
    v_is_kill_gate := v_decision.lifecycle_stage = ANY (ARRAY[3, 5, 13, 23]);
    IF v_is_kill_gate THEN
      UPDATE ventures
      SET status = 'cancelled', workflow_status = 'killed', killed_at = now(), kill_reason = p_rationale, updated_at = now()
      WHERE id = v_decision.venture_id;
    ELSE
      UPDATE ventures
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_decision.venture_id;
    END IF;

    PERFORM public.fn_write_kill_audit_trail(
      v_decision.venture_id, v_decision.lifecycle_stage, p_rationale, auth.uid(), 'fn_chairman_decide', p_decision_id
    );
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
$function$
