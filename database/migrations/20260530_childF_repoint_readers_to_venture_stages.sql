-- =============================================================================
-- Migration: Repoint remaining DB readers to venture_stages (Child F, part 1/2)
-- SD: SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-F
-- @approved-by: rickfelix@example.com
-- Date: 2026-05-30
--
-- Purpose:
--   Final repoint of the last live DATABASE readers of the legacy stage-definition
--   tables (stage_config, lifecycle_stage_config) to the unified venture_stages
--   SSOT, so the legacy tables can be dropped in part 2/2. Children A/B/C/D/E
--   already shipped; fn_advance_venture_stage was repointed by Child C.
--
--   This migration repoints (CREATE OR REPLACE, signatures/logic preserved, only
--   FROM/JOIN clauses + inline comments/hints changed; casts added where noted):
--     1. can_auto_advance(integer)        — FROM stage_config -> venture_stages
--     2. stage_creates_decision(integer)  — FROM public.stage_config sc -> venture_stages sc
--     3. set_stage_override(int,bool,text)— FROM public.stage_config -> venture_stages
--     4. get_venture_stage_summary(uuid)  — LEFT JOIN lifecycle_stage_config -> venture_stages
--                                            (+ ::varchar casts: venture_stages.stage_name/
--                                            phase_name are text; OUT params are varchar)
--     5. initialize_venture_stages(uuid)  — FROM lifecycle_stage_config -> venture_stages
--     6. VIEW v_chairman_pending_decisions— LEFT JOIN lifecycle_stage_config -> venture_stages
--                                            (lsc.stage_name::varchar to preserve view col type)
--     7. fn_chairman_dashboard_config_governance_audit() — fix a stale RAISE NOTICE
--        string referencing stage_config.gate_type (surgical replace; no logic change).
--
-- Behavior-preserving: data parity verified IDENTICAL across all 26 stages for
--   gate_type, review_mode (stage_config==venture_stages) and work_type,
--   required_artifacts, metadata incl. metadata.gates (lifecycle==venture_stages).
--   The only behavioral change is get_venture_stage_summary + v_chairman_pending_decisions
--   now returning the canonical (DEFINITION-001) stage names instead of stale legacy
--   names — a fix. CREATE OR REPLACE preserves existing ownership + grants.
--
-- Reversible: see companion
--   20260530_childF_repoint_readers_to_venture_stages_rollback.sql
--
-- Scope guard: legacy tables + their sync/audit triggers are LEFT IN PLACE here;
--   part 2/2 (20260530_childF_drop_legacy_stage_tables.sql) drops them after smoke
--   + the cross-repo EHG-app hook repoint + a committed backup artifact.
--
-- Idempotent: CREATE OR REPLACE + surgical DO-block + terminal verification.
-- =============================================================================

BEGIN;

-- 1. can_auto_advance ---------------------------------------------------------
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
  -- Resolve config (single tenant row by config_key='default' — matches worker).
  SELECT global_auto_proceed, stage_overrides, hard_gate_stages
    INTO v_cdc
    FROM chairman_dashboard_config
   WHERE config_key = 'default'
   LIMIT 1;

  IF v_cdc IS NULL THEN
    RETURN QUERY SELECT FALSE, 'config_missing'::TEXT, 0;
    RETURN;
  END IF;

  -- Resolve stage metadata (gate_type, review_mode) from venture_stages (SSOT).
  SELECT stage_number, gate_type, review_mode
    INTO v_stage
    FROM venture_stages
   WHERE stage_number = p_stage_number
   LIMIT 1;

  IF v_stage IS NULL THEN
    RETURN QUERY SELECT FALSE, 'stage_not_found'::TEXT, 0;
    RETURN;
  END IF;

  -- L1: global master toggle
  IF v_cdc.global_auto_proceed IS NOT TRUE THEN
    RETURN QUERY SELECT FALSE, 'global_off'::TEXT, 1;
    RETURN;
  END IF;

  -- L2: kill/promotion gates never auto-advance (source: venture_stages.gate_type)
  IF v_stage.gate_type IN ('kill', 'promotion') THEN
    RETURN QUERY SELECT FALSE, 'kill_promotion_gate'::TEXT, 2;
    RETURN;
  END IF;

  -- Resolve per-stage override
  v_override := v_cdc.stage_overrides -> ('stage_' || p_stage_number);
  v_override_auto_proceed := (v_override ->> 'auto_proceed')::BOOLEAN;

  -- L3: explicit pause
  IF v_override_auto_proceed IS FALSE THEN
    RETURN QUERY SELECT FALSE, 'explicit_pause'::TEXT, 3;
    RETURN;
  END IF;

  -- L4: review-mode default-pause unless explicit opt-in
  IF v_stage.review_mode = 'review' AND (v_override_auto_proceed IS NULL OR v_override_auto_proceed IS NOT TRUE) THEN
    RETURN QUERY SELECT FALSE, 'review_default_pause'::TEXT, 4;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'approved'::TEXT, NULL::INT;
END;
$function$;

