-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001
--
-- Restore the EXECUTE grant for the `authenticated` role on chairman/venture-facing
-- Postgres RPCs whose grants were silently dropped by CREATE OR REPLACE FUNCTION,
-- producing HTTP 403 (permission denied) in the EHG app. Audit basis: every
-- supabase.rpc('...') call in ehg/src cross-checked against
-- has_function_privilege('authenticated', fn, 'EXECUTE'). 18 functions were missing
-- the grant (confirmed-live: can_auto_advance 403 on the Stage 19 venture page).
--
-- SAFETY: all 18 are SECURITY DEFINER with internal authorization
-- (fn_is_chairman() / auth.uid() / service_role checks) — the EXECUTE grant only
-- permits the role to CALL the function; the function's internal authz remains the
-- security boundary. This is the standard Supabase pattern.
--   * anon is NOT granted (defense-in-depth: the UI calls these as authenticated,
--     and the functions reject anon internally anyway).
--   * master_reset_portfolio is intentionally EXCLUDED — it is SECURITY DEFINER with
--     an internal caller_role='service_role' guard, so it is service-role-only by
--     design; its missing authenticated grant is correct.
--
-- Idempotent (GRANT is idempotent) and overload-safe (grants every public overload
-- of each named function via pg_proc::regprocedure).

DO $grant$
DECLARE
  fn_names text[] := ARRAY[
    'advance_venture_stage',
    'advance_venture_to_stage',
    'approve_chairman_decision',
    'bootstrap_venture_workflow',
    'can_auto_advance',
    'create_eva_conversation',
    'delete_venture',
    'eva_circuit_allows_request',
    'export_blueprint_review',
    'kill_venture',
    'log_stage_advance_override',
    'park_venture_decision',
    'record_eva_failure',
    'record_eva_success',
    'reject_chairman_decision',
    'reset_eva_circuit',
    'set_global_auto_proceed',
    'set_stage_override'
  ];
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname = ANY(fn_names)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    n := n + 1;
    RAISE NOTICE 'SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001: granted EXECUTE on % to authenticated', r.sig;
  END LOOP;

  IF n = 0 THEN
    RAISE EXCEPTION 'No matching functions found in public schema — aborting (audit drift; investigate).';
  END IF;

  RAISE NOTICE 'SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001: granted EXECUTE to authenticated on % function overload(s).', n;
END
$grant$;
