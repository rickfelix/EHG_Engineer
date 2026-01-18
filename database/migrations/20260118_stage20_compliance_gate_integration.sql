-- ============================================================================
-- Stage 20 Compliance Gate Integration with fn_advance_venture_stage
-- SD-LIFECYCLE-GAP-002: Security & Compliance Certification Gate
-- ============================================================================
-- Modifies fn_advance_venture_stage to enforce compliance gate at Stage 20 exit
-- When advancing from Stage 20 to Stage 21, the function will:
-- 1. Call evaluate_stage20_compliance_gate()
-- 2. Block transition if any REQUIRED items are incomplete
-- 3. Record gate_passed event if successful
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_advance_venture_stage(
  p_venture_id UUID,
  p_from_stage INTEGER,
  p_to_stage INTEGER,
  p_handoff_data JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_result JSONB;
  v_gate_result JSONB;
  v_user_id UUID;
BEGIN
  -- Validate venture exists and get current stage
  SELECT current_lifecycle_stage, name INTO v_current_stage, v_venture_name
  FROM ventures
  WHERE id = p_venture_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Venture not found',
      'venture_id', p_venture_id
    );
  END IF;

  -- Validate from_stage matches current
  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stage mismatch - current stage does not match from_stage',
      'venture_id', p_venture_id,
      'current_stage', v_current_stage,
      'from_stage', p_from_stage
    );
  END IF;

  -- Validate to_stage is valid (1-25 range, must be from_stage + 1 for normal advancement)
  IF p_to_stage < 1 OR p_to_stage > 25 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid to_stage - must be between 1 and 25',
      'to_stage', p_to_stage
    );
  END IF;

  -- ============================================================================
  -- SD-LIFECYCLE-GAP-002: COMPLIANCE GATE CHECK AT STAGE 20
  -- ============================================================================
  IF p_from_stage = 20 AND p_to_stage = 21 THEN
    -- Get user_id from handoff_data if available
    v_user_id := (p_handoff_data->>'user_id')::UUID;

    -- Evaluate the compliance gate
    v_gate_result := evaluate_stage20_compliance_gate(p_venture_id, v_user_id);

    -- Check if gate evaluation succeeded
    IF NOT (v_gate_result->>'success')::BOOLEAN THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Compliance gate evaluation failed: ' || (v_gate_result->>'error'),
        'venture_id', p_venture_id,
        'from_stage', p_from_stage,
        'to_stage', p_to_stage,
        'gate_result', v_gate_result
      );
    END IF;

    -- Check if gate passed
    IF (v_gate_result->>'outcome') = 'FAIL' THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Compliance gate blocked: ' ||
                 (v_gate_result->>'required_total')::INT - (v_gate_result->>'required_complete')::INT ||
                 ' required item(s) incomplete',
        'venture_id', p_venture_id,
        'from_stage', p_from_stage,
        'to_stage', p_to_stage,
        'gate_status', 'BLOCKED',
        'required_total', v_gate_result->>'required_total',
        'required_complete', v_gate_result->>'required_complete',
        'required_percentage', v_gate_result->>'required_percentage',
        'missing_required_items', v_gate_result->'missing_required_items',
        'archetype', v_gate_result->>'archetype',
        'checklist_version', v_gate_result->>'checklist_version'
      );
    END IF;

    -- Gate passed - record the event
    PERFORM record_compliance_gate_passed(p_venture_id, v_user_id);
  END IF;
  -- ============================================================================

  -- Update ventures table
  UPDATE ventures
  SET current_lifecycle_stage = p_to_stage,
      updated_at = NOW()
  WHERE id = p_venture_id;

  -- Mark the from_stage work as completed (if venture_stage_work table exists)
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      health_score = 100,
      completed_at = NOW()
  WHERE venture_id = p_venture_id
    AND stage_id = p_from_stage;

  -- Log the transition (if venture_stage_transitions table exists)
  INSERT INTO venture_stage_transitions (
    venture_id,
    from_stage,
    to_stage,
    transition_type,
    approved_by,
    approved_at,
    handoff_data,
    created_at
  )
  VALUES (
    p_venture_id,
    p_from_stage,
    p_to_stage,
    'normal',
    COALESCE(p_handoff_data->>'ceo_agent_id', 'system'),
    NOW(),
    p_handoff_data,
    NOW()
  )
  ON CONFLICT DO NOTHING;

  -- Build success result
  v_result := jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'transitioned_at', NOW()
  );

  -- Add gate info if Stage 20 transition
  IF p_from_stage = 20 AND p_to_stage = 21 THEN
    v_result := v_result || jsonb_build_object(
      'gate_status', 'PASSED',
      'compliance_gate', v_gate_result
    );
  END IF;

  RETURN v_result;

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

COMMENT ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) IS
'Advances a venture from one stage to the next.
Updated for SD-LIFECYCLE-GAP-002: Enforces compliance gate at Stage 20.

Parameters:
- p_venture_id: UUID of the venture
- p_from_stage: Current stage (must match ventures.current_lifecycle_stage)
- p_to_stage: Target stage
- p_handoff_data: Optional JSONB with approval details (can include user_id for gate logging)

Returns JSONB with success status and transition details.
Stage 20→21 transitions will be BLOCKED if compliance gate fails.';

-- ============================================================================
-- Summary
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SD-LIFECYCLE-GAP-002 Stage 20 Gate Integration Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Updated: fn_advance_venture_stage()';
  RAISE NOTICE 'Stage 20→21 now requires compliance gate PASS';
  RAISE NOTICE '';
END $$;