-- 2. stage_creates_decision ---------------------------------------------------
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
    FROM public.venture_stages sc
   WHERE sc.stage_number = p_stage_number
   LIMIT 1;

  IF NOT FOUND THEN
    -- Non-existent stage: single row, NULLs, creates_decision=false.
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    (v_gate_type IN ('kill','promotion') OR v_review_mode = 'review'),
    v_gate_type,
    v_review_mode;
END;
$function$;

-- 3. set_stage_override -------------------------------------------------------
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
  FROM public.venture_stages
  WHERE stage_number = p_stage_number;

  IF v_gate_type IS NULL THEN
    RAISE EXCEPTION 'INVALID_STAGE_NUMBER: %', p_stage_number
      USING HINT = 'No row in venture_stages for the given stage_number.';
  END IF;

  -- Defense-in-depth: kill/promotion gates are NEVER overrideable to auto-advance.
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
    -- DELETE the key (clear override; revert to default).
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

-- 4. get_venture_stage_summary ------------------------------------------------
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
    lsc.stage_name::varchar,
    lsc.phase_name::varchar,
    vsw.stage_status,
    vsw.health_score,
    vsw.sd_id,
    (SELECT COUNT(*)::INT FROM venture_stage_work WHERE venture_id = v.id AND stage_status = 'completed'),
    25
  FROM ventures v
  LEFT JOIN venture_stages lsc ON v.current_lifecycle_stage = lsc.stage_number
  LEFT JOIN venture_stage_work vsw ON v.id = vsw.venture_id AND v.current_lifecycle_stage = vsw.lifecycle_stage
  WHERE v.id = p_venture_id;
END;
$function$;

-- 5. initialize_venture_stages ------------------------------------------------
CREATE OR REPLACE FUNCTION public.initialize_venture_stages(p_venture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_config RECORD;
BEGIN
  -- Create initial stage work record for Stage 1
  SELECT * INTO v_config FROM venture_stages WHERE stage_number = 1;

  INSERT INTO venture_stage_work (venture_id, lifecycle_stage, work_type, stage_status, started_at)
  VALUES (p_venture_id, 1, v_config.work_type, 'in_progress', NOW())
  ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

  -- Set venture to Stage 1
  UPDATE ventures SET current_lifecycle_stage = 1 WHERE id = p_venture_id;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'initial_stage', 1,
    'stage_name', v_config.stage_name
  );
END;
$function$;

-- 6. v_chairman_pending_decisions --------------------------------------------
CREATE OR REPLACE VIEW public.v_chairman_pending_decisions AS
 SELECT cd.id,
    cd.venture_id,
    v.name AS venture_name,
    cd.lifecycle_stage,
    lsc.stage_name::character varying(100) AS stage_name,
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
     LEFT JOIN venture_stages lsc ON lsc.stage_number = cd.lifecycle_stage
  WHERE cd.deleted_at IS NULL
  ORDER BY cd.created_at DESC;

-- 7. fn_chairman_dashboard_config_governance_audit: fix stale NOTICE string ---
DO $notice$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.fn_chairman_dashboard_config_governance_audit()'::regprocedure) INTO v_def;
  IF v_def IS NOT NULL AND position('Use stage_config.gate_type as the source of truth' IN v_def) > 0 THEN
    v_def := replace(v_def, 'Use stage_config.gate_type as the source of truth', 'Use venture_stages.gate_type as the source of truth');
    EXECUTE v_def;
  END IF;
END
$notice$;

-- ---------------------------------------------------------------------------
-- Terminal verification: abort COMMIT unless every reader repointed cleanly.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def text;
  v_clean text;
  v_fn text;
  v_fns text[] := ARRAY['can_auto_advance','stage_creates_decision','set_stage_override','get_venture_stage_summary','initialize_venture_stages'];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = v_fn AND n.nspname = 'public';

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'VERIFY FAILED: function % is missing after migration', v_fn;
    END IF;
    IF position('venture_stages' IN v_def) = 0 THEN
      RAISE EXCEPTION 'VERIFY FAILED: function % does not reference venture_stages', v_fn;
    END IF;
    -- substring-safe legacy check: strip the compound names, then look for bare stage_config
    v_clean := replace(replace(lower(v_def), 'lifecycle_stage_config', ''), 'stage_config_audit', '');
    IF position('stage_config' IN v_clean) > 0 THEN
      RAISE EXCEPTION 'VERIFY FAILED: function % still references stage_config', v_fn;
    END IF;
    IF position('lifecycle_stage_config' IN lower(v_def)) > 0 THEN
      RAISE EXCEPTION 'VERIFY FAILED: function % still references lifecycle_stage_config', v_fn;
    END IF;
  END LOOP;

  -- view
  SELECT pg_get_viewdef('public.v_chairman_pending_decisions'::regclass, true) INTO v_def;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: v_chairman_pending_decisions is missing';
  END IF;
  IF position('venture_stages' IN v_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: view does not reference venture_stages';
  END IF;
  IF position('lifecycle_stage_config' IN lower(v_def)) > 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: view still references lifecycle_stage_config';
  END IF;

  RAISE NOTICE 'VERIFY OK: 5 functions + v_chairman_pending_decisions repointed to venture_stages.';
END
$verify$;

COMMIT;
