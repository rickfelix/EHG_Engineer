-- Migration: Update approve_chairman_decision RPC to unblock orchestrator
-- After recording the approval, set the venture's orchestrator_state to 'idle'
-- so the stage-execution-worker picks it back up automatically.
--
-- Rollback: Re-run the original migration at:
--   ehg/supabase/migrations/20260302_001_create_approve_chairman_decision.sql

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

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'venture_id', v_decision.venture_id,
    'lifecycle_stage', v_decision.lifecycle_stage,
    'new_status', 'approved'
  );
END;
$$;
