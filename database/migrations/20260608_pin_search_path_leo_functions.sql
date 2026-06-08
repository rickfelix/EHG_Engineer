-- ============================================================================
-- SD-LEO-GEN-PIN-SEARCH-PATH-001
-- Pin search_path on three LEO plpgsql functions (function_search_path_mutable)
-- ----------------------------------------------------------------------------
-- WHY: The Supabase database-linter WARNs that three public-schema plpgsql
-- functions have a role-mutable search_path (pg_proc.proconfig IS NULL):
--   - reset_cancelled_sd_patterns(text, text)
--   - trg_fn_reset_patterns_on_sd_cancel()
--   - leo_auto_exec_audit_append_only()
-- A mutable search_path is a theoretical search-path-injection vector. It is not
-- reachable by anon/authenticated here (an attacker would already need to create
-- objects earlier on the resolution path), so this is standard hardening, not an
-- active hole.
--
-- NOTE (verify-before-build): the live catalog shows all three functions are
-- SECURITY INVOKER (pg_proc.prosecdef = false), NOT SECURITY DEFINER as the SD
-- title states — so the practical risk is even lower (the function runs with the
-- caller's privileges, not the owner's). The linter still flags the mutable path;
-- pinning it resolves the warning and removes the ambiguity either way.
--
-- WHAT: pin each function's search_path to `public` (the established repo
-- convention — see database/migrations/20251211_fix_check_sd_can_complete_security.sql
-- and the 20251011_fix_progress_trigger_rls* migrations). pg_catalog is always
-- searched first implicitly, so built-ins still resolve; bare public-object refs
-- in the bodies keep working. ALTER FUNCTION ... SET is idempotent (re-run = no-op).
-- Rollback is the commented DOWN block.
-- ============================================================================

ALTER FUNCTION public.reset_cancelled_sd_patterns(text, text)  SET search_path = public;
ALTER FUNCTION public.trg_fn_reset_patterns_on_sd_cancel()     SET search_path = public;
ALTER FUNCTION public.leo_auto_exec_audit_append_only()        SET search_path = public;

-- ============================================================================
-- DOWN / ROLLBACK  (apply manually to reverse this migration)
-- ----------------------------------------------------------------------------
-- BEGIN;
--   ALTER FUNCTION public.reset_cancelled_sd_patterns(text, text)  RESET search_path;
--   ALTER FUNCTION public.trg_fn_reset_patterns_on_sd_cancel()     RESET search_path;
--   ALTER FUNCTION public.leo_auto_exec_audit_append_only()        RESET search_path;
--   -- NOTE: this re-introduces the function_search_path_mutable linter WARN.
-- COMMIT;
-- ============================================================================
