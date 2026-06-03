-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK C. Restore the Supabase default: GRANT EXECUTE on every public
-- SECURITY DEFINER function to anon, authenticated, PUBLIC. Idempotent.
-- (The default EXECUTE grant was to PUBLIC, which anon/authenticated inherit; the
--  forward migration revoked PUBLIC, so the rollback must re-GRANT it to fully undo.)
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
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated, PUBLIC', r.proname, r.args);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'ROLLBACK C: re-granted anon/authenticated/PUBLIC EXECUTE on % function(s).', v_count;
END
$rb$;
