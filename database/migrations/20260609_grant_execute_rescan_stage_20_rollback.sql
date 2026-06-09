-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-FIX-GRANT-EXECUTE-RESCAN-001 (ROLLBACK)
--
-- Reverses 20260609_grant_execute_rescan_stage_20.sql: REVOKE EXECUTE on
-- rescan_stage_20(uuid) FROM authenticated, restoring the prior {postgres, service_role}
-- ACL (pre-migration 42501 state). Non-destructive — does not touch the function body or
-- the service_role grant.
--
-- Overload-safe (revokes every public overload via pg_proc::regprocedure).

DO $revoke$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname = 'rescan_stage_20'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
    n := n + 1;
    RAISE NOTICE 'SD-LEO-FIX-GRANT-EXECUTE-RESCAN-001 (rollback): revoked EXECUTE on % from authenticated', r.sig;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'rescan_stage_20 not found in public schema — aborting rollback.';
  END IF;
END
$revoke$;
