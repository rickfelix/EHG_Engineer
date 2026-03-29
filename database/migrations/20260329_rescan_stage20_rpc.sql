-- Rescan Stage 20: Refresh SD completion status for a venture
-- Called from Chairman Dashboard to trigger build execution progress check.
--
-- Returns JSON: { success, total, terminal, pending_count, stage_status, build_pending }

CREATE OR REPLACE FUNCTION rescan_stage_20(p_venture_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INTEGER;
  v_terminal INTEGER;
  v_pending INTEGER;
  v_all_terminal BOOLEAN;
  v_stage_status TEXT;
  v_advisory JSONB;
  v_current_stage INTEGER;
BEGIN
  -- Count SDs by terminal status
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled')),
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled'))
  INTO v_total, v_terminal, v_pending
  FROM strategic_directives_v2
  WHERE venture_id = p_venture_id;

  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'No SDs found for venture',
      'total', 0, 'terminal', 0, 'pending_count', 0
    );
  END IF;

  v_all_terminal := v_pending = 0;
  v_stage_status := CASE WHEN v_all_terminal THEN 'completed' ELSE 'in_progress' END;

  -- Build advisory_data with current SD statuses
  SELECT jsonb_build_object(
    'total_sds', v_total,
    'terminal_sds', v_terminal,
    'non_terminal_sds', v_pending,
    'build_pending', NOT v_all_terminal,
    'checked_at', NOW()::TEXT,
    'rescan_source', 'rpc:rescan_stage_20',
    'sd_statuses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sd_key', sd_key,
        'title', title,
        'status', status,
        'current_phase', current_phase,
        'sd_type', sd_type
      ) ORDER BY sd_key)
      FROM strategic_directives_v2
      WHERE venture_id = p_venture_id
    ), '[]'::jsonb)
  ) INTO v_advisory;

  -- Update venture_stage_work stage 20
  UPDATE venture_stage_work
  SET advisory_data = v_advisory,
      stage_status = v_stage_status,
      completed_at = CASE WHEN v_all_terminal THEN NOW() ELSE completed_at END,
      updated_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = 20;

  -- If all terminal, advance venture to stage 21
  IF v_all_terminal THEN
    SELECT current_lifecycle_stage INTO v_current_stage
    FROM ventures WHERE id = p_venture_id;

    IF v_current_stage IS NOT NULL AND v_current_stage <= 20 THEN
      UPDATE ventures
      SET current_lifecycle_stage = 21,
          orchestrator_state = 'idle'
      WHERE id = p_venture_id;

      -- Clean up stale chairman_decisions for Stage 20
      UPDATE chairman_decisions
      SET status = 'approved', decision = 'proceed', updated_at = NOW()
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = 20
        AND status = 'pending';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total', v_total,
    'terminal', v_terminal,
    'pending_count', v_pending,
    'stage_status', v_stage_status,
    'build_pending', NOT v_all_terminal,
    'advanced_to', CASE WHEN v_all_terminal AND v_current_stage <= 20 THEN 21 ELSE NULL END
  );
END;
$$;

COMMENT ON FUNCTION rescan_stage_20(UUID) IS
  'Rescans SD completion status for a venture and updates Stage 20 advisory_data. '
  'Called from Chairman Dashboard Stage 20 rescan button. '
  'Auto-advances venture to Stage 21 if all SDs are terminal.';
