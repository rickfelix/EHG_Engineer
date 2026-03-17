-- ============================================================================
-- SD-LEO-FIX-VENTURE-WORKFLOW-STAGE-001: Fix fn_advance_venture_stage
-- ============================================================================
-- Problem: fn_advance_venture_stage updates current_lifecycle_stage but does
--          NOT reset orchestrator_state to 'idle', causing the worker to remain
--          stuck in PROCESSING state after Mark Complete.
-- Solution: Add orchestrator_state reset to the function.
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

  -- Validate to_stage is valid (1-25 range)
  IF p_to_stage < 1 OR p_to_stage > 25 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid to_stage - must be between 1 and 25',
      'to_stage', p_to_stage
    );
  END IF;

  -- Update ventures table: advance stage AND reset orchestrator_state to idle
  UPDATE ventures
  SET current_lifecycle_stage = p_to_stage,
      orchestrator_state = 'idle',
      updated_at = NOW()
  WHERE id = p_venture_id;

  -- Mark the from_stage work as completed
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      health_score = 100,
      completed_at = NOW()
  WHERE venture_id = p_venture_id
    AND stage_id = p_from_stage;

  -- Log the transition
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
    'orchestrator_state', 'idle',
    'transitioned_at', NOW()
  );

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
'Advances a venture from one stage to the next and resets orchestrator_state to idle.
Fixed by SD-LEO-FIX-VENTURE-WORKFLOW-STAGE-001 to include orchestrator_state reset.';
