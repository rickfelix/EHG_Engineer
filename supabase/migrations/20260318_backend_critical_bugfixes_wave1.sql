-- ============================================================================
-- Wave 1: Critical Backend Bug Fixes
-- SD-VW-BACKEND-CRITICAL-BUGFIXES-001
-- ============================================================================
-- Fixes:
--   Bug 1: approve_chairman_decision RPC doesn't mark stage_work completed
--   Bug 2: advance_venture_stage missing stages 10, 24 from gate catalog
--   Bug 3: bootstrap_venture_workflow ignores current_lifecycle_stage
-- ============================================================================

-- ============================================================================
-- Bug 1: approve_chairman_decision - mark stage_work as completed
-- ============================================================================
CREATE OR REPLACE FUNCTION approve_chairman_decision(
  p_decision_id UUID,
  p_rationale TEXT DEFAULT NULL,
  p_decided_by TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_decision RECORD;
BEGIN
  -- Lock the row
  SELECT * INTO v_decision
  FROM chairman_decisions
  WHERE id = p_decision_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Decision not found or already resolved'
    );
  END IF;

  -- Update decision with stage-aware decision value
  UPDATE chairman_decisions SET
    decision = CASE
      WHEN lifecycle_stage = 0 THEN 'proceed'
      WHEN lifecycle_stage = 10 THEN 'approve'
      WHEN lifecycle_stage = 22 THEN 'release'
      WHEN lifecycle_stage = 25 THEN 'continue'
      ELSE 'go'
    END,
    status = 'approved',
    rationale = COALESCE(p_rationale, 'Approved by Chairman'),
    decided_by = COALESCE(p_decided_by, auth.uid()::text),
    blocking = false,
    updated_at = now()
  WHERE id = p_decision_id;

  -- Unblock the orchestrator so the worker picks the venture back up
  UPDATE ventures
  SET orchestrator_state = 'idle',
      updated_at = now()
  WHERE id = v_decision.venture_id
    AND orchestrator_state = 'blocked';

  -- Bug 1 fix: Mark stage_work as completed after approval
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      completed_at = NOW()
  WHERE venture_id = v_decision.venture_id
    AND lifecycle_stage = v_decision.lifecycle_stage
    AND stage_status != 'completed';

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'venture_id', v_decision.venture_id,
    'lifecycle_stage', v_decision.lifecycle_stage,
    'new_status', 'approved'
  );
END;
$$;

-- ============================================================================
-- Bug 2: advance_venture_stage - add stages 10 and 24 to gate catalog
-- ============================================================================
-- This updates the v_all_gates array to include promotion gates 10 and 24,
-- matching the worker's BLOCKING set: [3, 5, 10, 13, 16, 17, 22, 23, 24]
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
  v_promotion_gates INTEGER[] := ARRAY[10, 16, 17, 22, 24];
  v_all_gates INTEGER[] := ARRAY[3, 5, 10, 13, 16, 17, 22, 23, 24];
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
      'expected', v_current_stage,
      'received', p_from_stage
    );
  END IF;

  -- Validate to_stage is exactly from_stage + 1 (no skipping)
  IF p_to_stage != p_from_stage + 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_stage_jump',
      'from', p_from_stage,
      'to', p_to_stage
    );
  END IF;

  -- If FROM stage is a gate, verify approved decision exists
  IF p_from_stage = ANY(v_all_gates) THEN
    SELECT id, status, decision
      INTO v_gate_decision
      FROM chairman_decisions
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = p_from_stage
        AND status = 'approved'
      ORDER BY created_at DESC
      LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'gate_not_approved',
        'stage', p_from_stage,
        'gate_type', CASE
          WHEN p_from_stage = ANY(v_kill_gates) THEN 'kill'
          ELSE 'promotion'
        END
      );
    END IF;
  END IF;

  -- Generate idempotency key
  v_idempotency := gen_random_uuid();

  -- Mark current stage_work as completed
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      completed_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_from_stage
    AND stage_status != 'completed';

  -- Advance the venture
  UPDATE ventures
  SET current_lifecycle_stage = p_to_stage,
      updated_at = NOW()
  WHERE id = p_venture_id;

  -- Create/update stage_work for new stage
  INSERT INTO venture_stage_work (
    venture_id, lifecycle_stage, stage_status, started_at
  ) VALUES (
    p_venture_id, p_to_stage, 'in_progress', NOW()
  )
  ON CONFLICT (venture_id, lifecycle_stage)
  DO UPDATE SET
    stage_status = 'in_progress',
    started_at = COALESCE(venture_stage_work.started_at, NOW());

  -- Record stage transition
  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type, idempotency_key
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, p_transition_type, v_idempotency
  );

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'gate_approved', p_from_stage = ANY(v_all_gates),
    'idempotency_key', v_idempotency
  );
END;
$fn$;

-- ============================================================================
-- Bug 3: bootstrap_venture_workflow - respect current_lifecycle_stage
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
  v_current INTEGER;
  v_gate_stages INTEGER[] := ARRAY[3, 5, 10, 13, 16, 17, 22, 23, 24];
BEGIN
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

  v_current := COALESCE(v_venture.current_lifecycle_stage, 1);

  v_tier_max := CASE v_venture.tier
    WHEN 0 THEN 3
    WHEN 1 THEN 10
    WHEN 2 THEN 15
    ELSE 25
  END;

  FOR v_stage IN 1..v_tier_max LOOP
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
      -- Bug 3 fix: seed based on actual current stage, not always stage 1
      CASE
        WHEN v_stage < v_current THEN 'completed'
        WHEN v_stage = v_current THEN 'in_progress'
        ELSE 'not_started'
      END,
      v_work_type,
      CASE WHEN v_stage <= v_current THEN NOW() ELSE NULL END
    )
    ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

    IF FOUND THEN
      v_rows_created := v_rows_created + 1;
    END IF;
  END LOOP;

  -- Insert STAGE_ENTRY event for the current stage (not always stage 1)
  IF NOT EXISTS (
    SELECT 1 FROM stage_events
    WHERE venture_id = p_venture_id
      AND stage_number = v_current
      AND event_type = 'STAGE_ENTRY'
  ) THEN
    INSERT INTO stage_events (
      id, venture_id, stage_number, event_type, event_data, created_at
    ) VALUES (
      gen_random_uuid(), p_venture_id, v_current, 'STAGE_ENTRY',
      jsonb_build_object('source', 'bootstrap', 'tier_max', v_tier_max, 'current_stage', v_current),
      NOW()
    );
  END IF;

  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type, approved_by, handoff_data, idempotency_key
  ) VALUES (
    p_venture_id, 0, v_current, 'normal', 'system:bootstrap',
    jsonb_build_object('tier_max', v_tier_max, 'rows_created', v_rows_created, 'current_stage', v_current),
    uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, p_venture_id::text || ':bootstrap')
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture.name,
    'tier', v_venture.tier,
    'tier_max', v_tier_max,
    'stages_created', v_rows_created,
    'current_stage', v_current
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'venture_id', p_venture_id
  );
END;
$fn$;
