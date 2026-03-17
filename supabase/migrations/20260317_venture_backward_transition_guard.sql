-- SD-LEO-FIX-VENTURE-GATE-STAGE-001: Add backward transition guard
-- Prevents advance_venture_stage() from allowing stage regressions.
-- Also syncs gate arrays with canonical stage-gates.js definitions.

CREATE OR REPLACE FUNCTION advance_venture_stage(
  p_venture_id UUID,
  p_from_stage INTEGER,
  p_to_stage INTEGER,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  -- Canonical gate definitions (synced with stage-gates.js)
  v_kill_gates INTEGER[] := ARRAY[3, 5, 13, 23];
  v_promotion_gates INTEGER[] := ARRAY[16, 17, 22];
  v_all_gates INTEGER[] := ARRAY[3, 5, 13, 16, 17, 22, 23];
  v_gate_decision RECORD;
  v_idempotency UUID;
  v_gate_type TEXT;
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

  -- SD-LEO-FIX-VENTURE-GATE-STAGE-001: Backward transition guard
  -- Prevent stage regression (new stage must be > current stage)
  IF p_to_stage <= v_current_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'backward_transition_blocked',
      'current_stage', v_current_stage,
      'to_stage', p_to_stage,
      'message', format('Cannot transition backward from stage %s to stage %s', v_current_stage, p_to_stage)
    );
  END IF;

  -- Gate enforcement: if from_stage is a gate, require approved decision
  IF p_from_stage = ANY(v_all_gates) THEN
    -- Determine gate type
    IF p_from_stage = ANY(v_kill_gates) THEN
      v_gate_type := 'kill';
    ELSE
      v_gate_type := 'promotion';
    END IF;

    -- Check for approved chairman decision
    SELECT id, decision, decided_at
      INTO v_gate_decision
      FROM chairman_decisions
      WHERE venture_id = p_venture_id
        AND gate_stage = p_from_stage
        AND decision = 'approved'
      ORDER BY decided_at DESC
      LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'gate_not_approved',
        'gate_stage', p_from_stage,
        'gate_type', v_gate_type,
        'message', format('Stage %s is a %s gate requiring chairman approval', p_from_stage, v_gate_type)
      );
    END IF;
  END IF;

  -- Idempotency check
  v_idempotency := COALESCE(p_idempotency_key, gen_random_uuid());

  -- Update venture stage
  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage,
        updated_at = NOW()
    WHERE id = p_venture_id;

  -- Log transition
  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, idempotency_key, created_at
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, v_idempotency, NOW()
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'idempotency_key', v_idempotency
  );
END;
$fn$;

-- Add comment documenting the gate stages
COMMENT ON FUNCTION advance_venture_stage IS
  'Stage transition with gate enforcement and backward transition guard. '
  'Gate stages synced with lib/agents/modules/venture-state-machine/stage-gates.js. '
  'Kill gates: 3,5,13,23. Promotion gates: 16,17,22. '
  'SD-LEO-FIX-VENTURE-GATE-STAGE-001';
