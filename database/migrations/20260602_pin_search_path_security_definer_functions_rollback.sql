-- @approved-by: rickfelix@example.com
-- =============================================================================
-- ROLLBACK: unpin search_path on the SECURITY DEFINER functions pinned by
-- 20260602_pin_search_path_security_definer_functions.sql
-- =============================================================================
-- The forward migration pinned search_path on a reviewed set of 14 functions
-- (overload-safe: 13 names, get_schema_columns has 2 overloads). All of them had
-- NO prior search_path in proconfig (verified live: the detection query returned
-- exactly these because they lacked any `search_path=%` entry). Therefore the
-- exact inverse is `ALTER FUNCTION ... RESET search_path`, which removes the
-- pinned entry and returns each function to inheriting the caller's search_path.
--
-- IDEMPOTENT + OVERLOAD-SAFE: iterates pg_proc filtered to the reviewed target
-- set and RESETs only those that currently HAVE a pinned search_path. Re-running
-- after a partial rollback is a no-op.
--
-- WARNING: applying this rollback RE-OPENS the function_search_path_mutable
-- finding (re-introduces the CVE-2018-1058 vector). Only run to recover from a
-- regression where a pinned path broke a function at call time.
-- =============================================================================

DO $unpin$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      -- Only RESET functions that currently HAVE a pinned search_path (idempotent).
      AND EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) x
        WHERE x LIKE 'search_path=%'
      )
      AND p.proname IN (
        'master_reset_portfolio',
        'export_blueprint_review',
        'fn_rollback_sd_hierarchy',
        'export_blueprint_review_with_eva',
        'rescan_stage_20',
        'fn_atomic_exec_to_plan_transition',
        'advance_venture_to_stage',
        'check_feedback_rate_limit',
        'get_schema_columns',
        'rpc_activate_vision_with_bypass',
        'fn_complete_stitch_curation',
        'trg_retrospectives_audit',
        'fn_atomic_lead_to_plan_transition'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) RESET search_path',
      r.proname, r.args
    );
    RAISE NOTICE 'Unpinned search_path on public.%(%)', r.proname, r.args;
  END LOOP;
END
$unpin$;
