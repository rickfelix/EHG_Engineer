-- ============================================================================
-- Fix advance_venture_stage: column mismatch + overload ambiguity
-- ============================================================================
-- Problem: 20260322_update_advance_stage_gates_26.sql introduced two bugs:
--   1. INSERT uses transitioned_at/metadata columns that don't exist on
--      venture_stage_transitions (actual columns: approved_by, handoff_data,
--      idempotency_key)
--   2. Dropped stage_events emits and venture_stage_work updates
--
-- Additionally, an old overload with p_idempotency_key UUID causes PostgREST
-- ambiguity (PGRST203) when the frontend omits the 4th parameter.
--
-- Fix: Merge 26-stage gate arrays into the working function body from
-- 20260318_remove_gate_autocreate_from_advance.sql, using correct columns.
-- Drop the orphaned p_idempotency_key overload.
--
-- Created: 2026-03-22
-- ============================================================================

-- Step 1: Drop the conflicting overload that causes PGRST203 ambiguity
DROP FUNCTION IF EXISTS advance_venture_stage(UUID, INTEGER, INTEGER, UUID);

-- Step 2: Replace with corrected function (26-stage gates + correct columns)
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
  -- 26-stage gate arrays (SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001)
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

  -- Record transition (correct column names: approved_by, handoff_data, idempotency_key)
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
    'system:advance', jsonb_build_object(
      'gate_decision_id', v_gate_decision.id,
      'venture_name', v_venture_name
    ), v_idempotency
  )
  ON CONFLICT DO NOTHING;

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

GRANT EXECUTE ON FUNCTION advance_venture_stage(UUID, INTEGER, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION advance_venture_stage(UUID, INTEGER, INTEGER, TEXT) IS
'Gate-enforced venture stage advancement. Kill gates: [3,5,13,24], Promotion gates: [17,18,23]. Max stage: 26.
Marks stages complete/in_progress, emits events, records transitions.
Fixed: uses correct venture_stage_transitions columns (approved_by, handoff_data, idempotency_key).';
