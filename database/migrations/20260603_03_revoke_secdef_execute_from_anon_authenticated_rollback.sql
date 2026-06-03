-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK C. Restore the Supabase default: GRANT EXECUTE on every public
-- SECURITY DEFINER function to anon, authenticated. Idempotent.
-- =============================================================================
DO $rb$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
      AND pg_get_userbyid(p.proowner) = current_user
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated', r.proname, r.args);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'ROLLBACK C: re-granted anon/authenticated EXECUTE on % function(s).', v_count;
END
$rb$;
