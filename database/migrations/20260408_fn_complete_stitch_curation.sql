-- fn_complete_stitch_curation: Atomically mark stitch curation as completed
-- SD-LEO-FIX-GOOGLE-STITCH-PIPELINE-001-A
--
-- Transitions venture_artifacts stitch_curation status from 'awaiting_curation' to 'completed'.
-- Used by frontend StitchCurationCard "Mark Complete" button.

CREATE OR REPLACE FUNCTION fn_complete_stitch_curation(p_venture_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_artifact_id UUID;
  v_current_status TEXT;
BEGIN
  -- Find the latest stitch_curation artifact for this venture
  SELECT id, artifact_data->>'status'
  INTO v_artifact_id, v_current_status
  FROM venture_artifacts
  WHERE venture_id = p_venture_id
    AND artifact_type = 'stitch_curation'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_artifact_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No stitch curation artifact found for this venture'
    );
  END IF;

  IF v_current_status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Stitch curation already completed',
      'artifact_id', v_artifact_id
    );
  END IF;

  -- Atomically update the status
  UPDATE venture_artifacts
  SET artifact_data = artifact_data
    || jsonb_build_object('status', 'completed', 'completed_at', NOW()::TEXT)
  WHERE id = v_artifact_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stitch curation marked as completed',
    'artifact_id', v_artifact_id,
    'previous_status', v_current_status
  );
END;
$$;

-- Grant access for authenticated users (frontend calls via Supabase RPC)
GRANT EXECUTE ON FUNCTION fn_complete_stitch_curation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_complete_stitch_curation(UUID) TO service_role;
