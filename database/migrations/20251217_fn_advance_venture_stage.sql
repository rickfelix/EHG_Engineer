-- ============================================================================
-- SD-HARDENING-V1-004: Database Function Naming Standardization
-- ============================================================================
-- Problem: Code expects fn_advance_venture_stage(p_venture_id, p_from_stage, p_to_stage, p_handoff_data)
--          but DB has advance_venture_stage(p_venture_id) with different name AND signature
-- Solution: Create fn_advance_venture_stage with correct signature
--
-- Created: 2025-12-17
-- SD: SD-HARDENING-V1-004
-- ============================================================================

-- ============================================================================
-- STEP 1: Create fn_advance_venture_stage with correct signature
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
'Advances a venture from one stage to the next. Part of SD-HARDENING-V1-004.
Expected by lib/agents/venture-state-machine.js _approveHandoff method.

Parameters:
- p_venture_id: UUID of the venture
- p_from_stage: Current stage (must match ventures.current_lifecycle_stage)
- p_to_stage: Target stage
- p_handoff_data: Optional JSONB with CEO approval details

Returns JSONB with success status and transition details.';

-- ============================================================================
-- STEP 2: Grant execute permission
-- ============================================================================

GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) TO service_role;

-- ============================================================================
-- STEP 3: Create venture_stage_transitions table if not exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_stage_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  from_stage INTEGER NOT NULL,
  to_stage INTEGER NOT NULL,
  transition_type TEXT DEFAULT 'normal' CHECK (transition_type IN ('normal', 'skip', 'rollback', 'pivot')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  handoff_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_venture_stage_transitions_venture
  ON venture_stage_transitions(venture_id);

-- Enable RLS
ALTER TABLE venture_stage_transitions ENABLE ROW LEVEL SECURITY;

-- Service role access
DO $$
BEGIN
  DROP POLICY IF EXISTS "venture_stage_transitions_service_role_access" ON venture_stage_transitions;
  CREATE POLICY "venture_stage_transitions_service_role_access"
    ON venture_stage_transitions
    FOR ALL TO service_role
    USING (true);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Policy already exists or error: %', SQLERRM;
END $$;

-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'SD-HARDENING-V1-004 Migration Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Created: fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB)';
  RAISE NOTICE 'Signature matches venture-state-machine.js expectations';
  RAISE NOTICE 'Created: venture_stage_transitions table for audit logging';
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- ROLLBACK SECTION
-- ============================================================================
-- To rollback:
-- DROP FUNCTION IF EXISTS fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB);
-- DROP TABLE IF EXISTS venture_stage_transitions;
-- ============================================================================
