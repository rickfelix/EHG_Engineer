-- =============================================================================
-- Migration: Repoint write-path objects to venture_stages (Child C)
-- SD: SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C
-- @approved-by: rickfelix@example.com
-- Date: 2026-05-29
--
-- Purpose:
--   Complete the venture_stages unification on the WRITE path. Children A
--   (created the unified venture_stages superset table + dual-write sync
--   triggers) and B (repointed JS readers) already shipped. Child C repoints
--   the two remaining write-path database objects to venture_stages:
--
--     1. fn_advance_venture_stage RPC — read gate_type/review_mode (FOR SHARE)
--        and required_artifacts from venture_stages instead of stage_config /
--        lifecycle_stage_config. ONLY the two FROM clauses change; signature,
--        logic, return shape, error handling, GRANTs, and COMMENT are preserved
--        verbatim from 20260504_fn_advance_venture_stage_canonical_artifact_source.sql.
--        The FOR SHARE lock is retained (venture_stages is a base table with a
--        PRIMARY KEY on stage_number — row-share locking fully supported).
--
--     2. advisory_checkpoints_stage_number_fkey — drop (was REFERENCES
--        lifecycle_stage_config(stage_number)) and re-add REFERENCES
--        venture_stages(stage_number). venture_stages_pkey(stage_number) is the
--        FK target. Verified: 26-row identical stage_number set, 0 orphan
--        advisory_checkpoints rows.
--
-- Behavior-preserving: venture_stages holds values identical to the legacy join
--   (verified 0 mismatches for gate_type, review_mode, required_artifacts across
--   all 26 stages). required_artifacts is _text (text[]) in BOTH source tables —
--   identical type — so the text[]->jsonb plpgsql assignment + conversion logic
--   is unchanged.
--
-- Reversible: see companion
--   20260529_childC_repoint_advance_fn_and_advisory_fk_to_venture_stages_rollback.sql
--
-- Scope guard: sync triggers and legacy table structure are LEFT IN PLACE
--   (Child F retires them later). JS readers untouched (Child B done).
--
-- Idempotent: CREATE OR REPLACE + guarded DO-blocks + terminal verification.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_advance_venture_stage(
  p_venture_id UUID,
  p_from_stage INTEGER,
  p_to_stage INTEGER,
  p_handoff_data JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 additions:
  v_canonical_required jsonb;
  v_canonical_array text[];
  v_legacy_array text[];
  v_required_artifacts text[];
  v_s22_flag_enabled boolean;
  v_legacy_skipped boolean;
  v_artifact_source text;
BEGIN
  -- Lock the venture row to prevent concurrent advances.
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

  -- Idempotency check.
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM venture_stage_transitions WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'was_duplicate', true, 'venture_id', p_venture_id);
    END IF;
  END IF;

  -- ======================================================================
  -- UNIFIED GATE ENFORCEMENT (SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001)
  -- SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C: read gate_type/review_mode from
  -- the unified venture_stages table (was stage_config). FOR SHARE retained.
  -- ======================================================================
  SELECT COALESCE(sc.gate_type, 'none'), COALESCE(sc.review_mode, 'review')
  INTO v_gate_type, v_review_mode
  FROM venture_stages sc
  WHERE sc.stage_number = p_from_stage
  FOR SHARE;

  IF NOT FOUND THEN
    v_gate_type := 'none';
    v_review_mode := 'review';
  END IF;

  -- Block review-mode stages without chairman approval.
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

  -- Block kill/promotion gates without chairman approval.
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

  -- ======================================================================
  -- ARTIFACT PRECONDITION GATE — CANONICAL READ
  -- (SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 FR-2)
  --
  -- Source-of-truth: venture_stages.required_artifacts JSONB/text[] array
  --   (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C: was lifecycle_stage_config;
  --    venture_stages.required_artifacts is the IDENTICAL _text type, so the
  --    text[]->jsonb assignment + conversion below are unchanged).
  -- Fallback:        stage_artifact_requirements (legacy table)
  -- Gate flag:       LEO_S22_GATES_ENABLED in leo_feature_flags
  -- Per-venture bypass: ventures.metadata.s22_legacy_skipped = true (s22 only)
  -- ======================================================================

  -- Read feature flag (default OFF if missing).
  SELECT is_enabled INTO v_s22_flag_enabled
  FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED';
  v_s22_flag_enabled := COALESCE(v_s22_flag_enabled, false);

  -- Read per-venture legacy bypass.
  SELECT COALESCE((metadata->>'s22_legacy_skipped')::boolean, false)
  INTO v_legacy_skipped
  FROM ventures WHERE id = p_venture_id;

  -- Read canonical required_artifacts (venture_stages — unified source).
  SELECT required_artifacts INTO v_canonical_required
  FROM venture_stages
  WHERE stage_number = p_from_stage;

  -- Convert canonical jsonb array to text[].
  IF v_canonical_required IS NOT NULL AND jsonb_typeof(v_canonical_required) = 'array' THEN
    SELECT array_agg(value::text) INTO v_canonical_array
    FROM jsonb_array_elements_text(v_canonical_required) value;
  END IF;
  v_canonical_array := COALESCE(v_canonical_array, ARRAY[]::text[]);

  -- Read legacy required artifacts (stage_artifact_requirements).
  SELECT array_agg(artifact_type) INTO v_legacy_array
  FROM stage_artifact_requirements
  WHERE stage_number = p_from_stage AND is_blocking = true;
  v_legacy_array := COALESCE(v_legacy_array, ARRAY[]::text[]);

  -- Resolve which list to enforce.
  IF v_legacy_skipped AND p_from_stage = 22 THEN
    -- Per-venture S22 bypass: legacy ventures past S22 are exempt.
    v_required_artifacts := ARRAY[]::text[];
    v_artifact_source := 'bypass_s22_legacy_skipped';
  ELSIF v_s22_flag_enabled THEN
    -- Flag ON: canonical exclusively (drift fully resolved).
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical';
  ELSIF array_length(v_canonical_array, 1) IS NOT NULL THEN
    -- Flag OFF: prefer canonical when populated.
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical_with_fallback_available';
  ELSE
    -- Flag OFF and canonical empty: fall back to legacy.
    v_required_artifacts := v_legacy_array;
    v_artifact_source := 'legacy_fallback';
  END IF;

  -- Check missing.
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
  -- ======================================================================

  -- Compliance gate at Stage 21 (preserved from prior version).
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

  -- Advance current_lifecycle_stage.
  UPDATE ventures SET current_lifecycle_stage = p_to_stage, updated_at = NOW() WHERE id = p_venture_id;

  -- Mark current stage work as completed.
  UPDATE venture_stage_work SET stage_status = 'completed', completed_at = NOW()
  WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage;

  v_idem_key := COALESCE(p_idempotency_key, gen_random_uuid());

  -- Record transition.
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
  -- Preserved from prior version. Function never crashes mid-transition.
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'venture_id', p_venture_id);
END;
$fn$;

