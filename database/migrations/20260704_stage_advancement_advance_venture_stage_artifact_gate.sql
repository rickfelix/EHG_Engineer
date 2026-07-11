-- =============================================================================
-- Migration: advance_venture_stage(uuid,int,int,text) -- add artifact-precondition
--            gate (stage-advancement path census #3)
-- SD: SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-3)
-- Date: 2026-07-04
--
-- STATUS: LIVE — applied to the production DB (verified in pg_proc/pg_trigger
-- 2026-07-11, SD-LEO-INFRA-HARNESS-FIXTURE-ARTIFACT-001 doc-drift correction;
-- the chairman GO decision has been exercised). Historical staging note: per the
-- chairman-gated migration convention (SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-
-- GATED-EXEMPT-001), applying it is a separate, explicit chairman GO decision --
-- NEVER self-applied via apply-migration.js --prod-deploy. See
-- docs/architecture/stage-advancement-sibling-app-regression-checklist.md and
-- verify Finding #1 there is resolved BEFORE this is applied.
--
-- Gap being closed (docs/architecture/stage-advancement-path-census.md, #3):
--   advance_venture_stage enforces the existing kill/promotion chairman-gate
--   arrays but performs ZERO artifact-completeness check before writing
--   ventures.current_lifecycle_stage. This adds the same artifact-precondition
--   check already shipped (this SD, FR-2) for the JS daemon-walk path
--   (lib/eva/stage-artifact-precondition.js::checkStageArtifactPrecondition),
--   ported to SQL so this RPC enforces it independently -- defense-in-depth
--   across independent choke points, matching the documented rationale in
--   database/migrations/20260704_chairman_product_review_gate_scoped_precondition_fixture_bypass.sql.
--
-- Precedence + deviation-valve semantics mirror
-- lib/eva/stage-artifact-precondition.js byte-for-byte:
--   1. bypass_s22_legacy_skipped: p_stage=22 AND ventures.metadata.s22_legacy_skipped=true
--      -> no requirement.
--   2. canonical: LEO_S22_GATES_ENABLED flag ON -> venture_stages.required_artifacts only.
--   3. canonical_with_fallback_available: flag OFF but canonical non-empty -> canonical.
--   4. legacy_fallback: canonical empty -> stage_artifact_requirements(is_blocking=true).
--   A missing artifact with a documented lib/eva/deviation-ledger.js record
--   (venture_artifacts.artifact_type='BUILD_DEVIATION_RECORD', artifact_data->>
--   'artifact_ref' = <missing type>) is NOT blocking (FR-6 deviation valve).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared helper (self-contained per staged-migration-file; CREATE OR REPLACE
-- is idempotent regardless of which of this SD's 4 artifact-gate migrations
-- the chairman applies first -- same pattern already live for rescan_stage_20
-- across two prior migration files, census #11/#12).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_stage_artifact_precondition(p_venture_id uuid, p_stage integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $helper$
DECLARE
  v_s22_legacy_skipped boolean;
  v_s22_flag_enabled boolean;
  v_canonical text[];
  v_legacy text[];
  v_required text[];
  v_source text;
  v_missing text[] := ARRAY[]::text[];
  v_deviated text[] := ARRAY[]::text[];
  v_artifact text;
  v_has_deviation boolean;
BEGIN
  SELECT COALESCE((metadata->>'s22_legacy_skipped')::boolean, false) INTO v_s22_legacy_skipped
  FROM ventures WHERE id = p_venture_id;

  SELECT COALESCE(is_enabled, false) INTO v_s22_flag_enabled
  FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED';
  v_s22_flag_enabled := COALESCE(v_s22_flag_enabled, false);

  SELECT required_artifacts INTO v_canonical
  FROM venture_stages WHERE stage_number = p_stage;
  v_canonical := COALESCE(v_canonical, ARRAY[]::text[]);

  SELECT array_agg(artifact_type) INTO v_legacy
  FROM stage_artifact_requirements
  WHERE stage_number = p_stage AND is_blocking = true;
  v_legacy := COALESCE(v_legacy, ARRAY[]::text[]);

  IF v_s22_legacy_skipped AND p_stage = 22 THEN
    v_required := ARRAY[]::text[];
    v_source := 'bypass_s22_legacy_skipped';
  ELSIF v_s22_flag_enabled THEN
    v_required := v_canonical;
    v_source := 'canonical';
  ELSIF array_length(v_canonical, 1) IS NOT NULL THEN
    v_required := v_canonical;
    v_source := 'canonical_with_fallback_available';
  ELSE
    v_required := v_legacy;
    v_source := 'legacy_fallback';
  END IF;

  IF array_length(v_required, 1) IS NULL THEN
    RETURN jsonb_build_object('blocked', false, 'missing_artifacts', '[]'::jsonb, 'deviated_artifacts', '[]'::jsonb, 'source', v_source);
  END IF;

  FOREACH v_artifact IN ARRAY v_required LOOP
    IF NOT EXISTS (
      SELECT 1 FROM venture_artifacts
      WHERE venture_id = p_venture_id AND is_current = true AND artifact_type = v_artifact
    ) THEN
      SELECT EXISTS (
        SELECT 1 FROM venture_artifacts
        WHERE venture_id = p_venture_id
          AND artifact_type = 'BUILD_DEVIATION_RECORD'
          AND artifact_data->>'artifact_ref' = v_artifact
      ) INTO v_has_deviation;
      IF v_has_deviation THEN
        v_deviated := array_append(v_deviated, v_artifact);
      ELSE
        v_missing := array_append(v_missing, v_artifact);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'blocked', array_length(v_missing, 1) IS NOT NULL,
    'missing_artifacts', to_jsonb(v_missing),
    'deviated_artifacts', to_jsonb(v_deviated),
    'source', v_source
  );
END;
$helper$;

COMMENT ON FUNCTION public.fn_stage_artifact_precondition(uuid, integer) IS
'Shared artifact-precondition check reused across advance_venture_stage,
advance_venture_to_stage, rescan_stage_20, and the ventures guard trigger
(SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-3/FR-7). Precedence and
deviation-valve semantics are a byte-faithful SQL port of
lib/eva/stage-artifact-precondition.js::checkStageArtifactPrecondition.';

-- ---------------------------------------------------------------------------
-- Amend advance_venture_stage: insert the artifact-precondition check after
-- the existing gate_not_approved check, before any write.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_kill_gates INTEGER[] := ARRAY[3, 5, 13, 24];
  v_promotion_gates INTEGER[] := ARRAY[17, 18, 23];
  v_all_gates INTEGER[] := ARRAY[3, 5, 13, 17, 18, 23, 24];
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

  IF p_to_stage < 1 OR p_to_stage > 26 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_to_stage',
      'to_stage', p_to_stage
    );
  END IF;

  IF p_from_stage = ANY(v_all_gates) THEN
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
        'gate_type', CASE
          WHEN p_from_stage = ANY(v_kill_gates) THEN 'kill'
          WHEN p_from_stage = ANY(v_promotion_gates) THEN 'promotion'
          ELSE 'unknown'
        END,
        'message', format('Chairman approval required at stage %s before advancing', p_from_stage)
      );
    END IF;

    v_gate_decision_id := v_gate_decision.id;
  END IF;

  -- === BEGIN NEW BLOCK (SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-3) ===
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
  -- === END NEW BLOCK ==========================================================

  UPDATE venture_stage_work
    SET stage_status = 'completed',
        completed_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_from_stage;

  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage,
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
$function$;

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the new block did not land, or if the
-- pre-existing gate-enforcement logic was accidentally dropped.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.advance_venture_stage(uuid,integer,integer,text)'::regprocedure);
  ASSERT v_def LIKE '%fn_stage_artifact_precondition%', 'advance_venture_stage: artifact-precondition call missing';
  ASSERT v_def LIKE '%artifact_precondition_unmet%', 'advance_venture_stage: artifact_precondition_unmet error code missing';
  ASSERT v_def LIKE '%gate_not_approved%', 'advance_venture_stage: pre-existing gate check regressed';
END
$verify$;
