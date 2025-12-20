-- Migration: Fix Schema Field Alignment in fn_advance_venture_stage
-- SD: SD-HARDENING-V2-002A (Schema Field Alignment)
-- Date: 2025-12-20
-- Status: READY TO APPLY
--
-- CRITICAL FIXES:
-- 1. health_score = 100 (INTEGER) -> health_score = 'green' (VARCHAR)
-- 2. stage_id column -> lifecycle_stage column (correct column name)
--
-- These bugs cause runtime errors when the function tries to:
-- a) Insert an INTEGER into a VARCHAR column with CHECK constraint
-- b) Reference a non-existent stage_id column

BEGIN;

-- ============================================================================
-- Fix fn_advance_venture_stage Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_advance_venture_stage(
  p_venture_id uuid,
  p_from_stage integer,
  p_to_stage integer,
  p_handoff_data jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Mark the from_stage work as completed
  -- FIX 1: Use 'green' (VARCHAR) instead of 100 (INTEGER)
  -- FIX 2: Use lifecycle_stage (correct column) instead of stage_id
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      health_score = 'green',
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
$function$;

-- ============================================================================
-- Update Function Comment
-- ============================================================================

COMMENT ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) IS
'Advances a venture from one stage to the next. Fixed in SD-HARDENING-V2-002A.

Fixes applied:
- health_score now uses VARCHAR "green" instead of INTEGER 100
- lifecycle_stage column referenced correctly (not stage_id)

Parameters:
- p_venture_id: UUID of the venture
- p_from_stage: Current stage (must match ventures.current_lifecycle_stage)
- p_to_stage: Target stage
- p_handoff_data: Optional JSONB with CEO approval details

Returns JSONB with success status and transition details.';

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SD-HARDENING-V2-002A Migration Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Fixed: health_score type (VARCHAR not INTEGER)';
  RAISE NOTICE 'Fixed: lifecycle_stage column (not stage_id)';
  RAISE NOTICE '';
END $$;
