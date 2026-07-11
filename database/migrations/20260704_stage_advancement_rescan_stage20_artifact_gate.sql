-- =============================================================================
-- Migration: rescan_stage_20(uuid) -- add artifact-precondition gate
--            (stage-advancement path census #2)
-- SD: SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-3)
-- Date: 2026-07-04
--
-- STATUS: LIVE — applied to the production DB (verified in pg_proc/pg_trigger
-- 2026-07-11, SD-LEO-INFRA-HARNESS-FIXTURE-ARTIFACT-001 doc-drift correction;
-- the chairman GO decision has been exercised). Historical staging note: per the
-- chairman-gated migration convention (SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-
-- GATED-EXEMPT-001), applying it is a separate, explicit chairman GO decision --
-- NEVER self-applied via apply-migration.js --prod-deploy. Per
-- docs/architecture/stage-advancement-sibling-app-regression-checklist.md item
-- #5, re-grep the sibling EHG app repo for a new rescan_stage_20 frontend call
-- site before applying (none existed at authoring time -- server-side only,
-- lib/eva/stage-execution-worker.js).
--
-- Gap being closed (docs/architecture/stage-advancement-path-census.md, #2):
--   rescan_stage_20 auto-advances Stage 20->21 after checking ONLY (a) all
--   venture SDs are terminal and (b) ventures.deployment_url is registered.
--   It never checks Stage 20's required_artifacts. Adds the same
--   artifact-precondition check as the other FR-3 migrations, reusing the
--   shared helper public.fn_stage_artifact_precondition (CREATE OR REPLACE'd
--   here too so this file is independently appliable regardless of order,
--   same idempotent-across-files pattern already used for rescan_stage_20
--   itself across two prior migrations, census #11/#12).
--
--   This is ADDITIVE to the existing v_artifact_verified (deployment_url)
--   check -- both must pass for the auto-advance to fire. Only the
--   auto-advance-to-21 branch is gated; the advisory/stage-status reporting
--   earlier in the function (build_pending, stakeholder_review, etc.) is
--   completely unaffected, so a blocked venture's Stage 20 dashboard still
--   reports accurately -- it just does not auto-advance past 20.
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
-- Amend rescan_stage_20: AND the existing auto-advance condition with the new
-- artifact-precondition check.
-- ---------------------------------------------------------------------------
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
  v_precondition JSONB;
  v_artifacts_complete BOOLEAN;
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

  -- === BEGIN NEW BLOCK (SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-3) ===
  v_precondition := public.fn_stage_artifact_precondition(p_venture_id, 20);
  v_artifacts_complete := NOT (v_precondition->>'blocked')::boolean;
  -- === END NEW BLOCK ==========================================================

  v_stage_status := CASE
    WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete THEN 'completed'
    WHEN v_all_terminal AND (NOT v_artifact_verified OR NOT v_artifacts_complete) THEN 'artifact_missing'
    ELSE 'in_progress'
  END;
  SELECT jsonb_build_object(
    'total_sds', v_total,
    'terminal_sds', v_terminal,
    'non_terminal_sds', v_pending,
    'build_pending', NOT v_all_terminal,
    'artifact_verified', v_artifact_verified,
    'deployment_url', v_deployment_url,
    'required_artifacts_complete', v_artifacts_complete,
    'missing_artifacts', v_precondition->'missing_artifacts',
    'deviated_artifacts', v_precondition->'deviated_artifacts',
    'artifact_source', v_precondition->>'source',
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
      completed_at = CASE WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete THEN NOW() ELSE completed_at END,
      updated_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = 20;
  IF v_all_terminal AND v_artifact_verified AND v_artifacts_complete THEN
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
    'required_artifacts_complete', v_artifacts_complete,
    'missing_artifacts', v_precondition->'missing_artifacts',
    'advanced_to', CASE WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete AND v_current_stage <= 20 THEN 21 ELSE NULL END,
    'reason', CASE
      WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete AND v_current_stage IS NOT NULL AND v_current_stage <= 20
        THEN 'Stage 20 complete - advanced to stage 21'
      WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete
        THEN 'Stage 20 complete'
      WHEN v_all_terminal AND v_artifact_verified AND NOT v_artifacts_complete
        THEN 'Required Stage 20 artifact(s) missing: ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_precondition->'missing_artifacts')), ', ')
      WHEN v_all_terminal AND NOT v_artifact_verified
        THEN 'Deployment URL not registered - register your live deployment to advance past Stage 20'
      ELSE v_pending::text || ' SD(s) still in progress - complete all venture SDs to advance Stage 20'
    END
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the new block did not land, or if the
-- pre-existing reason branches (SD-LEO-INFRA-STAGE-RESCAN-STAGE-001) regressed.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.rescan_stage_20(uuid)'::regprocedure);
  ASSERT v_def LIKE '%fn_stage_artifact_precondition%', 'rescan_stage_20: artifact-precondition call missing';
  ASSERT v_def LIKE '%v_artifacts_complete%', 'rescan_stage_20: artifacts-complete gate missing';
  ASSERT v_def LIKE '%''reason''%', 'rescan_stage_20: reason key missing';
  ASSERT v_def LIKE '%Deployment URL not registered%', 'rescan_stage_20: artifact_missing reason missing';
  ASSERT v_def LIKE '%still in progress%', 'rescan_stage_20: in_progress reason missing';
  ASSERT v_def LIKE '%advanced to stage 21%', 'rescan_stage_20: advancing reason missing';
END
$verify$;
