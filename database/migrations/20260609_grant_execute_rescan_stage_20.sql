-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-FIX-GRANT-EXECUTE-RESCAN-001
--
-- Restore the EXECUTE grant for the `authenticated` role on rescan_stage_20(uuid).
-- The EHG Chairman Dashboard Stage 20 rescan button (ehg/src ReplitStatusPanel.tsx,
-- Stage20BuildExecution.tsx) calls this RPC as the logged-in `authenticated` role and
-- gets Postgres 42501 (permission denied for function). Verified live: rescan_stage_20
-- is SECURITY DEFINER (owner postgres) with proacl {postgres=X, service_role=X} — PUBLIC
-- EXECUTE was revoked by a prior security sweep and `authenticated` was never re-granted.
-- service_role-only callers (scripts/rescan-stage20.js) work, which hid the gap from
-- backend tooling.
--
-- Same bug class as SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001 (18 RPCs restored,
-- 20260606_restore_rpc_execute_grants.sql), which did not include this one function.
--
-- SAFETY: rescan_stage_20 is SECURITY DEFINER — the EXECUTE grant only permits the role
-- to CALL the function; the function logic remains the effect boundary.
--   * anon is NOT granted (the function mutates ventures / venture_stage_work /
--     strategic_directives_v2 / chairman_decisions and auto-advances stages; the UI calls
--     it as authenticated only).
--
-- Idempotent (GRANT is idempotent) and overload-safe (grants every public overload of
-- rescan_stage_20 via pg_proc::regprocedure). Only one overload exists today: (uuid).
--
-- Convention reminder: after any CREATE OR REPLACE FUNCTION on rescan_stage_20, re-assert
-- this grant in the same migration (CREATE OR REPLACE preserves grants, but DROP+CREATE
-- and PUBLIC-revoke sweeps do not). scripts/audit-rpc-execute-grants.mjs guards this.

DO $grant$
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
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    n := n + 1;
    RAISE NOTICE 'SD-LEO-FIX-GRANT-EXECUTE-RESCAN-001: granted EXECUTE on % to authenticated', r.sig;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'rescan_stage_20 not found in public schema — aborting (audit drift; investigate).';
  END IF;

  RAISE NOTICE 'SD-LEO-FIX-GRANT-EXECUTE-RESCAN-001: granted EXECUTE to authenticated on % rescan_stage_20 overload(s).', n;
END
$grant$;
