-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK A. Un-pin search_path on the six non-public functions.
-- Restores the prior (mutable) state by RESETting search_path. Behavior-neutral:
-- these functions resolved names against the caller's path before, and will again.
-- =============================================================================
DO $rb$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('governance','governance_archive','portfolio')
      AND p.prokind = 'f'
      AND pg_get_userbyid(p.proowner) = current_user
      AND p.proname IN (
        'update_eva_authority_timestamp','update_stage_contracts_timestamp',
        'update_supervision_policies_timestamp','update_ventures_updated_at',
        'restore_sd_from_archive','restore_all_from_archive')
      AND EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) x WHERE x LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) RESET search_path', r.schema, r.proname, r.args);
    RAISE NOTICE 'ROLLBACK A: reset search_path on %.%(%)', r.schema, r.proname, r.args;
  END LOOP;
END
$rb$;
