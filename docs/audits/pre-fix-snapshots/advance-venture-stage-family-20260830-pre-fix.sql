===== advance_venture_stage (6875 chars) =====
CREATE OR REPLACE FUNCTION public.advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_gate_type TEXT;
  v_gate_decision RECORD;
  v_gate_decision_id UUID := NULL;
  v_idempotency UUID;
  v_precondition JSONB;
BEGIN
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
          OR public.fn_user_has_venture_access(p_venture_id)) THEN
    RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
  END IF;

  SELECT current_lifecycle_stage, name
    INTO v_current_stage, v_venture_name
    FROM ventures
    WHERE id = p_venture_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'venture_not_found',
      'venture_id', p_venture_id
    );
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stage_mismatch',
      'current_stage', v_current_stage,
      'from_stage', p_from_stage
    );
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 27 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_to_stage',
      'to_stage', p_to_stage
    );
  END IF;

  -- FR-3: gate membership read fresh per call from the venture_stages SSOT (no cache), replacing the
  -- hardcoded kill/promotion/all-gates literal arrays that omitted gates 10/16/19/25 (names elided
  -- here on purpose: this comment describes a check performed by the ORIGINAL authoring migration
  -- (20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql), not this file's own
  -- verify block below, which checks a different thing (the p_to_stage bound) -- MECH-AMEND
  -- reword, 2026-08-25 sitting).
  --
  -- SECURITY (adversarial SECURITY review S-H3): a missing venture_stages row for p_from_stage must
  -- NOT silently disable the gate check. SELECT INTO leaves v_gate_type NULL when zero rows match,
  -- and COALESCE(gate_type, 'none') only handles a NULL *column value on a found row* -- it cannot
  -- distinguish "found a row with gate_type=NULL" from "no row at all" without FOUND, and the original
  -- code coalesced both to 'none', failing OPEN on a catalog gap (contradicting choke.sql's own
  -- FAIL-CLOSED-on-could-not-check principle). Fail closed instead: no SSOT row is a data-integrity
  -- problem, not evidence no gate applies.
  SELECT gate_type INTO v_gate_type
    FROM venture_stages
    WHERE stage_number = p_from_stage
    FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stage_gate_lookup_failed',
      'from_stage', p_from_stage,
      'message', format('No venture_stages catalog row for stage %s -- cannot determine gate requirements', p_from_stage)
    );
  END IF;
  v_gate_type := COALESCE(v_gate_type, 'none');

  IF v_gate_type IN ('kill', 'promotion') THEN
    SELECT id, decision, status INTO v_gate_decision
      FROM chairman_decisions
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = p_from_stage
        AND status = 'approved'
        AND decision IN ('pass', 'go', 'proceed', 'approve', 'conditional_pass', 'conditional_go', 'continue', 'release')
      ORDER BY created_at DESC
      LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'gate_not_approved',
        'gate_stage', p_from_stage,
        'gate_type', v_gate_type,
        'message', format('Chairman approval required at stage %s before advancing', p_from_stage)
      );
    END IF;

    v_gate_decision_id := v_gate_decision.id;
  END IF;

  v_precondition := public.fn_stage_artifact_precondition(p_venture_id, p_from_stage);
  IF (v_precondition->>'blocked')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'artifact_precondition_unmet',
      'missing_artifacts', v_precondition->'missing_artifacts',
      'deviated_artifacts', v_precondition->'deviated_artifacts',
      'source', v_precondition->>'source',
      'venture_id', p_venture_id,
      'from_stage', p_from_stage
    );
  END IF;

  UPDATE venture_stage_work
    SET stage_status = 'completed',
        completed_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_from_stage;

  -- FR-1/FR-2 self-stamp: stage_write_token identifies this RPC as the writer, in the SAME
  -- statement as the protected-column change, matching the registry identity 'advance_venture_stage'.
  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage,
        stage_write_token = 'advance_venture_stage',
        updated_at = NOW()
    WHERE id = p_venture_id;

  UPDATE venture_stage_work
    SET stage_status = 'in_progress',
        started_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_to_stage;

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_from_stage, 'STAGE_COMPLETE',
    jsonb_build_object('advanced_to', p_to_stage, 'transition_type', p_transition_type),
    NOW()
  );

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_to_stage, 'STAGE_ENTRY',
    jsonb_build_object('advanced_from', p_from_stage, 'transition_type', p_transition_type),
    NOW()
  );

  v_idempotency := uuid_generate_v5(
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_venture_id::text || ':' || p_from_stage::text || ':' || p_to_stage::text
      || ':' || COALESCE(
        (SELECT COUNT(*)::text FROM venture_stage_transitions
         WHERE venture_id = p_venture_id
           AND from_stage = p_from_stage
           AND to_stage = p_to_stage),
        '0')
  );

  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    approved_by, handoff_data, idempotency_key
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, p_transition_type,
    'system:advance', jsonb_build_object(
      'gate_decision_id', v_gate_decision_id,
      'venture_name', v_venture_name
    ), v_idempotency
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'transition_type', p_transition_type,
    'gate_created', false,
    'idempotency_key', v_idempotency
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'venture_id', p_venture_id,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage
  );
