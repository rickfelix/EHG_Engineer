-- SD-MAN-ORCH-CLI-FRONTEND-PIPELINE-001-F: Enrich brief_data in get_gate_decision_status
-- Previously only stored {stage, ventureName}. Now includes artifact_context and advisory_summary.

CREATE OR REPLACE FUNCTION get_gate_decision_status(p_venture_id UUID, p_stage INTEGER)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_decision RECORD;
  v_stage_work RECORD;
  v_venture_name TEXT;
  v_new_id UUID;
  v_artifact_data jsonb;
  v_brief_data jsonb;
BEGIN
  -- Check for existing chairman_decisions record
  SELECT id, status, decision, decision_type,
         CASE WHEN status = 'approved' THEN true ELSE false END AS is_approved
  INTO v_decision
  FROM chairman_decisions
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_stage
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'has_decision', true,
      'decision_id', v_decision.id,
      'status', v_decision.status,
      'decision', v_decision.decision,
      'is_approved', v_decision.is_approved,
      'decision_type', v_decision.decision_type
    );
  END IF;

  -- No decision record exists — check if evidence is ready
  SELECT id, advisory_data
  INTO v_stage_work
  FROM venture_stage_work
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_stage
  ORDER BY created_at DESC
  LIMIT 1;

  -- If stage work exists with advisory_data, evidence is ready — create pending decision
  IF FOUND AND v_stage_work.advisory_data IS NOT NULL
     AND v_stage_work.advisory_data != '{}'::jsonb THEN

    -- Get venture name for summary
    SELECT name INTO v_venture_name
    FROM ventures
    WHERE id = p_venture_id;

    -- SD-MAN-ORCH-CLI-FRONTEND-PIPELINE-001-F: Enrich brief_data with artifact context
    SELECT artifact_data INTO v_artifact_data
    FROM venture_artifacts
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_stage
      AND is_current = true
    ORDER BY created_at DESC
    LIMIT 1;

    -- Build enriched brief_data
    v_brief_data := jsonb_build_object(
      'stage', p_stage,
      'ventureName', COALESCE(v_venture_name, 'Unknown')
    );

    -- Merge artifact data if available
    IF v_artifact_data IS NOT NULL THEN
      v_brief_data := v_brief_data || jsonb_build_object('artifact_context', v_artifact_data);
    END IF;

    -- Also include advisory_data summary if present
    IF v_stage_work.advisory_data IS NOT NULL AND v_stage_work.advisory_data != '{}'::jsonb THEN
      v_brief_data := v_brief_data || jsonb_build_object('advisory_summary', v_stage_work.advisory_data);
    END IF;

    v_new_id := gen_random_uuid();

    INSERT INTO chairman_decisions (
      id, venture_id, lifecycle_stage, decision, status,
      summary, brief_data, blocking, mitigation_actions
    ) VALUES (
      v_new_id,
      p_venture_id,
      p_stage,
      'pending',
      'pending',
      'Chairman gate: Stage ' || p_stage || ' review for ' || COALESCE(v_venture_name, 'Unknown'),
      v_brief_data,
      false,
      '[]'::jsonb
    );

    RETURN jsonb_build_object(
      'has_decision', true,
      'decision_id', v_new_id,
      'status', 'pending',
      'decision', 'pending',
      'is_approved', false,
      'decision_type', NULL
    );
  END IF;

  -- No evidence yet — return no decision
  RETURN jsonb_build_object(
    'has_decision', false,
    'decision_id', NULL,
    'status', NULL,
    'decision', NULL,
    'is_approved', false,
    'decision_type', NULL
  );
END;
$$;
