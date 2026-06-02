-- @approved-by: rickfelix@example.com
-- =============================================================================
-- Pin search_path on SECURITY DEFINER functions (function_search_path_mutable)
-- =============================================================================
-- Supabase linter finding: SECURITY DEFINER functions in `public` that do NOT
-- pin search_path resolve unqualified object names against the CALLER's
-- search_path while running with the OWNER's elevated privileges. This is the
-- CVE-2018-1058 privilege-escalation vector: a caller can prepend a schema that
-- shadows a table/function the elevated function relies on.
--
-- FIX: pin a correct, MINIMAL search_path on each affected function. We do NOT
-- rewrite function bodies (no `search_path=''` + fully-qualify rewrite — too
-- invasive for live LEO-governance functions). ALTER FUNCTION ... SET
-- search_path is non-destructive to the body and takes effect on next call.
--
-- Schema analysis (pg_get_functiondef inspected for every target):
--   * 12 of 14 functions reference ONLY `public` tables/functions + pg_catalog
--     builtins (jsonb_*, NOW(), set_config, pg_try_advisory_xact_lock, hashtext,
--     to_jsonb, current_setting, pg_tables, EXTRACT). Helper functions they call
--     unqualified (fn_is_chairman, _get_venture_archetype) live in `public`.
--     -> pinned path: public, pg_catalog
--   * get_schema_columns() and get_schema_columns(text) read
--     information_schema.columns (already schema-qualified, so it resolves under
--     any path, but we include information_schema explicitly for clarity/robustness).
--     -> pinned path: public, pg_catalog, information_schema
--
-- pg_catalog is implicitly searched by Postgres regardless, but we pin it
-- explicitly so the effective resolution order is fully deterministic and the
-- linter finding clears. pg_temp is intentionally NOT included: none of these
-- functions create or reference temp objects, and omitting pg_temp from a
-- SECURITY DEFINER path is the safer default (prevents temp-object shadowing).
--
-- IDEMPOTENT: the DO-block selects the exact "SECURITY DEFINER + mutable" target
-- set by predicate, so re-running after a partial apply is a no-op for any
-- function already pinned, and ALTER ... SET search_path is itself idempotent.
-- OVERLOAD-SAFE: iterates pg_proc and uses pg_get_function_identity_arguments()
-- so the two get_schema_columns overloads are pinned by full identity signature.
--
-- SD: function_search_path_mutable hardening (security-relevant subset)
-- =============================================================================

DO $pin$
DECLARE
  r RECORD;
  v_path TEXT;
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
      -- Only touch functions that do NOT already pin search_path (idempotent re-run).
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) x
        WHERE x LIKE 'search_path=%'
      )
      -- Restrict to the explicit reviewed target set (defense-in-depth: even if a
      -- NEW unreviewed SECURITY DEFINER function lands before this runs, we will
      -- NOT silently pin it with the wrong path).
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
    -- get_schema_columns (both overloads) reads information_schema.columns.
    IF r.proname = 'get_schema_columns' THEN
      v_path := 'public, pg_catalog, information_schema';
    ELSE
      v_path := 'public, pg_catalog';
    END IF;

    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = %s',
      r.proname, r.args, v_path
    );

    RAISE NOTICE 'Pinned search_path on public.%(%) -> %', r.proname, r.args, v_path;
  END LOOP;
END
$pin$;

-- -----------------------------------------------------------------------------
-- Verification: assert ZERO SECURITY DEFINER functions in public remain with a
-- mutable search_path (across the reviewed target set + any other public secdef
-- function). If any remain, raise so the migration fails loudly.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_remaining INTEGER;
  v_detail TEXT;
BEGIN
  SELECT count(*),
         string_agg(p.oid::regprocedure::text, ', ')
    INTO v_remaining, v_detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) x
      WHERE x LIKE 'search_path=%'
    );

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'function_search_path_mutable NOT cleared: % SECURITY DEFINER function(s) still mutable: %',
      v_remaining, v_detail;
  END IF;

  RAISE NOTICE 'Verification passed: 0 SECURITY DEFINER functions in public with mutable search_path.';
END
$verify$;
