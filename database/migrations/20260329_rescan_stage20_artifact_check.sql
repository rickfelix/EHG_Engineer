-- Enhance rescan_stage_20: Add user-facing artifact verification
-- SD-LEO-ORCH-VENTURE-FACTORY-OUTPUT-QUALITY-001-C
--
-- Extends the existing rescan_stage_20 RPC to verify that ventures
-- have user-facing artifacts (deployment_url) before advancing.

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
  v_deployment_url TEXT;
  v_artifact_verified BOOLEAN;
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

  -- Check for user-facing artifacts (deployment_url)
  SELECT deployment_url INTO v_deployment_url
  FROM ventures WHERE id = p_venture_id;

  v_artifact_verified := v_deployment_url IS NOT NULL AND v_deployment_url <> '';

  -- Stage status considers both SD completion AND artifact presence
  v_stage_status := CASE
    WHEN v_all_terminal AND v_artifact_verified THEN 'completed'
    WHEN v_all_terminal AND NOT v_artifact_verified THEN 'artifact_missing'
    ELSE 'in_progress'
  END;

  -- Build advisory_data with current SD statuses and artifact info
  SELECT jsonb_build_object(
    'total_sds', v_total,
    'terminal_sds', v_terminal,
    'non_terminal_sds', v_pending,
    'build_pending', NOT v_all_terminal,
    'artifact_verified', v_artifact_verified,
    'deployment_url', v_deployment_url,
    'stakeholder_review', jsonb_build_object(
      'has_artifact', v_artifact_verified,
      'artifact_type', CASE WHEN v_artifact_verified THEN 'deployment' ELSE NULL END,
      'artifact_url', v_deployment_url
    ),
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
      completed_at = CASE WHEN v_all_terminal AND v_artifact_verified THEN NOW() ELSE completed_at END,
      updated_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = 20;

  -- Only advance if ALL SDs terminal AND artifact verified
  IF v_all_terminal AND v_artifact_verified THEN
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
    'artifact_verified', v_artifact_verified,
    'deployment_url', v_deployment_url,
    'advanced_to', CASE WHEN v_all_terminal AND v_artifact_verified AND v_current_stage <= 20 THEN 21 ELSE NULL END
  );
END;
$$;

COMMENT ON FUNCTION rescan_stage_20(UUID) IS
  'Rescans SD completion and artifact status for a venture at Stage 20. '
  'Checks deployment_url for user-facing artifacts. '
  'Only advances to Stage 21 if ALL SDs terminal AND artifact verified. '
  'Called from Chairman Dashboard Stage 20 rescan button.';
