-- QF-20260812-376: BUILD_DEVIATION_RECORD deviation escape hatch is unreachable
--
-- fn_stage_artifact_precondition compared artifact_type = 'BUILD_DEVIATION_RECORD'
-- (uppercase literal), but all 35 live venture_artifacts rows of this type are
-- lowercase ('build_deviation_record') -- confirmed directly against the live DB
-- (SELECT artifact_type, count(*) FROM venture_artifacts WHERE artifact_type
-- ILIKE 'build_deviation_record' GROUP BY artifact_type -> 35 rows, all lowercase).
-- The comparison never matched, so the deviation valve -- the ONLY documented way
-- to unblock a stage advance without the real artifact -- was permanently dead
-- code. Found independently by two LEAD-phase sub-agents (VALIDATION + RISK)
-- reviewing SD-LEO-INFRA-RECONCILE-VENTURE-ARTIFACTS-001.
--
-- Fix: compare case-insensitively (UPPER() on both sides) so the function
-- matches the live data convention regardless of future casing drift, rather
-- than retroactively migrating the 35 existing rows to uppercase.
--
-- This function is shared by the ventures stage-advancement trigger
-- (20260704_stage_advancement_ventures_guard_trigger.sql) and the FR-3 RPC
-- amendments (20260704_stage_advancement_advance_venture_*.sql) -- fixing it
-- here closes the gap for every call site at once, with identical semantics.
--
-- Verified against the LIVE deployed definition (pg_get_functiondef), not just
-- the migration file, before authoring this fix -- the live body matched the
-- file exactly, so this CREATE OR REPLACE carries the full current body
-- forward with only the one comparison changed.

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

COMMENT ON FUNCTION public.fn_stage_artifact_precondition(uuid, integer) IS
'Stage-artifact precondition check shared by the ventures stage-advancement
trigger and the FR-3 RPC amendments. The deviation-record lookup is
case-insensitive (QF-20260812-376) -- live venture_artifacts rows use
lowercase artifact_type=''build_deviation_record'', not the uppercase literal
this function originally compared against.';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
DO $verify$
BEGIN
  ASSERT pg_get_functiondef('public.fn_stage_artifact_precondition(uuid,integer)'::regprocedure) ILIKE '%UPPER(artifact_type) = ''BUILD_DEVIATION_RECORD''%',
    'fn_stage_artifact_precondition: case-insensitive deviation-record comparison did not land';
END
$verify$;
