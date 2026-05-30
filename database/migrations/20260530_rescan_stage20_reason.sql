-- @approved-by: rickfelix@example.com
-- SD-LEO-INFRA-STAGE-RESCAN-STAGE-001
-- Additive, backward-compatible: add a human-readable `reason` to the rescan_stage_20
-- success return so a Chairman-dashboard operator who clicks "rescan" and sees no
-- advancement learns WHY (deployment URL not registered, or SDs still in progress).
-- The function body, side effects (venture_stage_work / ventures / chairman_decisions
-- updates), and all pre-existing return keys are unchanged — only the `reason` key is added.
-- Consumers (EHG Stage20BuildExecution.tsx, ReplitStatusPanel.tsx; types.ts Returns: Json)
-- are unaffected by the additive key.

CREATE OR REPLACE FUNCTION public.rescan_stage_20(p_venture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  SELECT deployment_url INTO v_deployment_url
  FROM ventures WHERE id = p_venture_id;
  v_artifact_verified := v_deployment_url IS NOT NULL AND v_deployment_url <> '';
  v_stage_status := CASE
    WHEN v_all_terminal AND v_artifact_verified THEN 'completed'
    WHEN v_all_terminal AND NOT v_artifact_verified THEN 'artifact_missing'
    ELSE 'in_progress'
  END;
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
  UPDATE venture_stage_work
  SET advisory_data = v_advisory,
      stage_status = v_stage_status,
      completed_at = CASE WHEN v_all_terminal AND v_artifact_verified THEN NOW() ELSE completed_at END,
      updated_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = 20;
  IF v_all_terminal AND v_artifact_verified THEN
    SELECT current_lifecycle_stage INTO v_current_stage
    FROM ventures WHERE id = p_venture_id;
    IF v_current_stage IS NOT NULL AND v_current_stage <= 20 THEN
      UPDATE ventures
      SET current_lifecycle_stage = 21,
          orchestrator_state = 'idle'
      WHERE id = p_venture_id;
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
    'advanced_to', CASE WHEN v_all_terminal AND v_artifact_verified AND v_current_stage <= 20 THEN 21 ELSE NULL END,
    -- SD-LEO-INFRA-STAGE-RESCAN-STAGE-001: human-readable cause for advance/non-advance
    'reason', CASE
      WHEN v_all_terminal AND v_artifact_verified AND v_current_stage IS NOT NULL AND v_current_stage <= 20
        THEN 'Stage 20 complete - advanced to stage 21'
      WHEN v_all_terminal AND v_artifact_verified
        THEN 'Stage 20 complete'
      WHEN v_all_terminal AND NOT v_artifact_verified
        THEN 'Deployment URL not registered - register your live deployment to advance past Stage 20'
      ELSE v_pending::text || ' SD(s) still in progress - complete all venture SDs to advance Stage 20'
    END
  );
END;
$function$;

-- Self-verification: fail the deploy if the reason branches did not land.
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.rescan_stage_20(uuid)'::regprocedure);
  ASSERT v_def LIKE '%''reason''%', 'rescan_stage_20: reason key missing';
  ASSERT v_def LIKE '%Deployment URL not registered%', 'rescan_stage_20: artifact_missing reason missing';
  ASSERT v_def LIKE '%still in progress%', 'rescan_stage_20: in_progress reason missing';
  ASSERT v_def LIKE '%advanced to stage 21%', 'rescan_stage_20: advancing reason missing';
END
$verify$;
