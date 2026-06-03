-- @approved-by: rickfelix@example.com
-- =============================================================================
-- A. Pin search_path on NON-PUBLIC owned functions (function_search_path_mutable)
-- =============================================================================
-- RESIDUAL of the 2026-06-02 sweep. Both prior migrations
--   20260602_pin_search_path_security_definer_functions.sql
--   20260602_pin_search_path_invoker_functions.sql
-- were scoped `WHERE n.nspname='public'`. Six `postgres`-owned functions live in
-- the custom schemas governance / governance_archive / portfolio and were never
-- visited, so they still trip Supabase linter `function_search_path_mutable`:
--   governance.update_eva_authority_timestamp()           (trigger)
--   governance.update_stage_contracts_timestamp()         (trigger)
--   governance.update_supervision_policies_timestamp()    (trigger)
--   portfolio.update_ventures_updated_at()                (trigger)
--   governance_archive.restore_sd_from_archive(text)
--   governance_archive.restore_all_from_archive()
--
-- All six are SECURITY INVOKER and owned by `postgres` (our deploy role) — live
-- verified. The three governance triggers + the portfolio trigger only do
-- `NEW.updated_at := now()`. The two restore functions read
-- information_schema.columns (qualified) and run dynamic SQL against their own
-- schema (governance_archive.*) and public.* target tables.
--
-- BEHAVIOR-PRESERVING PINNED PATH:  <own_schema>, public, extensions
--   * own schema FIRST  -> restore fns resolve their governance_archive.* sources;
--     harmless for the triggers (which reference nothing).
--   * public            -> restore fns resolve public.* target tables;
--     triggers resolve nothing here.
--   * extensions        -> belt-and-suspenders for any gen_random_uuid()/digest()
--     (mirrors the 2026-06-02 invoker migration's `public, extensions` choice).
--   * pg_catalog is NOT listed -> Postgres keeps searching it implicitly FIRST, so
--     now()/NOW() and every builtin resolve exactly as today (no shadowing risk).
--
-- We do NOT rewrite function bodies. ALTER FUNCTION ... SET search_path is
-- non-destructive and takes effect on the next call.
-- IDEMPOTENT (skips anything already pinned) + OVERLOAD-SAFE (full identity sig) +
-- OWNERSHIP-GUARDED (only ALTER functions we own).
-- =============================================================================

DO $pin$
DECLARE
  r RECORD;
  v_path TEXT;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname AS schema, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('governance', 'governance_archive', 'portfolio')
      AND p.prokind = 'f'
      AND pg_get_userbyid(p.proowner) = current_user           -- only what we own
      AND NOT EXISTS (                                          -- not an extension member
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
      )
      AND NOT EXISTS (                                          -- not already pinned
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) x
        WHERE x LIKE 'search_path=%'
      )
      -- explicit reviewed target set (defense-in-depth: never silently pin a NEW
      -- unreviewed function that lands in these schemas before this runs).
      AND p.proname IN (
        'update_eva_authority_timestamp',
        'update_stage_contracts_timestamp',
        'update_supervision_policies_timestamp',
        'update_ventures_updated_at',
        'restore_sd_from_archive',
        'restore_all_from_archive'
      )
  LOOP
    v_path := format('%I, public, extensions', r.schema);
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = %s',
                   r.schema, r.proname, r.args, v_path);
    v_count := v_count + 1;
    RAISE NOTICE 'Pinned search_path on %.%(%) -> %', r.schema, r.proname, r.args, v_path;
  END LOOP;
  RAISE NOTICE 'A COMPLETE: pinned % non-public function(s).', v_count;
END
$pin$;

-- Verification: ZERO of the six target functions remain with a mutable search_path.
DO $verify$
DECLARE
  v_remaining INTEGER;
  v_detail TEXT;
BEGIN
  SELECT count(*), string_agg(p.oid::regprocedure::text, ', ')
    INTO v_remaining, v_detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('governance', 'governance_archive', 'portfolio')
    AND p.prokind = 'f'
    AND p.proname IN (
      'update_eva_authority_timestamp','update_stage_contracts_timestamp',
      'update_supervision_policies_timestamp','update_ventures_updated_at',
      'restore_sd_from_archive','restore_all_from_archive')
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) x
      WHERE x LIKE 'search_path=%');

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'A NOT cleared: % target function(s) still mutable: %', v_remaining, v_detail;
  END IF;
  RAISE NOTICE 'A VERIFIED: 0 target non-public functions with mutable search_path.';
END
$verify$;
