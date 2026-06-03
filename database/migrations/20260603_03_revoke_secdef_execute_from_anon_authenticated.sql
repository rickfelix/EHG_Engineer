-- @approved-by: rickfelix@example.com
-- =============================================================================
-- C. Revoke anon/authenticated EXECUTE on public SECURITY DEFINER functions
--    (anon_security_definer_function_executable / authenticated_*_executable)
-- =============================================================================
-- Supabase linter flags every public SECURITY DEFINER function that anon or
-- authenticated can call as a REST RPC (/rest/v1/rpc/<fn>). Live-verified state:
--   * 118 SECURITY DEFINER functions in public, ALL owned by `postgres`.
--   * EXECUTE granted to anon on 112, to authenticated on 117 (Supabase default
--     `GRANT EXECUTE ... TO anon, authenticated`, NOT a deliberate API surface).
-- These include destructive/privileged operations (delete_venture, kill_venture,
-- master_reset_portfolio, advance_venture_stage, set_global_auto_proceed, claim_sd,
-- complete_orchestrator_sd, ...). The anon key is public (embedded client-side), so
-- this is a genuine privilege-escalation surface.
--
-- ACCESS-MODEL SAFETY: the server calls every RPC with the service_role key
-- (bypasses this revoke); the lone anon consumer (realtime-dashboard.js) only opens
-- table subscriptions and never calls .rpc(). service_role EXECUTE is untouched.
--
-- ALLOWLIST — functions that MUST remain anon/authenticated-executable, or RLS
-- evaluation / auth breaks (PostgreSQL checks EXECUTE against the CALLING role even
-- for SECURITY DEFINER functions, INCLUDING inside RLS policy USING/WITH CHECK):
--   (1) DYNAMIC: every public SECDEF function whose name appears in ANY RLS policy
--       expression. Live scan found 5 in use:
--         fn_is_chairman (19 policies), fn_user_has_venture_access (15),
--         is_leo_admin (9), fn_is_service_role (7), check_feedback_rate_limit (1).
--       Deriving this dynamically auto-protects future policy usage too.
--   (2) EXPLICIT auth primitives (defense-in-depth): the set above plus
--       fn_user_has_company_access (a sibling helper not currently in a policy).
-- Everything NOT in the allowlist is revoked from BOTH anon and authenticated.
--
-- The allowlisted functions (~6) intentionally remain authenticated-executable and
-- will still appear in the linter — that is correct-by-design (revoking them breaks
-- authorization). Documented in the PR as accepted findings.
--
-- IDEMPOTENT (REVOKE on an already-revoked function is a no-op) + OVERLOAD-SAFE
-- (revoked by full identity signature) + OWNERSHIP-GUARDED (postgres owns all 118).
-- =============================================================================

DO $revoke$
DECLARE
  r RECORD;
  v_allow TEXT[];
  v_count INTEGER := 0;
BEGIN
  -- Build the allowlist: policy-referenced SECDEF function names UNION explicit primitives.
  SELECT array_agg(DISTINCT s.proname)
    INTO v_allow
  FROM (
    SELECT DISTINCT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
  ) s
  WHERE EXISTS (
    SELECT 1 FROM pg_policy pol
    WHERE (coalesce(pg_get_expr(pol.polqual,  pol.polrelid), '') || ' ' ||
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          ~ ('\m' || s.proname || '\M')
  );

  v_allow := coalesce(v_allow, '{}'::text[]) || ARRAY[
    'fn_is_chairman','fn_is_service_role','fn_user_has_company_access',
    'fn_user_has_venture_access','is_leo_admin','check_feedback_rate_limit'
  ];

  RAISE NOTICE 'C: allowlist (kept anon/authenticated-executable) = %', v_allow;

  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = current_user      -- only what we own
      AND NOT (p.proname = ANY(v_allow))                  -- skip allowlisted
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, authenticated',
                   r.proname, r.args);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'C COMPLETE: revoked anon/authenticated EXECUTE on % SECURITY DEFINER function(s).', v_count;
END
$revoke$;

-- Verification: every public SECDEF function STILL executable by anon or
-- authenticated must be in the allowlist (policy-referenced or explicit primitive).
DO $verify$
DECLARE
  v_bad INTEGER;
  v_detail TEXT;
  v_allow TEXT[];
BEGIN
  SELECT array_agg(DISTINCT s.proname) INTO v_allow
  FROM (SELECT DISTINCT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef) s
  WHERE EXISTS (SELECT 1 FROM pg_policy pol
    WHERE (coalesce(pg_get_expr(pol.polqual,pol.polrelid),'')||' '||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),''))
          ~ ('\m'||s.proname||'\M'));
  v_allow := coalesce(v_allow,'{}'::text[]) || ARRAY[
    'fn_is_chairman','fn_is_service_role','fn_user_has_company_access',
    'fn_user_has_venture_access','is_leo_admin','check_feedback_rate_limit'];

  SELECT count(*), string_agg(DISTINCT p.proname, ', ')
    INTO v_bad, v_detail
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN LATERAL aclexplode(p.proacl) a
  JOIN pg_roles ro ON ro.oid = a.grantee
  WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
    AND a.privilege_type='EXECUTE'
    AND ro.rolname IN ('anon','authenticated')
    AND NOT (p.proname = ANY(v_allow));

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'C NOT cleared: % non-allowlisted SECDEF function(s) still executable by anon/authenticated: %', v_bad, v_detail;
  END IF;
  RAISE NOTICE 'C VERIFIED: only allowlisted RLS/auth primitives remain anon/authenticated-executable.';
END
$verify$;
