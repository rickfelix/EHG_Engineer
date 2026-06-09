-- Migration: chairman/service_role authz guards on 3 SECURITY DEFINER RPCs
-- SD-FDBK-INFRA-DEFENSE-DEPTH-CHAIRMAN-001
-- Generated from live pg_get_functiondef; ONLY delta vs live is the inserted guard block.
-- Functions: park_venture_decision (soft-fail jsonb), log_stage_advance_override (RAISE), reset_eva_circuit (RAISE).
-- bootstrap_venture_workflow intentionally EXCLUDED (ordinary venture-creation op).
-- CREATE OR REPLACE preserves existing EXECUTE grants; each fn's SET search_path is preserved verbatim.
-- SD: SD-FDBK-INFRA-DEFENSE-DEPTH-CHAIRMAN-001
-- @approved-by: codestreetlabs@gmail.com

-- park_venture_decision: + chairman/service_role guard
CREATE OR REPLACE FUNCTION public.park_venture_decision(p_decision_id uuid, p_park_type text, p_reason text, p_decided_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_cd RECORD; v_vd RECORD;
  v_venture_id UUID; v_source TEXT;
BEGIN
  -- SD-FDBK-INFRA-DEFENSE-DEPTH-CHAIRMAN-001: chairman/service_role authz guard (defense-in-depth;
  -- closes the live authenticated-EXECUTE hole). Returns this function's standard {success:false}
  -- soft-fail shape (it has no EXCEPTION handler to convert a RAISE); mirrors delete_venture.
  IF NOT (public.fn_is_chairman() OR auth.role() = 'service_role') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_privilege: chairman or service role required',
      'detail', '42501'
    );
  END IF;
  SELECT * INTO v_cd FROM chairman_decisions
  WHERE id = p_decision_id AND status = 'pending' FOR UPDATE;
  IF FOUND THEN
    v_source := 'chairman_decisions';
    v_venture_id := v_cd.venture_id;
    UPDATE chairman_decisions SET
      decision = 'pause', status = 'approved',
      rationale = p_reason,
      decided_by = COALESCE(p_decided_by, COALESCE(auth.uid()::text, 'chairman')),
      blocking = false, updated_at = now()
    WHERE id = p_decision_id;
  ELSE
    SELECT * INTO v_vd FROM venture_decisions
    WHERE id = p_decision_id AND decision IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Decision not found or already resolved');
    END IF;
    v_source := 'venture_decisions';
    v_venture_id := v_vd.venture_id;
    UPDATE venture_decisions SET
      decision = 'pause',
      decided_by = COALESCE(p_decided_by::uuid, auth.uid()),
      decided_at = now(), notes = p_reason, updated_at = now()
    WHERE id = p_decision_id;
  END IF;
  UPDATE ventures SET
    status = CASE WHEN p_park_type = 'blocked' THEN 'paused' ELSE status END,
    workflow_status = 'paused',
    updated_at = now()
  WHERE id = v_venture_id;
  RETURN jsonb_build_object(
    'success', true, 'decision_id', p_decision_id,
    'venture_id', v_venture_id, 'park_type', p_park_type,
    'review_date', CASE
      WHEN p_park_type = 'blocked' THEN (now() + interval '30 days')::date
      WHEN p_park_type = 'nursery' THEN (now() + interval '90 days')::date
    END, 'source', v_source
  );
END;
$function$
;

-- log_stage_advance_override: + chairman/service_role guard
CREATE OR REPLACE FUNCTION public.log_stage_advance_override(p_venture_id uuid, p_reason text, p_verdict_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_audit_id uuid;
  v_actor text;
BEGIN
  -- SD-FDBK-INFRA-DEFENSE-DEPTH-CHAIRMAN-001: chairman/service_role authz guard (defense-in-depth;
  -- closes the live authenticated-EXECUTE hole). Mirrors set_stage_override / delete_venture.
  -- fn_is_chairman() is false for a NULL auth.uid(), so this also subsumes an auth-required check.
  IF NOT (public.fn_is_chairman() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'insufficient_privilege: chairman or service role required'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Caller must be an authenticated chairman/admin/owner.';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason is required and must be at least 10 characters';
  END IF;
  IF p_venture_id IS NULL THEN
    RAISE EXCEPTION 'p_venture_id is required';
  END IF;
  v_actor := COALESCE(auth.uid()::text, 'unknown');
  INSERT INTO public.audit_log (
    event_type,
    entity_type,
    entity_id,
    severity,
    created_by,
    metadata
  ) VALUES (
    'stage_advance_override',
    'venture',
    p_venture_id::text,
    'warning',
    v_actor,
    jsonb_build_object(
      'reason', trim(p_reason),
      'verdict_snapshot', p_verdict_snapshot,
      'attempted_transition', '20->21',
      'stage_number', 20,
      'actor', v_actor
    )
  )
  RETURNING id INTO v_audit_id;
  RETURN v_audit_id;
END;
$function$
;

-- reset_eva_circuit: + chairman/service_role guard
CREATE OR REPLACE FUNCTION public.reset_eva_circuit(p_venture_id text, p_reset_by text DEFAULT 'CHAIRMAN'::text)
 RETURNS TABLE(success boolean, previous_state text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_circuit eva_circuit_breaker;
BEGIN
  -- SD-FDBK-INFRA-DEFENSE-DEPTH-CHAIRMAN-001: chairman/service_role authz guard (defense-in-depth;
  -- closes the live authenticated-EXECUTE hole). Mirrors set_stage_override / delete_venture.
  -- fn_is_chairman() is false for a NULL auth.uid(), so this also subsumes an auth-required check.
  IF NOT (public.fn_is_chairman() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'insufficient_privilege: chairman or service role required'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Caller must be an authenticated chairman/admin/owner.';
  END IF;
    SELECT * INTO v_circuit
    FROM eva_circuit_breaker
    WHERE venture_id = p_venture_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'none'::TEXT, 'No circuit breaker found for venture'::TEXT;
        RETURN;
    END IF;

    -- Log the transition
    INSERT INTO eva_circuit_state_transitions
        (circuit_id, venture_id, from_state, to_state, trigger_reason, triggered_by)
    VALUES
        (v_circuit.id, p_venture_id, v_circuit.state, 'closed', 'manual_reset', p_reset_by);

    -- Reset the circuit
    UPDATE eva_circuit_breaker SET
        state = 'closed',
        failure_count = 0,
        recent_failures = '[]'::jsonb,
        tripped_at = NULL,
        updated_at = NOW()
    WHERE id = v_circuit.id;

    -- Resolve any open alerts
    UPDATE system_alerts SET
        resolved_at = NOW(),
        resolved_by = p_reset_by
    WHERE alert_type = 'circuit_breaker'
      AND source_entity_id = p_venture_id
      AND resolved_at IS NULL;

    RETURN QUERY SELECT true, v_circuit.state,
        format('Circuit reset from %s to closed by %s', v_circuit.state, p_reset_by);
END;
$function$
;
