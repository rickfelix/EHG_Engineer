-- =============================================================================
-- ROLLBACK: Repoint DB readers back to the legacy tables (Child F, part 1/2)
-- SD: SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-F
-- @approved-by: rickfelix@example.com
-- Date: 2026-05-30
--
-- Reverses 20260530_childF_repoint_readers_to_venture_stages.sql by restoring the
-- pre-migration function/view bodies (reading stage_config / lifecycle_stage_config).
-- ONLY valid while the legacy tables still exist (i.e. before part 2/2's DROP).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_auto_advance(p_stage_number integer)
 RETURNS TABLE(can boolean, reason text, layer integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cdc RECORD;
  v_stage RECORD;
  v_override JSONB;
  v_override_auto_proceed BOOLEAN;
BEGIN
  SELECT global_auto_proceed, stage_overrides, hard_gate_stages
    INTO v_cdc
    FROM chairman_dashboard_config
   WHERE config_key = 'default'
   LIMIT 1;

  IF v_cdc IS NULL THEN
    RETURN QUERY SELECT FALSE, 'config_missing'::TEXT, 0;
    RETURN;
  END IF;

  SELECT stage_number, gate_type, review_mode
    INTO v_stage
    FROM stage_config
   WHERE stage_number = p_stage_number
   LIMIT 1;

  IF v_stage IS NULL THEN
    RETURN QUERY SELECT FALSE, 'stage_not_found'::TEXT, 0;
    RETURN;
  END IF;

  IF v_cdc.global_auto_proceed IS NOT TRUE THEN
    RETURN QUERY SELECT FALSE, 'global_off'::TEXT, 1;
    RETURN;
  END IF;

  IF v_stage.gate_type IN ('kill', 'promotion') THEN
    RETURN QUERY SELECT FALSE, 'kill_promotion_gate'::TEXT, 2;
    RETURN;
  END IF;

  v_override := v_cdc.stage_overrides -> ('stage_' || p_stage_number);
  v_override_auto_proceed := (v_override ->> 'auto_proceed')::BOOLEAN;

  IF v_override_auto_proceed IS FALSE THEN
    RETURN QUERY SELECT FALSE, 'explicit_pause'::TEXT, 3;
    RETURN;
  END IF;

  IF v_stage.review_mode = 'review' AND (v_override_auto_proceed IS NULL OR v_override_auto_proceed IS NOT TRUE) THEN
    RETURN QUERY SELECT FALSE, 'review_default_pause'::TEXT, 4;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'approved'::TEXT, NULL::INT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_creates_decision(p_stage_number integer)
 RETURNS TABLE(creates_decision boolean, gate_type text, review_mode text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gate_type TEXT;
  v_review_mode TEXT;
BEGIN
  SELECT sc.gate_type, sc.review_mode
    INTO v_gate_type, v_review_mode
    FROM public.stage_config sc
   WHERE sc.stage_number = p_stage_number
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    (v_gate_type IN ('kill','promotion') OR v_review_mode = 'review'),
    v_gate_type,
    v_review_mode;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_stage_override(p_stage_number integer, p_auto_proceed boolean, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gate_type text;
  v_user_id uuid := auth.uid();
  v_current jsonb;
  v_updated jsonb;
  v_key text;
  v_entry jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'
      USING HINT = 'Caller must be an authenticated user.';
  END IF;

  SELECT gate_type INTO v_gate_type
  FROM public.stage_config
  WHERE stage_number = p_stage_number;

  IF v_gate_type IS NULL THEN
    RAISE EXCEPTION 'INVALID_STAGE_NUMBER: %', p_stage_number
      USING HINT = 'No row in stage_config for the given stage_number.';
  END IF;

  IF p_auto_proceed = true AND v_gate_type IN ('kill', 'promotion') THEN
    RAISE EXCEPTION 'KILL_PROMOTION_NOT_OVERRIDABLE: stage % has gate_type %', p_stage_number, v_gate_type
      USING HINT = 'Kill and promotion gates require manual chairman approval and cannot be auto-advanced.';
  END IF;

  v_key := 'stage_' || p_stage_number;

  SELECT stage_overrides INTO v_current
  FROM public.chairman_dashboard_config
  WHERE config_key = 'default';

  IF v_current IS NULL THEN
    v_current := '{}'::jsonb;
  END IF;

  IF p_auto_proceed IS NULL THEN
    v_updated := v_current - v_key;
  ELSE
    v_entry := jsonb_build_object(
      'auto_proceed', p_auto_proceed,
      'reason', COALESCE(p_reason, CASE
        WHEN p_auto_proceed = true THEN 'Opted in to auto-advance by Chairman'
        ELSE 'Paused by Chairman'
      END),
      'set_by', v_user_id::text,
      'set_at', NOW()::text
    );
    v_updated := v_current || jsonb_build_object(v_key, v_entry);
  END IF;

  UPDATE public.chairman_dashboard_config
  SET stage_overrides = v_updated,
      updated_at = NOW()
  WHERE config_key = 'default';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIG_ROW_MISSING: chairman_dashboard_config row with config_key=default not found'
      USING HINT = 'Seed the default row before calling this function.';
  END IF;

  RETURN jsonb_build_object(
    'stage_number', p_stage_number,
    'auto_proceed', p_auto_proceed,
    'gate_type', v_gate_type,
    'set_by', v_user_id::text,
    'cleared', p_auto_proceed IS NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_venture_stage_summary(p_venture_id uuid)
 RETURNS TABLE(venture_name text, venture_code character varying, current_stage integer, current_stage_name character varying, current_phase character varying, stage_status character varying, health_score character varying, active_sd character varying, completed_stages integer, total_stages integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    v.name::TEXT,
    v.venture_code,
    v.current_lifecycle_stage,
    lsc.stage_name,
    lsc.phase_name,
    vsw.stage_status,
    vsw.health_score,
    vsw.sd_id,
    (SELECT COUNT(*)::INT FROM venture_stage_work WHERE venture_id = v.id AND stage_status = 'completed'),
    25
  FROM ventures v
  LEFT JOIN lifecycle_stage_config lsc ON v.current_lifecycle_stage = lsc.stage_number
  LEFT JOIN venture_stage_work vsw ON v.id = vsw.venture_id AND v.current_lifecycle_stage = vsw.lifecycle_stage
  WHERE v.id = p_venture_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.initialize_venture_stages(p_venture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_config RECORD;
BEGIN
  SELECT * INTO v_config FROM lifecycle_stage_config WHERE stage_number = 1;

  INSERT INTO venture_stage_work (venture_id, lifecycle_stage, work_type, stage_status, started_at)
  VALUES (p_venture_id, 1, v_config.work_type, 'in_progress', NOW())
  ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

  UPDATE ventures SET current_lifecycle_stage = 1 WHERE id = p_venture_id;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'initial_stage', 1,
    'stage_name', v_config.stage_name
  );
END;
$function$;

CREATE OR REPLACE VIEW public.v_chairman_pending_decisions AS
 SELECT cd.id,
    cd.venture_id,
    v.name AS venture_name,
    cd.lifecycle_stage,
    lsc.stage_name,
    cd.health_score,
    cd.recommendation,
    cd.decision,
    cd.status,
    cd.summary,
    cd.brief_data,
    cd.override_reason,
    cd.risks_acknowledged,
    cd.quick_fixes_applied,
    cd.created_at,
    cd.updated_at,
    cd.decided_by,
    cd.rationale,
        CASE
            WHEN v.updated_at > cd.created_at THEN true
            ELSE false
        END AS is_stale_context,
    v.updated_at AS venture_updated_at
   FROM chairman_decisions cd
     JOIN ventures v ON v.id = cd.venture_id
     LEFT JOIN lifecycle_stage_config lsc ON lsc.stage_number = cd.lifecycle_stage
  WHERE cd.deleted_at IS NULL
  ORDER BY cd.created_at DESC;

DO $notice$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.fn_chairman_dashboard_config_governance_audit()'::regprocedure) INTO v_def;
  IF v_def IS NOT NULL AND position('Use venture_stages.gate_type as the source of truth' IN v_def) > 0 THEN
    v_def := replace(v_def, 'Use venture_stages.gate_type as the source of truth', 'Use stage_config.gate_type as the source of truth');
    EXECUTE v_def;
  END IF;
END
$notice$;

COMMIT;
