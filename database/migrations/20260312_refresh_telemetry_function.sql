-- Migration: Create refresh_experiment_telemetry() function
-- Date: 2026-03-12
-- Purpose: Provides a callable function to refresh the stage_zero_experiment_telemetry
--          materialized view. Uses SECURITY DEFINER so authenticated users can invoke it
--          without needing direct ownership of the materialized view.

CREATE OR REPLACE FUNCTION public.refresh_experiment_telemetry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY stage_zero_experiment_telemetry;
END;
$$;

COMMENT ON FUNCTION public.refresh_experiment_telemetry() IS
  'Refreshes the stage_zero_experiment_telemetry materialized view concurrently. '
  'SECURITY DEFINER allows application code to call this without direct view ownership.';

GRANT EXECUTE ON FUNCTION public.refresh_experiment_telemetry() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_experiment_telemetry() TO service_role;

-- Rollback:
-- REVOKE EXECUTE ON FUNCTION public.refresh_experiment_telemetry() FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION public.refresh_experiment_telemetry() FROM service_role;
-- DROP FUNCTION IF EXISTS public.refresh_experiment_telemetry();
