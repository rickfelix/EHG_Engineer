-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK: unpin search_path on the SECURITY INVOKER functions pinned by
-- 20260602_pin_search_path_invoker_functions.sql
-- =============================================================================
-- The forward migration pinned `search_path = public, extensions` on the 526
-- owned, non-extension SECURITY INVOKER public functions that previously had NO
-- pinned search_path. The exact inverse is `ALTER FUNCTION ... RESET search_path`,
-- returning each to inheriting the caller's search_path.
--
-- SCOPED RESET — DO NOT CLOBBER PRE-EXISTING PINS OR OTHER OWNERS' FUNCTIONS:
--   * 44 OTHER SECURITY INVOKER public functions were ALREADY pinned to
--     `search_path=public` at forward-migration time (the forward migration skips
--     anything already pinned). This rollback MUST NOT reset those.
--   * 225 extension-member functions (owner supabase_admin) were never touched.
--   This rollback RESETs ONLY functions whose proconfig contains the EXACT value
--   the forward migration writes: `search_path=public, extensions` (Postgres
--   stores it verbatim, confirmed live). The pre-existing `search_path=public`
--   pins and the extension functions do not match and are left intact. It is
--   further restricted to functions we OWN and to prosecdef = false (SECURITY
--   DEFINER pins belong to the companion DEFINER rollback).
--
-- IDEMPOTENT + OVERLOAD-SAFE: iterates pg_proc by identity signature and RESETs
-- only matching functions; re-running after a partial rollback is a no-op.
--
-- WARNING: applying this rollback RE-OPENS the function_search_path_mutable
-- finding for these 526 functions. Only run to recover from a regression where a
-- pinned path broke a function at call time.
-- =============================================================================

DO $unpin$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef = false
      AND pg_get_userbyid(p.proowner) = current_user  -- only functions we own (belt-and-suspenders).
      -- RESET ONLY functions pinned to the EXACT value the forward migration wrote.
      AND p.proconfig @> ARRAY['search_path=public, extensions']
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) RESET search_path',
      r.proname, r.args
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Unpinned search_path on % owned SECURITY INVOKER function(s) (only those set to "public, extensions").', v_count;
END
$unpin$;
