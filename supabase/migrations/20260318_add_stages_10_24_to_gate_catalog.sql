-- Add stages 10 and 24 to the gate catalog in advance_venture_stage()
-- Bug: Worker expects stages 10 (promotion) and 24 (promotion) to be gates,
-- but the SQL function only has [3, 5, 13, 16, 17, 22, 23] in v_all_gates.
-- This causes inconsistent gate handling between the worker and the DB function.
--
-- SD: SD-VW-BACKEND-CRITICAL-BUGFIXES-001

CREATE OR REPLACE FUNCTION advance_venture_stage(
  p_venture_id UUID,
  p_from_stage INTEGER,
  p_to_stage INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_venture RECORD;
  v_venture_name TEXT;
  v_kill_gates INTEGER[] := ARRAY[3, 5, 13, 23];
  v_promotion_gates INTEGER[] := ARRAY[10, 16, 17, 22, 24];
  v_all_gates INTEGER[] := ARRAY[3, 5, 10, 13, 16, 17, 22, 23, 24];
  v_gate_decision RECORD;
  v_idempotency UUID;
  v_gate_type TEXT;
BEGIN
  -- Fetch venture
  SELECT id, name, current_lifecycle_stage, orchestrator_state, status
  INTO v_venture
  FROM ventures
  WHERE id = p_venture_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found');
  END IF;

  v_venture_name := v_venture.name;

  -- Validate from_stage matches current
  IF v_venture.current_lifecycle_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Stage mismatch: expected %s, got %s', v_venture.current_lifecycle_stage, p_from_stage)
    );
  END IF;

  -- If target is a gate stage, check for approved decision
  IF p_to_stage = ANY(v_all_gates) THEN
    -- Determine gate type
    IF p_to_stage = ANY(v_kill_gates) THEN
      v_gate_type := 'kill';
    ELSE
      v_gate_type := 'promotion';
    END IF;

    -- Check for approved decision
    SELECT id, status, decision
    INTO v_gate_decision
    FROM chairman_decisions
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_to_stage
      AND status = 'approved'
    ORDER BY created_at DESC
    LIMIT 1;

    -- If no approved decision exists for a gate, block advancement
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Gate stage %s requires chairman approval', p_to_stage),
        'gate_type', v_gate_type,
        'blocked', true
      );
    END IF;
  END IF;

  -- Generate idempotency key
  v_idempotency := gen_random_uuid();

  -- Advance the stage
  UPDATE ventures
  SET current_lifecycle_stage = p_to_stage,
      updated_at = NOW()
  WHERE id = p_venture_id;

  -- Update stage_work for the completed stage
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_from_stage
    AND stage_status IN ('in_progress', 'blocked');

  -- Set the new stage to in_progress
  UPDATE venture_stage_work
  SET stage_status = 'in_progress',
      started_at = COALESCE(started_at, NOW()),
      updated_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_to_stage
    AND stage_status = 'not_started';

  RETURN jsonb_build_object(
    'success', true,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'venture_name', v_venture_name,
    'idempotency_key', v_idempotency
  );
END;
$$;
