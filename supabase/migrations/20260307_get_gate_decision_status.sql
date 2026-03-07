-- Migration: Create SECURITY DEFINER RPC function get_gate_decision_status
-- Purpose: Allow unauthenticated (anon) reads of gate decision status for chairman_decisions
-- The chairman_decisions table has RLS that blocks anon reads — this function bypasses
-- RLS safely by returning only the specific fields needed for gate status checks.
--
-- Rollback: DROP FUNCTION IF EXISTS get_gate_decision_status(UUID, INTEGER);

CREATE OR REPLACE FUNCTION get_gate_decision_status(
  p_venture_id UUID,
  p_stage INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT
    id,
    status,
    decision,
    decision_type
  INTO v_row
  FROM chairman_decisions
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_stage
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

-- Grant execute to anon and authenticated roles so the RPC is callable from the frontend
GRANT EXECUTE ON FUNCTION get_gate_decision_status(UUID, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_gate_decision_status(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION get_gate_decision_status(UUID, INTEGER) IS
  'Returns gate decision status for a venture at a specific lifecycle stage. '
  'SECURITY DEFINER: bypasses RLS on chairman_decisions to allow anon reads of gate status.';
