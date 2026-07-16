-- Rewrite fn_is_chairman() to authorize off raw_app_meta_data (not user-writable).
-- SD-LEO-INFRA-FN-IS-CHAIRMAN-APP-METADATA-001 (FR-2). SECURITY-CRITICAL privilege-escalation fix.
--
-- WHY: the live fn_is_chairman() reads auth.users.raw_user_meta_data->>'role' / ->'roles' — the
-- Supabase USER-WRITABLE user_metadata surface — so any authenticated user can self-elevate to
-- chairman and defeat all 21 fn_is_chairman-gated RLS policies across 16 tables. This CREATE OR
-- REPLACE changes ONLY the metadata source column (raw_user_meta_data -> raw_app_meta_data);
-- the role/roles predicate, the zero-arg signature, SECURITY DEFINER, and search_path are IDENTICAL
-- to the prior definition, so the 21 dependent policies bind unchanged with no policy edits.
--
-- APPLY ORDER: MUST be applied AFTER 20260716_a_backfill_chairman_app_metadata.sql. Applying this
-- before the backfill would return FALSE for both real chairman accounts (app_meta_chairman=0 at
-- filing) and lock everyone out of all 21 policies.
--
-- ROLLBACK (chairman-gated): CREATE OR REPLACE the prior body reading raw_user_meta_data.
--
-- STAGED, NOT YET APPROVED FOR APPLY. APPLY IS CHAIRMAN-ONLY / NON-DELEGATABLE (access-control
-- change). Intentionally omits the @approved-by tag until the chairman explicitly applies it.
--
-- requires-chairman-apply

CREATE OR REPLACE FUNCTION public.fn_is_chairman()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  BEGIN
    RETURN (SELECT EXISTS(
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
      AND (
        u.raw_app_meta_data->>'role' IN ('chairman', 'admin', 'owner')
        OR u.raw_app_meta_data->'roles' @> '"chairman"'::jsonb
      )
    ));
  END;
  $function$;

COMMENT ON FUNCTION public.fn_is_chairman() IS
  'Authorizes the chairman/admin/owner role off auth.users.raw_app_meta_data (service-role-only, NOT user-writable). SD-LEO-INFRA-FN-IS-CHAIRMAN-APP-METADATA-001: moved off raw_user_meta_data to close an authenticated-user privilege-escalation. Read source is the ONLY change vs the prior definition.';
