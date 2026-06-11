-- @approved-by: codestreetlabs@gmail.com
-- Approval context: chairman (Rick Felix) — SD-LEO-INFRA-DATADISTILL-HONEST-LAUNCH-001
--   honest-launch campaign fix-forward (first-contact defect #8).
--
-- DEFECT: fn_advance_venture_stage declares v_canonical_required JSONB but
-- SELECTs venture_stages.required_artifacts (a text[] column) INTO it. The
-- implicit text[]->jsonb coercion throws 'invalid input syntax for type json'
-- for ANY stage whose required_artifacts is populated (e.g. stage 23
-- '{launch_readiness_checklist}'), caught by EXCEPTION WHEN OTHERS into a
-- generic {success:false}. Consequence: stage advancement was IMPOSSIBLE from
-- any artifact-gated stage. Witnessed live on DataDistill 23->24 (the first
-- venture ever to attempt it). The UNIFY-VENTURE-STAGE-001-C comment assumed
-- 'IDENTICAL _text type' — true of the column swap, but the function variable
-- was jsonb from the lifecycle_stage_config era.
--
-- FIX (minimal): read the text[] column directly into the text[] variable;
-- drop the jsonb intermediary + conversion. No other logic touched.
CREATE OR REPLACE FUNCTION fn_advance_venture_stage(
  p_venture_id uuid, p_from_stage integer, p_to_stage integer,
  p_handoff_data jsonb DEFAULT '{}'::jsonb, p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_gate_result JSONB;
  v_user_id UUID;
  v_idem_key UUID;
  v_missing_artifacts JSONB;
  v_gate_type TEXT;
  v_review_mode TEXT;
  v_canonical_array text[];
  v_legacy_array text[];
  v_required_artifacts text[];
  v_s22_flag_enabled boolean;
  v_legacy_skipped boolean;
  v_artifact_source text;
BEGIN
  SELECT current_lifecycle_stage, name INTO v_current_stage, v_venture_name
  FROM ventures WHERE id = p_venture_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found', 'venture_id', p_venture_id);
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stage mismatch', 'current_stage', v_current_stage, 'from_stage', p_from_stage);
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 26 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid to_stage', 'to_stage', p_to_stage);
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM venture_stage_transitions WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'was_duplicate', true, 'venture_id', p_venture_id);
    END IF;
  END IF;

  SELECT COALESCE(sc.gate_type, 'none'), COALESCE(sc.review_mode, 'review')
  INTO v_gate_type, v_review_mode
  FROM venture_stages sc
  WHERE sc.stage_number = p_from_stage
  FOR SHARE;

  IF NOT FOUND THEN
    v_gate_type := 'none';
    v_review_mode := 'review';
  END IF;

  IF v_review_mode = 'review' THEN
    IF NOT EXISTS (
      SELECT 1 FROM chairman_decisions
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = p_from_stage
        AND status = 'approved'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'review_gate_blocked',
        'message', format('Stage %s requires chairman review approval', p_from_stage),
        'venture_id', p_venture_id,
        'stage', p_from_stage,
        'gate_type', v_gate_type,
        'review_mode', v_review_mode
      );
    END IF;
  END IF;

  IF v_gate_type IN ('kill', 'promotion') THEN
    IF NOT EXISTS (
      SELECT 1 FROM chairman_decisions
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = p_from_stage
        AND status = 'approved'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'gate_blocked',
        'message', format('Stage %s has %s gate requiring approval', p_from_stage, v_gate_type),
        'venture_id', p_venture_id,
        'stage', p_from_stage,
        'gate_type', v_gate_type,
        'review_mode', v_review_mode
      );
    END IF;
  END IF;

  SELECT is_enabled INTO v_s22_flag_enabled
  FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED';
  v_s22_flag_enabled := COALESCE(v_s22_flag_enabled, false);

  SELECT COALESCE((metadata->>'s22_legacy_skipped')::boolean, false)
  INTO v_legacy_skipped
  FROM ventures WHERE id = p_venture_id;

  -- SD-LEO-INFRA-DATADISTILL-HONEST-LAUNCH-001 defect #8 fix: required_artifacts
  -- is text[]; read it directly (was: SELECT INTO a jsonb var -> cast exception).
  SELECT required_artifacts INTO v_canonical_array
  FROM venture_stages
  WHERE stage_number = p_from_stage;
  v_canonical_array := COALESCE(v_canonical_array, ARRAY[]::text[]);

  SELECT array_agg(artifact_type) INTO v_legacy_array
  FROM stage_artifact_requirements
  WHERE stage_number = p_from_stage AND is_blocking = true;
  v_legacy_array := COALESCE(v_legacy_array, ARRAY[]::text[]);

  IF v_legacy_skipped AND p_from_stage = 22 THEN
    v_required_artifacts := ARRAY[]::text[];
    v_artifact_source := 'bypass_s22_legacy_skipped';
  ELSIF v_s22_flag_enabled THEN
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical';
  ELSIF array_length(v_canonical_array, 1) IS NOT NULL THEN
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical_with_fallback_available';
  ELSE
    v_required_artifacts := v_legacy_array;
    v_artifact_source := 'legacy_fallback';
  END IF;

  IF array_length(v_required_artifacts, 1) IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('artifact_type', a))
    INTO v_missing_artifacts
    FROM unnest(v_required_artifacts) a
    WHERE NOT EXISTS (
      SELECT 1 FROM venture_artifacts va
      WHERE va.venture_id = p_venture_id
        AND va.artifact_type = a
        AND va.is_current = true
    );

    IF v_missing_artifacts IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'artifact_precondition_unmet',
        'missing', v_missing_artifacts,
        'venture_id', p_venture_id,
        'stage', p_from_stage,
        'source', v_artifact_source,
        'flag_enabled', v_s22_flag_enabled
      );
    END IF;
  END IF;

  IF p_from_stage = 21 AND p_to_stage = 22 THEN
    v_user_id := (p_handoff_data->>'user_id')::UUID;
    v_gate_result := evaluate_stage20_compliance_gate(p_venture_id, v_user_id);
    IF NOT (v_gate_result->>'success')::BOOLEAN THEN
      RETURN jsonb_build_object('success', false, 'error', 'Compliance gate failed', 'gate_result', v_gate_result);
    END IF;
    IF (v_gate_result->>'outcome') = 'FAIL' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Compliance gate blocked', 'gate_status', 'BLOCKED', 'gate_result', v_gate_result);
    END IF;
    PERFORM record_compliance_gate_passed(p_venture_id, v_user_id);
  END IF;

  UPDATE ventures SET current_lifecycle_stage = p_to_stage, updated_at = NOW() WHERE id = p_venture_id;

  UPDATE venture_stage_work SET stage_status = 'completed', completed_at = NOW()
  WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage;

  v_idem_key := COALESCE(p_idempotency_key, gen_random_uuid());

  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    approved_by, handoff_data, idempotency_key
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, 'normal',
    COALESCE(p_handoff_data->>'ceo_agent_id', 'system'), p_handoff_data, v_idem_key
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'venture_id', p_venture_id, 'venture_name', v_venture_name,
    'from_stage', p_from_stage, 'to_stage', p_to_stage,
    'transitioned_at', NOW(),
    'idempotency_key', v_idem_key,
    'artifact_source', v_artifact_source,
    'flag_enabled', v_s22_flag_enabled
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'venture_id', p_venture_id);
END;
$$;
