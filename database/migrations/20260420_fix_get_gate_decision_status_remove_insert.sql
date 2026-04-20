-- Fix get_gate_decision_status: remove INSERT fallback that caused NOT NULL violation
-- Root cause: Live function had an INSERT path that created chairman_decisions rows
-- without decision_type, violating NOT NULL constraint. Frontend polled every 5s → 400 spam.
-- Fix: Replace with clean SELECT-only version. No INSERT side effects.
-- Executed: 2026-04-20 by database-agent

CREATE OR REPLACE FUNCTION get_gate_decision_status(
  p_venture_id UUID,
  p_stage INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT id, status, decision, decision_type
  INTO v_row
  FROM chairman_decisions
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_stage
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_decision', false,
      'decision_id', null,
      'status', null,
      'decision', null,
      'is_approved', false,
      'decision_type', null
    );
  END IF;

  RETURN jsonb_build_object(
    'has_decision', true,
    'decision_id', v_row.id,
    'status', v_row.status,
    'decision', v_row.decision,
    'is_approved', (
      v_row.status = 'approved'
      AND v_row.decision IN (
        'pass', 'go', 'proceed', 'approve',
        'conditional_pass', 'conditional_go',
        'continue', 'release'
      )
    ),
    'decision_type', v_row.decision_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_gate_decision_status(UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_gate_decision_status(UUID, INTEGER) TO authenticated;
