-- =============================================================================
-- Migration: advance_venture_to_stage(uuid,int,text,text) -- add
--            artifact-precondition gate (stage-advancement path census #4)
-- SD: SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-3)
-- Date: 2026-07-04
--
-- STATUS: LIVE — applied to the production DB (verified in pg_proc/pg_trigger
-- 2026-07-11, SD-LEO-INFRA-HARNESS-FIXTURE-ARTIFACT-001 doc-drift correction;
-- the chairman GO decision has been exercised). Historical staging note: per the
-- chairman-gated migration convention (SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-
-- GATED-EXEMPT-001), applying it is a separate, explicit chairman GO decision --
-- NEVER self-applied via apply-migration.js --prod-deploy. See
-- docs/architecture/stage-advancement-sibling-app-regression-checklist.md.
-- This RPC's two call sites in the sibling EHG app
-- (BuildMethodSelector.tsx / LeoBridgeBuildPanel.tsx) ALREADY check
-- `data?.success` before treating the advance as successful, so this
-- migration is NOT blocked on that checklist's Finding #1 (which is specific
-- to advance_venture_stage's caller, advanceStage.ts) -- still walk items
-- #2/#3/#5 of the checklist before applying.
--
-- Gap being closed (docs/architecture/stage-advancement-path-census.md, #4):
--   advance_venture_to_stage only validates p_target_stage = current+1 and an
--   access guard -- ZERO gate/artifact check whatsoever. This is the loosest
--   of the four gated RPCs. Adds the same artifact-precondition check as the
--   other FR-3 migrations, reusing the shared helper
--   public.fn_stage_artifact_precondition (defined in
--   20260704_stage_advancement_advance_venture_stage_artifact_gate.sql;
--   CREATE OR REPLACE'd here too so this file is independently appliable
--   regardless of chairman-apply order, same idempotent-across-files pattern
--   already used for rescan_stage_20, census #11/#12).
--
-- Also closes a pre-existing (not new) gap while touching this function:
-- advance_venture_stage takes a row lock (SELECT ... FOR UPDATE) before its
-- precondition check, serializing concurrent calls; advance_venture_to_stage
-- did not. Adding FOR UPDATE here closes that same TOCTOU window between the
-- precondition check and the write for this RPC too (adversarial review
-- finding, EXEC phase).
-- =============================================================================

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

-- ---------------------------------------------------------------------------
-- Amend advance_venture_to_stage: insert the artifact-precondition check
-- after the "advance by 1 stage only" validation, before any write.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_venture_to_stage(p_venture_id uuid, p_target_stage integer, p_build_method text DEFAULT 'claude_code'::text, p_repo_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
    DECLARE
      v_current_stage INTEGER;
      v_result JSONB;
      v_precondition JSONB;
    BEGIN
      IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
              OR public.fn_user_has_venture_access(p_venture_id)) THEN
        RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
      END IF;

      SELECT current_lifecycle_stage INTO v_current_stage
      FROM ventures
      WHERE id = p_venture_id
      FOR UPDATE;

      IF v_current_stage IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Venture not found');
      END IF;

      IF p_target_stage != v_current_stage + 1 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Can only advance by 1 stage. Current: %s, Requested: %s', v_current_stage, p_target_stage)
        );
      END IF;

      -- === BEGIN NEW BLOCK (SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-3) ===
      v_precondition := public.fn_stage_artifact_precondition(p_venture_id, v_current_stage);
      IF (v_precondition->>'blocked')::boolean THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'artifact_precondition_unmet',
          'missing_artifacts', v_precondition->'missing_artifacts',
          'deviated_artifacts', v_precondition->'deviated_artifacts',
          'source', v_precondition->>'source',
          'venture_id', p_venture_id,
          'from_stage', v_current_stage
        );
      END IF;
      -- === END NEW BLOCK ==========================================================

      UPDATE ventures
      SET current_lifecycle_stage = p_target_stage
      WHERE id = p_venture_id;

      IF p_build_method = 'replit_agent' AND p_target_stage = 20 THEN
        INSERT INTO venture_stage_work (venture_id, lifecycle_stage, stage_status, work_type, advisory_data)
        VALUES (
          p_venture_id,
          20,
          'in_progress',
          'sd_required',
          jsonb_build_object(
            'build_method', 'replit_agent',
            'awaiting_replit_sync', true,
            'replit_sync', jsonb_build_object('repo_url', COALESCE(p_repo_url, ''), 'awaiting_sync', true)
          )
        )
        ON CONFLICT (venture_id, lifecycle_stage)
        DO UPDATE SET
          advisory_data = jsonb_build_object(
            'build_method', 'replit_agent',
            'awaiting_replit_sync', true,
            'replit_sync', jsonb_build_object('repo_url', COALESCE(p_repo_url, ''), 'awaiting_sync', true)
          ),
          stage_status = 'in_progress';
      END IF;

      v_result := jsonb_build_object(
        'success', true,
        'previous_stage', v_current_stage,
        'current_stage', p_target_stage,
        'build_method', p_build_method
      );

      RETURN v_result;
    END;
    $function$;

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the new block did not land, or if the
-- pre-existing "advance by 1 stage only" guard was accidentally dropped.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.advance_venture_to_stage(uuid,integer,text,text)'::regprocedure);
  ASSERT v_def LIKE '%fn_stage_artifact_precondition%', 'advance_venture_to_stage: artifact-precondition call missing';
  ASSERT v_def LIKE '%artifact_precondition_unmet%', 'advance_venture_to_stage: artifact_precondition_unmet error code missing';
  ASSERT v_def LIKE '%Can only advance by 1 stage%', 'advance_venture_to_stage: pre-existing single-step guard regressed';
  ASSERT v_def LIKE '%FOR UPDATE%', 'advance_venture_to_stage: row lock (FOR UPDATE) missing';
END
$verify$;
