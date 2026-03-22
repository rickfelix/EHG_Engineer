-- ============================================================================
-- Update bootstrap_venture_workflow and approve_chairman_decision for 26 stages
-- ============================================================================
-- SD: SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001
--
-- bootstrap_venture_workflow:
--   - Gate stages: [3,5,10,13,16,17,22,23,24] → [3,5,10,13,17,18,23,24,25]
--   - Max tier stage: 25 → 26
--
-- approve_chairman_decision:
--   - Stage 22 'release' → Stage 23 'release'
--   - Stage 25 'continue' → Stage 26 'continue'
-- ============================================================================

-- 1. Update bootstrap_venture_workflow
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
  v_gate_stages INTEGER[] := ARRAY[3, 5, 10, 13, 17, 18, 23, 24, 25];
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
    ELSE 26
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
      work_type
    ) VALUES (
      p_venture_id,
      v_stage,
      CASE WHEN v_stage < v_current THEN 'completed'
           WHEN v_stage = v_current THEN 'in_progress'
           ELSE 'not_started'
      END,
      v_work_type
    )
    ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

    v_rows_created := v_rows_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture.name,
    'stages_created', v_rows_created,
    'tier', v_venture.tier,
    'tier_max', v_tier_max
  );
END;
$fn$;

COMMENT ON FUNCTION bootstrap_venture_workflow(UUID) IS
  'Bootstrap venture_stage_work rows for a venture. Gate stages: [3,5,10,13,17,18,23,24,25]. Max: 26. Updated for SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001.';

-- 2. Update approve_chairman_decision
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
      WHEN lifecycle_stage = 23 THEN 'release'
      WHEN lifecycle_stage = 26 THEN 'continue'
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

  -- Mark stage_work as completed after approval
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

COMMENT ON FUNCTION approve_chairman_decision(UUID, TEXT, TEXT) IS
  'Approve a pending chairman decision. Stage-aware decisions: stage 10=approve, 23=release, 26=continue. Updated for SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001.';
