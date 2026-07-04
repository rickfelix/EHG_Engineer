-- Migration: MarketLens content-loop instance-concurrency RPCs
-- SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001
-- Date: 2026-07-04
-- Purpose: Atomic acquire/release for factory_guardrail_state.active_content_loop_instances
--   (added in 20260704_marketlens_owned_audience_caps.sql). A single UPDATE...WHERE
--   statement is the race-safe primitive — two concurrent callers cannot both succeed
--   past the cap because the increment and the cap check happen atomically inside one
--   UPDATE at the database level.
--
-- If no factory_guardrail_state row exists for the venture, the UPDATE matches zero
-- rows and this fails closed (acquired=false) rather than silently creating an
-- unmanaged guardrail row.

CREATE OR REPLACE FUNCTION acquire_content_loop_instance_slot(p_venture_id UUID, p_max_instances INTEGER DEFAULT 2)
RETURNS TABLE (acquired BOOLEAN, current_count INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE factory_guardrail_state
  SET active_content_loop_instances = active_content_loop_instances + 1
  WHERE venture_id = p_venture_id
    AND active_content_loop_instances < p_max_instances
  RETURNING active_content_loop_instances INTO v_new_count;

  IF v_new_count IS NULL THEN
    SELECT active_content_loop_instances INTO v_new_count
    FROM factory_guardrail_state WHERE venture_id = p_venture_id;
    RETURN QUERY SELECT false, COALESCE(v_new_count, p_max_instances);
  ELSE
    RETURN QUERY SELECT true, v_new_count;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION release_content_loop_instance_slot(p_venture_id UUID)
RETURNS TABLE (current_count INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE factory_guardrail_state
  SET active_content_loop_instances = GREATEST(0, active_content_loop_instances - 1)
  WHERE venture_id = p_venture_id
  RETURNING active_content_loop_instances INTO v_new_count;

  RETURN QUERY SELECT COALESCE(v_new_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION acquire_content_loop_instance_slot(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION acquire_content_loop_instance_slot(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_content_loop_instance_slot(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION release_content_loop_instance_slot(UUID) TO service_role;
