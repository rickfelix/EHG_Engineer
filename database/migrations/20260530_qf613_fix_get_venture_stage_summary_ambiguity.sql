-- =============================================================================
-- QF-20260530-613: fix latent "stage_status is ambiguous" in get_venture_stage_summary
-- @approved-by: rickfelix@example.com
-- Date: 2026-05-30
--
-- The completed_stages subquery referenced unqualified `stage_status` / `venture_id`,
-- which collide with the function's RETURNS TABLE OUT-params (stage_status) — every
-- call raised "column reference stage_status is ambiguous". Pre-existing (predates the
-- Child F venture_stages repoint); the function is currently a dead RPC (no callers) but
-- is exposed in the EHG app's generated types, so a future caller would hit the error.
-- Fix: alias the subquery's venture_stage_work as vsw2 and qualify its columns. No other
-- logic change (still reads venture_stages, same ::varchar casts, same return shape).
-- =============================================================================

BEGIN;

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
    (SELECT COUNT(*)::INT FROM venture_stage_work vsw2 WHERE vsw2.venture_id = v.id AND vsw2.stage_status = 'completed'),
    25
  FROM ventures v
  LEFT JOIN venture_stages lsc ON v.current_lifecycle_stage = lsc.stage_number
  LEFT JOIN venture_stage_work vsw ON v.id = vsw.venture_id AND v.current_lifecycle_stage = vsw.lifecycle_stage
  WHERE v.id = p_venture_id;
END;
$function$;

-- Verify: the function now executes without the ambiguity error (it raised before).
DO $verify$
DECLARE
  v_vid uuid;
BEGIN
  SELECT id INTO v_vid FROM ventures LIMIT 1;
  IF v_vid IS NOT NULL THEN
    PERFORM * FROM get_venture_stage_summary(v_vid);
    RAISE NOTICE 'VERIFY OK: get_venture_stage_summary(%) executes without ambiguity', v_vid;
  ELSE
    RAISE NOTICE 'VERIFY SKIPPED: no ventures to exercise the function (DDL still applied)';
  END IF;
END
$verify$;

COMMIT;
