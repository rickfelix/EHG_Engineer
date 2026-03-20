-- ============================================================================
-- Remove automatic chairman_decisions creation from advance_venture_stage
-- ============================================================================
-- Problem: The RPC pre-creates a pending chairman_decisions row when a venture
-- advances TO a gate stage. This blocks the Stage Execution Worker from
-- processing the gate stage and producing content BEFORE the decision is
-- created. The worker already handles gate creation post-execution via
-- createOrReusePendingDecision() in _handleChairmanGate().
--
-- Change: Remove the IF block (lines 312-330 of original) that inserts into
-- chairman_decisions when p_to_stage is a gate. Set gate_created to false.
--
-- Created: 2026-03-18
-- Rollback: Re-apply 20260307_bootstrap_venture_workflow.sql (function 2 only)
-- ============================================================================

CREATE OR REPLACE FUNCTION advance_venture_stage(
  p_venture_id UUID,
  p_from_stage INTEGER,
  p_to_stage INTEGER,
  p_transition_type TEXT DEFAULT 'normal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_kill_gates INTEGER[] := ARRAY[3, 5, 13, 23];
  v_promotion_gates INTEGER[] := ARRAY[16, 17, 22];
  v_all_gates INTEGER[] := ARRAY[3, 5, 13, 16, 17, 22, 23];
  v_gate_decision RECORD;
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

  -- Validate to_stage range
  IF p_to_stage < 1 OR p_to_stage > 25 THEN
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
        'error', 'gate_blocked',
        'gate_stage', p_from_stage,
        'message', 'Chairman approval required to advance past gate stage ' || p_from_stage
      );
    END IF;
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

  -- Record transition (idempotent, with sequence counter to avoid collisions on REVISE loops)
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
    'system:advance', jsonb_build_object(), v_idempotency
  )
  ON CONFLICT DO NOTHING;

  -- NOTE: Gate decision creation REMOVED from this function.
  -- The Stage Execution Worker handles chairman_decisions creation
  -- AFTER processing the stage via _handleChairmanGate() ->
  -- createOrReusePendingDecision(). This ensures stage content is
  -- produced before the gate decision row exists.

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'transition_type', p_transition_type,
    'gate_created', false
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
$fn$;

COMMENT ON FUNCTION advance_venture_stage(UUID, INTEGER, INTEGER, TEXT) IS
'Gate-enforced stage advancement. Requires chairman approval at gate stages.
Marks stages complete/in_progress, emits events, records transitions.
Gate decision creation is handled by the Stage Execution Worker post-processing.';
