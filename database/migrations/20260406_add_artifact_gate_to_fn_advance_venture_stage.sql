-- ============================================================================
-- SD-UNIFIED-STAGE-GATE-ARTIFACTPRECONDITION-ORCH-001-B
-- Add artifact precondition gate to fn_advance_venture_stage
-- ============================================================================
-- Injects a check against stage_artifact_requirements BEFORE the UPDATE.
-- If any blocking artifact requirement is unmet, returns a structured error
-- with error='artifact_precondition_unmet' and a list of missing artifacts.
-- RPC signature is unchanged; only a new error return type is added.
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
  v_missing_artifacts JSONB;
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

  -- ======================================================================
  -- ARTIFACT PRECONDITION GATE (SD-UNIFIED-STAGE-GATE-ARTIFACTPRECONDITION-ORCH-001-B)
  -- Check that all blocking artifact requirements for p_from_stage are met
  -- before allowing advancement.
  -- ======================================================================
  SELECT jsonb_agg(jsonb_build_object(
    'artifact_type', sar.artifact_type,
    'required_status', sar.required_status
  ))
  FROM stage_artifact_requirements sar
  WHERE sar.stage_number = p_from_stage
    AND sar.is_blocking = true
    AND NOT EXISTS (
      SELECT 1 FROM venture_artifacts va
      WHERE va.venture_id = p_venture_id
        AND va.artifact_type = sar.artifact_type
        AND va.status = sar.required_status
    )
  INTO v_missing_artifacts;

  IF v_missing_artifacts IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'artifact_precondition_unmet',
      'missing', v_missing_artifacts,
      'venture_id', p_venture_id,
      'stage', p_from_stage
    );
  END IF;
  -- ======================================================================

  -- Update ventures table
  UPDATE ventures
  SET current_lifecycle_stage = p_to_stage,
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
'Advances a venture from one stage to the next with artifact precondition gate.
Checks stage_artifact_requirements for blocking requirements before allowing advancement.
Returns structured error with missing artifact details if preconditions unmet.

Parameters:
- p_venture_id: UUID of the venture
- p_from_stage: Current stage (must match ventures.current_lifecycle_stage)
- p_to_stage: Target stage
- p_handoff_data: Optional JSONB with CEO approval details

Returns JSONB with success status and transition details.
Added: SD-UNIFIED-STAGE-GATE-ARTIFACTPRECONDITION-ORCH-001-B';

-- Ensure permissions are maintained
GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) TO service_role;
