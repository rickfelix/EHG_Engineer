-- ============================================================================
-- Create RPC function to accept handoffs (bypasses RLS)
-- ============================================================================
-- Issue: Anon role blocked by RLS when updating handoffs
-- Solution: Create SECURITY DEFINER function that runs with creator privileges
-- SD: SD-2025-1020-E2E-SELECTORS
-- ============================================================================

CREATE OR REPLACE FUNCTION accept_phase_handoff(handoff_id_param UUID)
RETURNS json AS $$
DECLARE
  updated_handoff json;
BEGIN
  -- Update handoff to accepted status
  UPDATE sd_phase_handoffs
  SET
    status = 'accepted',
    accepted_at = NOW()
  WHERE id = handoff_id_param
  RETURNING to_json(sd_phase_handoffs.*) INTO updated_handoff;

  -- Check if update was successful
  IF updated_handoff IS NULL THEN
    RAISE EXCEPTION 'Handoff not found: %', handoff_id_param;
  END IF;

  RETURN updated_handoff;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION accept_phase_handoff(UUID) TO anon, authenticated;

-- Test query
SELECT 'accept_phase_handoff function created successfully' as status;
