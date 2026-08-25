-- CAPTURED LIVE via pg_get_functiondef() at 2026-08-24T22:22:58.546Z
-- SD-LEO-INFRA-FOLLOW-WIRE-REGISTERED-001 / FR-2 -- BEFORE artifact.
-- Source: live consolidated engineer DB. NOT copied from any migration file (a stale
-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD
-- this session -- see the choke file's own section 4 provenance note).
--
CREATE OR REPLACE FUNCTION public.fn_rollback_sd_hierarchy(p_orchestrator_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_cancelled_sds INTEGER := 0;
  v_cancelled_prds INTEGER := 0;
  v_descendant_ids TEXT[];
  v_descendant_uuids UUID[];
BEGIN
  -- Find all descendants using recursive CTE
  WITH RECURSIVE descendants AS (
    SELECT id, uuid_id
    FROM strategic_directives_v2
    WHERE id = p_orchestrator_id
    UNION ALL
    SELECT sd.id, sd.uuid_id
    FROM strategic_directives_v2 sd
    JOIN descendants d ON sd.parent_sd_id = d.id
  )
  SELECT
    array_agg(id),
    array_agg(uuid_id)
  INTO v_descendant_ids, v_descendant_uuids
  FROM descendants;

  -- Cancel all descendant SDs
  IF v_descendant_ids IS NOT NULL THEN
    UPDATE strategic_directives_v2
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id = ANY(v_descendant_ids)
      AND status != 'cancelled';
    GET DIAGNOSTICS v_cancelled_sds = ROW_COUNT;
  END IF;

  -- Cancel associated PRDs (directive_id references uuid_id)
  IF v_descendant_uuids IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE directive_id = ANY(v_descendant_uuids)
      AND status != 'cancelled';
    GET DIAGNOSTICS v_cancelled_prds = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'cancelled_sds', v_cancelled_sds,
    'cancelled_prds', v_cancelled_prds,
    'orchestrator_id', p_orchestrator_id,
    'total_descendants', COALESCE(array_length(v_descendant_ids, 1), 0)
  );
END;
$function$

