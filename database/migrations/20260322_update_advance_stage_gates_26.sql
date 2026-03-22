-- ============================================================================
-- Update advance_venture_stage gate arrays for 26-stage lifecycle
-- ============================================================================
-- SD: SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001
--
-- Changes:
--   - Kill gates: [3, 5, 13, 23] → [3, 5, 13, 24]
--   - Promotion gates: [16, 17, 22] → [17, 18, 23]
--   - All gates: union of above
--   - Max stage: 25 → 26
--
-- Rollback: Re-apply 20260318_remove_gate_autocreate_from_advance.sql
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
  v_kill_gates INTEGER[] := ARRAY[3, 5, 13, 24];
  v_promotion_gates INTEGER[] := ARRAY[17, 18, 23];
  v_all_gates INTEGER[] := ARRAY[3, 5, 13, 17, 18, 23, 24];
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
  END IF;

  -- Generate idempotency key
  v_idempotency := gen_random_uuid();

  -- Update venture stage
  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage,
        updated_at = NOW()
    WHERE id = p_venture_id;

  -- Record transition
  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    transitioned_at, metadata
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, p_transition_type,
    NOW(),
    jsonb_build_object(
      'idempotency_key', v_idempotency,
      'gate_decision_id', v_gate_decision.id,
      'venture_name', v_venture_name
    )
  );

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
END;
$fn$;

COMMENT ON FUNCTION advance_venture_stage(UUID, INTEGER, INTEGER, TEXT) IS
  'Gate-enforced venture stage advancement. Kill gates: [3,5,13,24], Promotion gates: [17,18,23]. Max stage: 26. Updated for SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001.';
