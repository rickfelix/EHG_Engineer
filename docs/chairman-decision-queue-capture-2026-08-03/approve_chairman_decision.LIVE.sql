CREATE OR REPLACE FUNCTION public.approve_chairman_decision(p_decision_id uuid, p_rationale text DEFAULT NULL::text, p_decided_by text DEFAULT NULL::text, p_approval_type approval_type_enum DEFAULT NULL::approval_type_enum, p_stepup_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_decision RECORD;
BEGIN
  -- (0) AUTHORIZATION GUARD (SD-FDBK-GEN-RESTRICT-APPROVE-CHAIRMAN-001):
  -- Only the trusted service role (EVA agents) or a human chairman may approve
  -- a gate decision. Runs BEFORE the row lock / any UPDATE.
  IF NOT (auth.role() = 'service_role' OR public.fn_is_chairman()) THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Only chairmen or service_role may approve gate decisions');
  END IF;

  -- (2) Defense in depth: only the trusted service role may claim an agent identity.
  IF COALESCE(p_decided_by, '') = ANY (ARRAY['monitoring_agent', 'testing_agent'])
     AND auth.role() <> 'service_role' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Agent decided_by identities may only be used by the service role');
  END IF;

  SELECT * INTO v_decision
  FROM chairman_decisions
  WHERE id = p_decision_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision not found or already resolved');
  END IF;

  -- SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-C: high-consequence step-up gate.
  -- fn_verify_and_consume_stepup_token() itself is lockout-safe (no-op until
  -- >=2 credentials enrolled) and kill-switch-aware (app_config); it RAISEs on
  -- an invalid token, aborting this transaction before any write below.
  IF (v_decision.consequence_level = 'high' OR v_decision.lifecycle_stage = 24) THEN
    PERFORM fn_verify_and_consume_stepup_token(p_stepup_token, p_decision_id);
  END IF;

  UPDATE chairman_decisions SET
    decision = CASE
      WHEN lifecycle_stage = 0 THEN 'proceed'
      WHEN lifecycle_stage = 10 THEN 'approve'
      WHEN lifecycle_stage = 23 THEN 'release'
      WHEN lifecycle_stage = 26 THEN 'continue'
      ELSE 'go'
    END,
    status = 'approved',
    rationale = COALESCE(p_rationale, 'Approved by Chairman'),
    decided_by = COALESCE(p_decided_by, auth.uid()::text),
    decided_by_user_id = auth.uid(),
    approval_type = p_approval_type,
    -- (1)(3) Populate context for the TRUSTED service-role monitor ONLY, so the
    -- reject_s16_programmatic_approval guardrail is *satisfied* (not bypassed). Human/chairman
    -- (authenticated) and anon callers: context untouched (ELSE context).
    context = CASE
      WHEN auth.role() = 'service_role'
           AND COALESCE(p_decided_by, auth.uid()::text) = ANY (ARRAY['monitoring_agent', 'testing_agent'])
      THEN jsonb_build_object(
             'stage', v_decision.lifecycle_stage,
             'timestamp', now(),
             'decided_by', p_decided_by,
             'actor_role', auth.role(),
             'rationale', COALESCE(p_rationale, ''),
             'approval_type', p_approval_type,
             'auto_approved', true
           )
      ELSE context
    END,
    blocking = false,
    updated_at = now()
  WHERE id = p_decision_id;

  UPDATE ventures SET orchestrator_state = 'idle', updated_at = now()
  WHERE id = v_decision.venture_id AND orchestrator_state = 'blocked';

  UPDATE venture_stage_work
  SET stage_status = 'completed', completed_at = NOW()
  WHERE venture_id = v_decision.venture_id
    AND lifecycle_stage = v_decision.lifecycle_stage
    AND stage_status != 'completed';

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'venture_id', v_decision.venture_id,
    'lifecycle_stage', v_decision.lifecycle_stage,
    'new_status', 'approved',
    'approval_type', p_approval_type
  );
END;
$function$
