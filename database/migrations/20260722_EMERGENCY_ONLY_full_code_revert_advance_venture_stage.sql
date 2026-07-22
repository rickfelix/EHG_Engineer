-- =============================================================================
-- EMERGENCY-ONLY Full Code Revert: advance_venture_stage(uuid,int,int,text)
--                 back to its pre-SD-LEO-INFRA-RECONCILE-EHG-REPO-001 LIVE def.
-- SD: SD-LEO-INFRA-RECONCILE-EHG-REPO-001
-- Date: 2026-07-22
--
-- !!! DO NOT USE THIS FOR AN APPROVAL-BACKLOG / "TOO MANY VENTURES BLOCKED"
-- !!! INCIDENT. Use the data-level partial revert instead:
-- !!!   20260722_DOWN_stage_advancement_advance_venture_stage_gate_type_ssot.sql
--
-- This file is a genuine last resort, reserved ONLY for the scenario where the
-- NEW RPC CODE ITSELF is broken (e.g. a syntax/logic defect causes advance_
-- venture_stage to error or misbehave for ALL callers, not just newly-gated
-- ones) and a forward-fix cannot land fast enough.
--
-- WARNING -- applying this REOPENS a CONFIRMED, ALREADY-EXPLOITED authorization
-- bypass: gate_type='promotion' stages 10/16/19/25 lose ALL chairman-gate
-- enforcement again (6 of 45 historical advances from these stages already had
-- no approved chairman decision -- see the forensic query in this SD's PRD,
-- acceptance artifact TS-7), and the 23/24 gate_type response labels re-swap
-- (kill/promotion reversed vs the venture_stages SSOT).
-- Per security-agent (sub_agent_execution_results 24319524-85a9-4614-b019-
-- 7246d4f9bede): restoring this code is NEVER an acceptable steady state. If
-- you reach for this file, open an incident ticket, get explicit chairman
-- sign-off, and treat it as time-boxed -- revert to the fixed def the moment
-- the forward-fix is ready.
--
-- Restores the EXACT function body that was LIVE before this SD (retrieved
-- 2026-07-22 via pg_get_functiondef, identical to 20260704_stage_advancement_
-- advance_venture_stage_artifact_gate.sql) -- hardcoded arrays
-- kill=[3,5,13,24], promotion=[17,18,23], all=[3,5,13,17,18,23,24], with the
-- artifact-precondition block intact.
--
-- Idempotent: CREATE OR REPLACE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_kill_gates INTEGER[] := ARRAY[3, 5, 13, 24];
  v_promotion_gates INTEGER[] := ARRAY[17, 18, 23];
  v_all_gates INTEGER[] := ARRAY[3, 5, 13, 17, 18, 23, 24];
  v_gate_decision RECORD;
  v_gate_decision_id UUID := NULL;
  v_idempotency UUID;
  v_precondition JSONB;
BEGIN
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
          OR public.fn_user_has_venture_access(p_venture_id)) THEN
    RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
  END IF;

  SELECT current_lifecycle_stage, name
    INTO v_current_stage, v_venture_name
    FROM ventures
    WHERE id = p_venture_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'venture_not_found',
      'venture_id', p_venture_id
    );
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stage_mismatch',
      'current_stage', v_current_stage,
      'from_stage', p_from_stage
    );
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 26 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_to_stage',
      'to_stage', p_to_stage
    );
  END IF;

  IF p_from_stage = ANY(v_all_gates) THEN
    SELECT id, decision, status INTO v_gate_decision
      FROM chairman_decisions
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = p_from_stage
        AND status = 'approved'
        AND decision IN ('pass', 'go', 'proceed', 'approve', 'conditional_pass', 'conditional_go', 'continue', 'release')
      ORDER BY created_at DESC
      LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'gate_not_approved',
        'gate_stage', p_from_stage,
        'gate_type', CASE
          WHEN p_from_stage = ANY(v_kill_gates) THEN 'kill'
          WHEN p_from_stage = ANY(v_promotion_gates) THEN 'promotion'
          ELSE 'unknown'
        END,
        'message', format('Chairman approval required at stage %s before advancing', p_from_stage)
      );
    END IF;

    v_gate_decision_id := v_gate_decision.id;
  END IF;

  v_precondition := public.fn_stage_artifact_precondition(p_venture_id, p_from_stage);
  IF (v_precondition->>'blocked')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'artifact_precondition_unmet',
      'missing_artifacts', v_precondition->'missing_artifacts',
      'deviated_artifacts', v_precondition->'deviated_artifacts',
      'source', v_precondition->>'source',
      'venture_id', p_venture_id,
      'from_stage', p_from_stage
    );
  END IF;

  UPDATE venture_stage_work
    SET stage_status = 'completed',
        completed_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_from_stage;

  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage,
        updated_at = NOW()
    WHERE id = p_venture_id;

  UPDATE venture_stage_work
    SET stage_status = 'in_progress',
        started_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_to_stage;

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_from_stage, 'STAGE_COMPLETE',
    jsonb_build_object('advanced_to', p_to_stage, 'transition_type', p_transition_type),
    NOW()
  );

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_to_stage, 'STAGE_ENTRY',
    jsonb_build_object('advanced_from', p_from_stage, 'transition_type', p_transition_type),
    NOW()
  );

  v_idempotency := uuid_generate_v5(
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_venture_id::text || ':' || p_from_stage::text || ':' || p_to_stage::text
      || ':' || COALESCE(
        (SELECT COUNT(*)::text FROM venture_stage_transitions
         WHERE venture_id = p_venture_id
           AND from_stage = p_from_stage
           AND to_stage = p_to_stage),
        '0')
  );

  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    approved_by, handoff_data, idempotency_key
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, p_transition_type,
    'system:advance', jsonb_build_object(
      'gate_decision_id', v_gate_decision_id,
      'venture_name', v_venture_name
    ), v_idempotency
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'transition_type', p_transition_type,
    'gate_created', false,
    'idempotency_key', v_idempotency
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'venture_id', p_venture_id,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage
  );
END;
$function$;

-- Self-verification: confirm the emergency revert restored the hardcoded arrays.
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.advance_venture_stage(uuid,integer,integer,text)'::regprocedure);
  ASSERT v_def LIKE '%v_all_gates INTEGER[] := ARRAY[3, 5, 13, 17, 18, 23, 24]%', 'emergency revert: hardcoded v_all_gates not restored';
  ASSERT v_def LIKE '%fn_stage_artifact_precondition%', 'emergency revert: artifact-precondition block missing';
END
$verify$;
