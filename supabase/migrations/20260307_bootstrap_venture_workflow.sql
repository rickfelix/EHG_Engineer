-- ============================================================================
-- Venture Workflow Bootstrapping
-- ============================================================================
-- Creates two RPC functions:
--   1. bootstrap_venture_workflow(p_venture_id) — scaffolds stage work rows
--   2. advance_venture_stage(p_venture_id, from, to, type) — gate-enforced advancement
--
-- Created: 2026-03-07
-- ============================================================================

-- ============================================================================
-- Ensure uuid-ossp extension for uuid_generate_v5
-- (must be before function definitions that reference it)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- FUNCTION 1: bootstrap_venture_workflow
-- ============================================================================
-- Idempotent: safe to call multiple times (ON CONFLICT DO NOTHING)
-- Locks the venture row to prevent races
-- Creates venture_stage_work rows for stages 1..tier_max
-- Stage 1 starts in_progress; all others not_started
-- Inserts STAGE_ENTRY event for stage 1
-- Records bootstrap transition in venture_stage_transitions
-- ============================================================================

CREATE OR REPLACE FUNCTION bootstrap_venture_workflow(p_venture_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_venture RECORD;
  v_tier_max INTEGER;
  v_stage INTEGER;
  v_work_type TEXT;
  v_rows_created INTEGER := 0;
  v_gate_stages INTEGER[] := ARRAY[3, 5, 13, 16, 17, 22, 23];
BEGIN
  -- Lock the venture row to prevent concurrent bootstraps
  SELECT id, name, tier, current_lifecycle_stage
    INTO v_venture
    FROM ventures
    WHERE id = p_venture_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Venture not found',
      'venture_id', p_venture_id
    );
  END IF;

  -- Determine max stages based on tier
  v_tier_max := CASE v_venture.tier
    WHEN 0 THEN 3
    WHEN 1 THEN 10
    WHEN 2 THEN 15
    ELSE 25  -- null or any other value = full lifecycle
  END;

  -- Create venture_stage_work rows for each stage
  FOR v_stage IN 1..v_tier_max LOOP
    -- Determine work_type
    IF v_stage = ANY(v_gate_stages) THEN
      v_work_type := 'decision_gate';
    ELSIF v_stage = 2 THEN
      v_work_type := 'automated_check';
    ELSE
      v_work_type := 'artifact_only';
    END IF;

    INSERT INTO venture_stage_work (
      venture_id,
      lifecycle_stage,
      stage_status,
      work_type,
      started_at
    ) VALUES (
      p_venture_id,
      v_stage,
      CASE WHEN v_stage = 1 THEN 'in_progress' ELSE 'not_started' END,
      v_work_type,
      CASE WHEN v_stage = 1 THEN NOW() ELSE NULL END
    )
    ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

    IF FOUND THEN
      v_rows_created := v_rows_created + 1;
    END IF;
  END LOOP;

  -- Insert STAGE_ENTRY event for stage 1 (idempotent via check)
  IF NOT EXISTS (
    SELECT 1 FROM stage_events
    WHERE venture_id = p_venture_id
      AND stage_number = 1
      AND event_type = 'STAGE_ENTRY'
  ) THEN
    INSERT INTO stage_events (
      id,
      venture_id,
      stage_number,
      event_type,
      event_data,
      created_at
    ) VALUES (
      gen_random_uuid(),
      p_venture_id,
      1,
      'STAGE_ENTRY',
      jsonb_build_object('source', 'bootstrap', 'tier_max', v_tier_max),
      NOW()
    );
  END IF;

  -- Record bootstrap transition (from_stage=0 for initial bootstrap)
  INSERT INTO venture_stage_transitions (
    venture_id,
    from_stage,
    to_stage,
    transition_type,
    approved_by,
    handoff_data,
    idempotency_key
  ) VALUES (
    p_venture_id,
    0,
    1,
    'normal',
    'system:bootstrap',
    jsonb_build_object('tier_max', v_tier_max, 'rows_created', v_rows_created),
    -- Deterministic UUID from venture_id for idempotency
    uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, p_venture_id::text || ':bootstrap')
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture.name,
    'tier', v_venture.tier,
    'tier_max', v_tier_max,
    'stages_created', v_rows_created
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'venture_id', p_venture_id
  );
END;
$fn$;

COMMENT ON FUNCTION bootstrap_venture_workflow(UUID) IS
'Scaffolds all venture_stage_work rows and initial events for a new venture.
Idempotent — safe to call multiple times. Uses tier to determine stage count.';

GRANT EXECUTE ON FUNCTION bootstrap_venture_workflow(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION bootstrap_venture_workflow(UUID) TO service_role;

-- ============================================================================
-- FUNCTION 2: advance_venture_stage
-- ============================================================================
-- Gate-enforced stage advancement:
--   - Validates current stage matches p_from_stage
--   - If from_stage is a gate, requires approved chairman_decisions row
--   - Marks current stage completed, advances ventures.current_lifecycle_stage
--   - Marks next stage in_progress
--   - Emits STAGE_COMPLETE + STAGE_ENTRY events
--   - Records transition (idempotent via idempotency_key)
--   - If next stage is a gate, creates pending chairman_decisions row
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
        'error', 'gate_blocked',
        'gate_stage', p_from_stage,
        'message', 'Chairman approval required to advance past gate stage ' || p_from_stage
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

  -- Record transition (idempotent, with sequence counter to avoid collisions on REVISE loops)
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
    'system:advance', jsonb_build_object(), v_idempotency
  )
  ON CONFLICT DO NOTHING;

  -- If next stage is a gate, create pending chairman_decisions row
  IF p_to_stage = ANY(v_all_gates) THEN
    -- Determine gate type for decision_type column
    IF p_to_stage = ANY(v_kill_gates) THEN
      v_gate_type := 'kill_gate';
    ELSE
      v_gate_type := 'promotion_gate';
    END IF;

    INSERT INTO chairman_decisions (
      venture_id, lifecycle_stage, decision, status, decision_type,
      summary
    ) VALUES (
      p_venture_id, p_to_stage, 'pending', 'pending', v_gate_type,
      'Auto-created: venture reached gate stage ' || p_to_stage
    )
    -- Unique partial index prevents duplicate pending decisions per (venture_id, lifecycle_stage)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'transition_type', p_transition_type,
    'gate_created', (p_to_stage = ANY(v_all_gates))
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

COMMENT ON FUNCTION advance_venture_stage(UUID, INTEGER, INTEGER, TEXT) IS
'Gate-enforced stage advancement. Requires chairman approval at gate stages.
Marks stages complete/in_progress, emits events, records transitions.
If next stage is a gate, creates a pending chairman_decisions row.';

GRANT EXECUTE ON FUNCTION advance_venture_stage(UUID, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION advance_venture_stage(UUID, INTEGER, INTEGER, TEXT) TO service_role;

-- ============================================================================
-- SUMMARY
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Venture Workflow Bootstrapping - Complete';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Created: bootstrap_venture_workflow(UUID)';
  RAISE NOTICE 'Created: advance_venture_stage(UUID, INT, INT, TEXT)';
  RAISE NOTICE '';
END $$;
