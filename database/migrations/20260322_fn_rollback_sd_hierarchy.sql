-- fn_rollback_sd_hierarchy: Cascade-cancel an entire SD hierarchy
-- SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-D (US-006)
--
-- Recursively finds all descendants of an orchestrator SD and sets
-- their status to 'cancelled'. Also cancels associated PRDs.
-- Returns a JSON summary of what was cancelled.

CREATE OR REPLACE FUNCTION fn_rollback_sd_hierarchy(p_orchestrator_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
$$;

COMMENT ON FUNCTION fn_rollback_sd_hierarchy(TEXT) IS
  'Cascade-cancel an SD hierarchy (orchestrator + children + grandchildren + PRDs). SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-D';
