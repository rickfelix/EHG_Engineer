-- =============================================================================
-- Migration: fix fn_stage_artifact_precondition BUILD_DEVIATION_RECORD case
--            mismatch -- the deviation escape hatch has been unreachable
-- QF: QF-20260812-376
-- Date: 2026-08-12
--
-- @chairman-gated: staged, not yet applied. Amends fn_stage_artifact_precondition,
-- part of the SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 trigger apparatus
-- (database/migrations/20260704_stage_advancement_ventures_guard_trigger.sql),
-- whose own header requires a separate, explicit chairman GO decision before
-- any change to this SECURITY DEFINER function touches the live production
-- gate. Same convention applied here.
--
-- Bug (found independently by two LEAD-phase sub-agents reviewing
-- SD-LEO-INFRA-RECONCILE-VENTURE-ARTIFACTS-001): the function compares
-- artifact_type = 'BUILD_DEVIATION_RECORD' (uppercase) to decide whether a
-- missing stage artifact has a recorded, chairman-accepted deviation that
-- should unblock stage advancement. All 35 live venture_artifacts rows of
-- this type are lowercase ('build_deviation_record'). The comparison has
-- never matched -- the ONLY documented way to unblock a stage advance
-- without the real artifact has been dead code since this trigger went live
-- (2026-07-11).
--
-- Fix: case-insensitive comparison (UPPER() both sides), matching the live
-- data convention rather than retroactively migrating 35 rows. Everything
-- else in the function is unchanged -- verified against the live
-- pg_get_functiondef() output captured 2026-08-12.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_stage_artifact_precondition(p_venture_id uuid, p_stage integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          AND UPPER(artifact_type) = 'BUILD_DEVIATION_RECORD'
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
$function$;
