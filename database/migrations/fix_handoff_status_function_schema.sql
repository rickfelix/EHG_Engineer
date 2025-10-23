-- Fix get_sd_handoff_status() function to use correct column names
-- Changes from_agent/to_agent to from_phase/to_phase
-- Date: 2025-10-20
-- Related: SD-2025-1020-HANDOFF-FIX

CREATE OR REPLACE FUNCTION get_sd_handoff_status(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  handoff_summary JSONB;
BEGIN
  SELECT jsonb_object_agg(
    handoff_type,
    jsonb_build_object(
      'exists', true,
      'status', status,
      'created_at', created_at,
      'from_phase', from_phase,
      'to_phase', to_phase
    )
  ) INTO handoff_summary
  FROM (
    SELECT DISTINCT ON (handoff_type)
      handoff_type,
      status,
      created_at,
      from_phase,
      to_phase
    FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    ORDER BY handoff_type, created_at DESC
  ) recent_handoffs;

  RETURN COALESCE(handoff_summary, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_sd_handoff_status IS 'Returns summary of all handoffs for an SD - FIXED to use from_phase/to_phase instead of from_agent/to_agent';

-- Verify fix
DO $$
BEGIN
  RAISE NOTICE 'SD-2025-1020-HANDOFF-FIX: get_sd_handoff_status() function updated successfully';
  RAISE NOTICE 'Changed from_agent/to_agent to from_phase/to_phase to match actual table schema';
END $$;
