-- @approved-by: rickfelix@example.com
-- =============================================================================
-- B. Remove matview Data-API exposure (materialized_view_in_api)
-- =============================================================================
-- Supabase linter `materialized_view_in_api`: four public materialized views are
-- selectable by anon/authenticated and therefore exposed over PostgREST:
--   public.mv_sd_summary
--   public.mv_operations_dashboard
--   public.stage_zero_experiment_telemetry
--   public.v_gate_health_metrics
--
-- ROOT CAUSE: each matview was created owned by `postgres` and inherited the
-- Supabase default grant `GRANT ALL TO anon, authenticated` (live-verified relacl:
-- anon=arwdDxtm, authenticated=arwdDxtm). Matviews do NOT support RLS, so the only
-- remediation is to REVOKE the API roles. The 2026-06-02 RLS sweep secured base
-- tables (relkind r/p) but did not touch matviews (relkind m) — this closes that gap.
--
-- ACCESS-MODEL SAFETY (live-verified):
--   * None of the 4 matviews is a member of any publication -> Realtime does not
--     and cannot subscribe to them; the anon Realtime client is unaffected.
--   * The only readers in code are SERVER-SIDE scripts (gate-health-check.js,
--     claude-md-generator/db-queries.js, archived experiment scripts) which connect
--     with the service_role / pooler — NEVER the anon browser key.
--   * service_role retains its grant (we revoke only anon, authenticated) and
--     bypasses RLS regardless. -> zero reader breakage.
--
-- DYNAMIC + IDEMPOTENT: self-heals every public matview that still grants anon or
-- authenticated, so it also covers any future matview and is a no-op on re-run.
-- =============================================================================

DO $revoke$
DECLARE
  m RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR m IN
    SELECT DISTINCT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'm'                                  -- materialized views
      AND EXISTS (                                         -- still grants anon/authenticated
        SELECT 1 FROM aclexplode(c.relacl) a
        JOIN pg_roles r ON r.oid = a.grantee
        WHERE r.rolname IN ('anon','authenticated')
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', m.relname);
    v_count := v_count + 1;
    RAISE NOTICE 'B: revoked anon/authenticated on matview public.%', m.relname;
  END LOOP;
  RAISE NOTICE 'B COMPLETE: % matview(s) de-exposed.', v_count;
END
$revoke$;

-- Verification: ZERO public matviews still grant anon or authenticated.
DO $verify$
DECLARE
  v_remaining INTEGER;
  v_detail TEXT;
BEGIN
  SELECT count(DISTINCT c.relname), string_agg(DISTINCT c.relname, ', ')
    INTO v_remaining, v_detail
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN aclexplode(c.relacl) a ON true
  JOIN pg_roles r ON r.oid = a.grantee
  WHERE n.nspname = 'public' AND c.relkind = 'm'
    AND r.rolname IN ('anon','authenticated');

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'B NOT cleared: % matview(s) still expose anon/authenticated: %', v_remaining, v_detail;
  END IF;
  RAISE NOTICE 'B VERIFIED: 0 public matviews selectable by anon/authenticated.';
END
$verify$;
