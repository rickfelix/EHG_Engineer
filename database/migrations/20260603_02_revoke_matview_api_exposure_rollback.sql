-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK B. Re-grant SELECT on the four matviews to anon, authenticated.
-- (Restores Data-API readability — the only meaningful privilege on a matview.)
-- Guarded so it no-ops if a matview has since been dropped.
-- =============================================================================
DO $rb$
DECLARE
  m TEXT;
BEGIN
  FOREACH m IN ARRAY ARRAY['mv_sd_summary','mv_operations_dashboard',
                           'stage_zero_experiment_telemetry','v_gate_health_metrics']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND c.relname=m AND c.relkind='m') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', m);
      RAISE NOTICE 'ROLLBACK B: re-granted SELECT on public.% to anon, authenticated', m;
    END IF;
  END LOOP;
END
$rb$;
