-- =============================================================================
-- Migration: fn_advance_venture_stage -- retire the legacy
--            stage_artifact_requirements read path (stage-advancement census #1)
-- SD: SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-4)
-- Date: 2026-07-04
--
-- requires-chairman-apply: this migration is STAGED, not applied. Per the
-- chairman-gated migration convention (SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-
-- GATED-EXEMPT-001), applying it is a separate, explicit chairman GO decision.
--
-- PRECONDITION for chairman apply (do not apply until BOTH are true):
--   1. LEO_S22_GATES_ENABLED (leo_feature_flags) has been ON for a full
--      rollout window with zero regressions -- this migration removes the
--      'legacy_fallback' / 'canonical_with_fallback_available' branches
--      entirely, so any stage still relying on a non-empty
--      stage_artifact_requirements row with an EMPTY venture_stages
--      .required_artifacts would silently lose its artifact requirement.
--   2. Every stage_number with a stage_artifact_requirements(is_blocking=true)
--      row has an equivalent non-empty venture_stages.required_artifacts
--      array (data-migrate any gap into venture_stages BEFORE applying this).
--
-- Gap being closed:
--   fn_advance_venture_stage (the chokepoint, census #1) still reads the
--   legacy stage_artifact_requirements table as a fallback when canonical
--   venture_stages.required_artifacts is empty. This is dead weight once the
--   canonical source is the sole source of truth fleet-wide -- this migration
--   removes the legacy branch so the function ALWAYS uses canonical,
--   regardless of the LEO_S22_GATES_ENABLED flag's value (the flag itself
--   becomes a no-op for this function after this ships; it is not dropped
--   here since other call sites may still read it -- a separate flag-cleanup
--   SD/QF should audit and remove it once every consumer is confirmed migrated).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_advance_venture_stage(
  p_venture_id UUID,
  p_from_stage INTEGER,
  p_to_stage INTEGER,
  p_handoff_data JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key UUID DEFAULT NULL
)
 RETURNS JSONB
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $fn$
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

  IF p_from_stage = 23 AND p_to_stage = 24 THEN
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
          'message', 'Stage 23 to 24 transition requires an approved chairman product_review decision',
          'venture_id', p_venture_id,
          'stage', p_from_stage,
          'to_stage', p_to_stage
        );
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

  -- === BEGIN CHANGE (SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-4) ======
  -- Legacy stage_artifact_requirements fallback RETIRED: canonical is now the
  -- sole source of truth, regardless of LEO_S22_GATES_ENABLED. The flag is
  -- still read above (harmless, and other call sites may still consult it)
  -- but no longer changes THIS function's required-artifacts source.
  IF v_legacy_skipped AND p_from_stage = 22 THEN
    v_required_artifacts := ARRAY[]::text[];
    v_artifact_source := 'bypass_s22_legacy_skipped';
  ELSE
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical';
  END IF;
  -- === END CHANGE =============================================================

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
$fn$;

COMMENT ON FUNCTION public.fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB, UUID) IS
'Advances a venture from one stage to the next with unified gate enforcement.
Reads gate_type/review_mode and canonical required_artifacts from the unified
venture_stages table (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C).
Legacy stage_artifact_requirements fallback RETIRED
(SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-4) -- canonical is now the
sole source of truth for this function regardless of LEO_S22_GATES_ENABLED.
Per-venture bypass via ventures.metadata.s22_legacy_skipped (S22 only).
Stage 23->24 additionally requires an approved chairman_decisions row with
decision_type=''product_review'' at lifecycle_stage=23, on top of the existing
decision-type-agnostic kill-gate check (SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001).
Fixture/demo ventures (is_demo=true OR name ~* ''^(parity-test-|test-stub)'')
bypass ONLY that product_review precondition (QF-20260703-236).
SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (FR-2); read-source repoint by
SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C; product-review gate + fixture bypass by
SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001; legacy-table retirement by
SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-4).';

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the legacy branch was NOT removed, or
-- if the product-review/kill-gate logic was accidentally dropped.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.fn_advance_venture_stage(uuid,integer,integer,jsonb,uuid)'::regprocedure);
  ASSERT v_def NOT LIKE '%legacy_fallback%', 'fn_advance_venture_stage: legacy_fallback branch was not removed';
  ASSERT v_def NOT LIKE '%stage_artifact_requirements%', 'fn_advance_venture_stage: legacy table read was not removed';
  ASSERT v_def LIKE '%product_review_required%', 'fn_advance_venture_stage: product-review gate regressed';
  ASSERT v_def LIKE '%gate_blocked%', 'fn_advance_venture_stage: kill/promotion gate regressed';
  ASSERT v_def LIKE '%artifact_precondition_unmet%', 'fn_advance_venture_stage: artifact precondition regressed';
END
$verify$;
