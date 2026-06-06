-- SD-LEO-FIX-FIX-ADVANCE-VENTURE-001 — fix advance_venture_stage for NON-GATE stages
-- @approved-by: codestreetlabs@gmail.com
--
-- Function: public.advance_venture_stage(uuid, integer, integer, text)  (oid 633099)
--
-- BUG: For a NON-GATE from_stage (i.e. p_from_stage NOT in {3,5,13,17,18,23,24}),
--   the gate-enforcement block is skipped, so the RECORD variable `v_gate_decision`
--   is never assigned. The venture_stage_transitions INSERT then reads
--   `v_gate_decision.id` UNCONDITIONALLY for the handoff_data JSONB, raising
--   `record "v_gate_decision" is not assigned yet`. The EXCEPTION WHEN OTHERS
--   handler swallows it and returns {success:false, error:'record "v_gate_decision"
--   is not assigned yet'} — so non-gate advances silently fail.
--
-- FIX (Option A — minimal, 3 deltas; ZERO other change vs the LIVE def):
--   1. DECLARE: add `v_gate_decision_id UUID := NULL;`
--   2. Gate block: AFTER the existing `SELECT ... INTO v_gate_decision` and its
--      `IF NOT FOUND` guard (kept verbatim), add `v_gate_decision_id := v_gate_decision.id;`
--   3. INSERT handoff_data: replace `v_gate_decision.id` with `v_gate_decision_id`.
--   Result: gate_decision_id = NULL for non-gate stages (correct), real UUID for
--   gate stages (unchanged behaviour).
--
-- BASIS: This CREATE OR REPLACE was built from the LIVE definition retrieved via
--   pg_get_functiondef(633099::regprocedure) on 2026-06-06 — NOT from the stale
--   on-disk migration 20260322_update_advance_stage_gates_26.sql. It preserves the
--   live behaviour the on-disk file lacks: uuid_generate_v5 idempotency_key, the
--   two stage_events emits (STAGE_COMPLETE / STAGE_ENTRY), approved_by='system:advance',
--   handoff_data, and `ON CONFLICT DO NOTHING`.
--
-- Idempotent: CREATE OR REPLACE. No DOWN block required (a re-run of the prior live
--   def would revert; the prior def is preserved verbatim above except the 3 deltas).

CREATE OR REPLACE FUNCTION public.advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  -- 26-stage gate arrays (SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001)
  v_kill_gates INTEGER[] := ARRAY[3, 5, 13, 24];
  v_promotion_gates INTEGER[] := ARRAY[17, 18, 23];
  v_all_gates INTEGER[] := ARRAY[3, 5, 13, 17, 18, 23, 24];
  v_gate_decision RECORD;
  v_gate_decision_id UUID := NULL;  -- DELTA 1: NULL for non-gate stages; real id assigned in gate block
  v_idempotency UUID;
BEGIN
  -- Validate venture exists and lock row
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

  -- Validate from_stage matches current
  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stage_mismatch',
      'current_stage', v_current_stage,
      'from_stage', p_from_stage
    );
  END IF;

  -- Validate to_stage range (26-stage lifecycle)
  IF p_to_stage < 1 OR p_to_stage > 26 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_to_stage',
      'to_stage', p_to_stage
    );
  END IF;

  -- Gate enforcement: if from_stage is a gate, require approved decision
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

    v_gate_decision_id := v_gate_decision.id;  -- DELTA 2: capture real id only on the gate path (guarded above)
  END IF;

  -- Mark current stage as completed
  UPDATE venture_stage_work
    SET stage_status = 'completed',
        completed_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_from_stage;

  -- Advance ventures.current_lifecycle_stage
  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage,
        updated_at = NOW()
    WHERE id = p_venture_id;

  -- Mark next stage as in_progress
  UPDATE venture_stage_work
    SET stage_status = 'in_progress',
        started_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_to_stage;

  -- Emit STAGE_COMPLETE event for from_stage
  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_from_stage, 'STAGE_COMPLETE',
    jsonb_build_object('advanced_to', p_to_stage, 'transition_type', p_transition_type),
    NOW()
  );

  -- Emit STAGE_ENTRY event for to_stage
  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_to_stage, 'STAGE_ENTRY',
    jsonb_build_object('advanced_from', p_from_stage, 'transition_type', p_transition_type),
    NOW()
  );

  -- Record transition (correct column names: approved_by, handoff_data, idempotency_key)
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
      'gate_decision_id', v_gate_decision_id,  -- DELTA 3: was v_gate_decision.id (unconditional read)
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
