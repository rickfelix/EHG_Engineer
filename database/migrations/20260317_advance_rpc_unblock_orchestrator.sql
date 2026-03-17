-- ============================================================================
-- Fix: fn_advance_venture_stage — Unblock Orchestrator + Column Name Fix
-- ============================================================================
-- Problem 1: "Mark Complete" button advances the stage but does NOT unblock
--            the orchestrator_state, so the worker never picks the venture
--            back up. The approve/reject buttons DO unblock (via chairman
--            decision watcher), but manual stage completion did not.
-- Problem 2: Line 77 references `stage_id` but the actual column in
--            venture_stage_work is `lifecycle_stage`.
--
-- Created: 2026-03-17
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

  -- Validate to_stage is valid (1-25 range, must be from_stage + 1 for normal advancement)
  IF p_to_stage < 1 OR p_to_stage > 25 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid to_stage - must be between 1 and 25',
      'to_stage', p_to_stage
    );
  END IF;

  -- Update ventures table
  UPDATE ventures
  SET current_lifecycle_stage = p_to_stage,
      updated_at = NOW()
  WHERE id = p_venture_id;

  -- FIX 1: Unblock orchestrator so the worker picks the venture back up.
  -- The approve/reject chairman decision buttons already do this, but
  -- "Mark Complete" (which calls this RPC) did not — leaving the venture
  -- stuck in 'blocked' state with no poll pickup.
  UPDATE ventures
  SET orchestrator_state = 'idle'
  WHERE id = p_venture_id
    AND orchestrator_state = 'blocked';

  -- FIX 2: Column is lifecycle_stage, not stage_id
  -- Mark the from_stage work as completed (if venture_stage_work table exists)
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      health_score = 100,
      completed_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_from_stage;

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
'Advances a venture from one stage to the next. Includes orchestrator unblock
and corrected column reference (lifecycle_stage instead of stage_id).

Parameters:
- p_venture_id: UUID of the venture
- p_from_stage: Current stage (must match ventures.current_lifecycle_stage)
- p_to_stage: Target stage
- p_handoff_data: Optional JSONB with CEO approval details

Returns JSONB with success status and transition details.';

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) TO service_role;

-- ============================================================================
-- SUMMARY
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Advance RPC Fix Migration Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Fix 1: Unblocks orchestrator_state when Mark Complete advances stage';
  RAISE NOTICE 'Fix 2: Corrected stage_id → lifecycle_stage in venture_stage_work UPDATE';
  RAISE NOTICE '';
END $$;