END;
$function$


===== fn_advance_venture_stage (9476 chars) =====
CREATE OR REPLACE FUNCTION public.fn_advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_handoff_data jsonb DEFAULT '{}'::jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_required_artifacts text[];
  v_s22_flag_enabled boolean;
  v_legacy_skipped boolean;
  v_artifact_source text;
  v_hc_flag_enabled boolean;
  v_is_high_consequence boolean;
  v_cutover_flag_enabled boolean;
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

  IF p_to_stage < 1 OR p_to_stage > 27 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid to_stage', 'to_stage', p_to_stage);
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM venture_stage_transitions WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'was_duplicate', true, 'venture_id', p_venture_id);
    END IF;
  END IF;

  SELECT COALESCE(sc.gate_type, 'none'), COALESCE(sc.review_mode, 'review'), COALESCE(sc.is_high_consequence, false)
  INTO v_gate_type, v_review_mode, v_is_high_consequence
  FROM venture_stages sc
  WHERE sc.stage_number = p_from_stage
  FOR SHARE;

  IF NOT FOUND THEN
    v_gate_type := 'none';
    v_review_mode := 'review';
    v_is_high_consequence := false;
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

  -- UPDATED (round-2, per SECURITY finding H-3, reversing the round-1 "documented, not fixed"
  -- disposition for THIS literal specifically): section 5a above already moves this stage's
  -- approved product_review decisions from lifecycle_stage=23 to 24 in the SAME migration --
  -- leaving this predicate reading p_from_stage=23 would mean the check looks for an approval at
  -- EXACTLY the stage the data was just moved away from, manufacturing (not merely inheriting) a
  -- desynchronization on the path into the irreversible go_live gate. That is a security
  -- regression, not a cosmetic staleness, so it is fixed here even though the broader JS-side
  -- literal (lib/eva/stage-execution-worker.js:2971, its 2 stage-templates dynamic imports, and
  -- chairman-product-review.js's own unaudited stage assumptions) remains its own, separately
  -- tracked, deliberately out-of-scope finding -- see this file's header banner.
  IF p_from_stage = 24 AND p_to_stage = 25 THEN
    IF NOT EXISTS (
      SELECT 1 FROM ventures
      WHERE id = p_venture_id
        AND (is_demo = true OR name ~* '^(parity-test-|test-stub)')
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM chairman_decisions
        WHERE venture_id = p_venture_id
          AND lifecycle_stage = p_from_stage
          AND decision_type = 'product_review'
          AND status = 'approved'
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'product_review_required',
          'message', 'Stage 24 to 25 transition requires an approved chairman product_review decision',
          'venture_id', p_venture_id,
          'stage', p_from_stage,
          'to_stage', p_to_stage
        );
      END IF;
    END IF;
  END IF;

  IF v_is_high_consequence THEN
    SELECT is_enabled INTO v_cutover_flag_enabled
    FROM leo_feature_flags WHERE flag_key = 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED';
    v_cutover_flag_enabled := COALESCE(v_cutover_flag_enabled, false);

    IF v_cutover_flag_enabled THEN
      SELECT is_enabled INTO v_hc_flag_enabled
      FROM leo_feature_flags WHERE flag_key = 'LEO_HIGH_CONSEQUENCE_GATES_ENABLED';
      v_hc_flag_enabled := COALESCE(v_hc_flag_enabled, true);

      IF v_hc_flag_enabled THEN
        IF EXISTS (
          SELECT 1 FROM chairman_decisions
          WHERE venture_id = p_venture_id
            AND lifecycle_stage = p_from_stage
            AND status = 'pending'
            AND blocking = true
        ) THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'high_consequence_gate_blocked',
            'message', format('Stage %s has a pending high-consequence chairman decision', p_from_stage),
            'venture_id', p_venture_id,
            'stage', p_from_stage
          );
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT is_enabled INTO v_s22_flag_enabled
  FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED';
  v_s22_flag_enabled := COALESCE(v_s22_flag_enabled, false);

  SELECT COALESCE((metadata->>'s22_legacy_skipped')::boolean, false)
  INTO v_legacy_skipped
  FROM ventures WHERE id = p_venture_id;

  SELECT required_artifacts INTO v_canonical_array
  FROM venture_stages
  WHERE stage_number = p_from_stage;
  v_canonical_array := COALESCE(v_canonical_array, ARRAY[]::text[]);

  IF v_legacy_skipped AND p_from_stage = 22 THEN
    v_required_artifacts := ARRAY[]::text[];
    v_artifact_source := 'bypass_s22_legacy_skipped';
  ELSE
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical';
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

  DELETE FROM venture_stage_cutover_grandfather
  WHERE venture_id = p_venture_id AND stage_number = p_from_stage;

  -- FR-1/FR-2 self-stamp: stage_write_token identifies this RPC as the writer.
  UPDATE ventures SET current_lifecycle_stage = p_to_stage, stage_write_token = 'fn_advance_venture_stage', updated_at = NOW() WHERE id = p_venture_id;

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
$function$
