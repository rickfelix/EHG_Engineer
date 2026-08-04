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
    -- QF-20260710-291: a park is NOT an approval — terminate as cancelled (park-semantic
    -- within the existing status CHECK). decision='pause' + rationale carry the park intent.
    UPDATE chairman_decisions SET
      decision = 'pause', status = 'cancelled',
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