COMMENT ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB, UUID) IS
'Advances a venture from one stage to the next with unified gate enforcement.
Reads gate_type/review_mode and canonical required_artifacts from the unified
venture_stages table (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C — was stage_config /
lifecycle_stage_config; behavior-preserving, values identical).
Falls back to legacy stage_artifact_requirements when canonical empty AND
LEO_S22_GATES_ENABLED feature flag is OFF (during rollout).
Per-venture bypass via ventures.metadata.s22_legacy_skipped (S22 only).
SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (FR-2); read-source repoint by
SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C.';

GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- advisory_checkpoints FK: lifecycle_stage_config -> venture_stages
-- ---------------------------------------------------------------------------
DO $fk$
BEGIN
  -- Drop the existing FK (whatever it currently references).
  IF EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'advisory_checkpoints'
      AND con.conname = 'advisory_checkpoints_stage_number_fkey'
  ) THEN
    ALTER TABLE advisory_checkpoints DROP CONSTRAINT advisory_checkpoints_stage_number_fkey;
  END IF;

  -- Re-add referencing the unified venture_stages table (idempotent: only if absent).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'advisory_checkpoints'
      AND con.conname = 'advisory_checkpoints_stage_number_fkey'
  ) THEN
    ALTER TABLE advisory_checkpoints
      ADD CONSTRAINT advisory_checkpoints_stage_number_fkey
      FOREIGN KEY (stage_number) REFERENCES venture_stages(stage_number);
  END IF;
END
$fk$;

-- ---------------------------------------------------------------------------
-- Terminal verification: abort COMMIT unless both objects ended up correct.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_fk_def  text;
  v_fn_args text;
BEGIN
  -- (1) advisory_checkpoints FK must now reference venture_stages.
  SELECT pg_get_constraintdef(con.oid) INTO v_fk_def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'advisory_checkpoints'
    AND con.conname = 'advisory_checkpoints_stage_number_fkey';

  IF v_fk_def IS NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: advisory_checkpoints_stage_number_fkey is missing after migration';
  END IF;
  IF v_fk_def NOT ILIKE '%REFERENCES venture_stages(stage_number)%' THEN
    RAISE EXCEPTION 'VERIFY FAILED: advisory_checkpoints FK does not reference venture_stages: %', v_fk_def;
  END IF;

  -- (2) fn_advance_venture_stage must exist with the unchanged 5-param signature.
  SELECT pg_get_function_identity_arguments(p.oid) INTO v_fn_args
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_advance_venture_stage' AND n.nspname = 'public';

  IF v_fn_args IS NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_advance_venture_stage does not exist after migration';
  END IF;
  IF v_fn_args <> 'p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_handoff_data jsonb, p_idempotency_key uuid' THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_advance_venture_stage signature changed: %', v_fn_args;
  END IF;

  RAISE NOTICE 'VERIFY OK: FK -> venture_stages; fn_advance_venture_stage(5-param) present.';
END
$verify$;

COMMIT;
