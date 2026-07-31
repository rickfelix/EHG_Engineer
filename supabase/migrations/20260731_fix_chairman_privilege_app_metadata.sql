-- SD-LEO-FIX-CHAIRMAN-PRIVILEGE-FROM-WRITABLE-METADATA-001
-- @approved-by: codestreetlabs@gmail.com
-- Move chairman/admin privilege derivation off the CLIENT-WRITABLE metadata half.
--
-- THE DEFECT
--   auth.users has two metadata halves. raw_user_meta_data is writable by the
--   account holder -- Supabase's auth.updateUser({ data: {...} }) writes exactly
--   that column. raw_app_meta_data is writable only by the service role.
--   public.fn_is_chairman() derived chairman from the CLIENT-WRITABLE half, so any
--   authenticated principal could grant itself chairman with a single self-directed
--   call. Proven live before this migration: an unprivileged principal wrote its own
--   user_metadata and fn_is_chairman() returned TRUE
--   (scripts/one-off/prove-chairman-escalation.cjs, RED).
--
-- WHY THIS IS THE HIGH-BLAST-RADIUS SITE, NOT THE MIDDLEWARE
--   fn_is_chairman() is consumed by 29 RLS POLICIES and 22 FUNCTIONS, including the
--   destructive kill_venture, delete_venture and master_reset_portfolio, and the
--   governance-bearing approve_chairman_decision, reject_chairman_decision,
--   set_global_auto_proceed and is_leo_admin. The Express middleware named in the
--   originating report has zero production mounts; this function is the live surface.
--
-- SAFETY, MEASURED RATHER THAN ASSUMED (before authoring this migration)
--   auth.users holds 4 accounts. Exactly one live privileged account exists and it
--   ALREADY carries raw_app_meta_data->>'role' = 'admin', so it survives the flip.
--   The only account that loses privilege holds its role solely in the client-writable
--   half and is already slated for deletion. Losing its privilege is the INTENT here.
--
-- SIGNATURE-PRESERVING ON PURPOSE
--   CREATE OR REPLACE, never DROP + CREATE: 51 dependents bind to the zero-arg
--   signature and a DROP would break or cascade them. The zero-arg shape,
--   SECURITY DEFINER and the search_path pin are all part of that contract.
--
-- VOCABULARY IS DELIBERATELY UNCHANGED
--   The accepted role set ('chairman','admin','owner') and the 'roles' array clause
--   are preserved verbatim. The ONLY semantic change is which metadata half is
--   trusted. A privilege fix must not quietly widen access while it narrows it.

-- NO EXPLICIT BEGIN/COMMIT HERE, DELIBERATELY.
--   scripts/apply-migration.js already wraps the file in its own transaction
--   (BEGIN before the statements, COMMIT after, ROLLBACK on error). An inner
--   BEGIN would be a no-op WARNING, and an inner COMMIT would close the
--   harness's transaction EARLY -- leaving the harness's own rollback path with
--   nothing to roll back if a later statement failed. 18 of the 20 most recent
--   migrations in this directory correctly omit it; this one follows that.

-- ---------------------------------------------------------------------------
-- 1. fn_is_chairman(): same signature, same role vocabulary, trusted half only.
-- ---------------------------------------------------------------------------
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
        -- raw_app_meta_data: service-role-writable only. The account holder cannot
        -- reach this column, which is the entire point of the fix.
        u.raw_app_meta_data->>'role' IN ('chairman', 'admin', 'owner')
        OR u.raw_app_meta_data->'roles' @> '"chairman"'::jsonb
      )
    ));
  END;
  $function$;

-- ---------------------------------------------------------------------------
-- 2. Policy archetype_benchmarks_admin: the second, INLINE copy of the defect.
--
--    This policy did not call the helper -- it re-derived the same check inline,
--    which is precisely how a single fix to the canonical function would have left
--    a live hole behind. It is repointed at public.is_chairman_role(), which was
--    ALREADY present in this database reading raw_app_meta_data with the role set
--    ('admin','chairman') -- byte-identical to this policy's own vocabulary. So
--    centralising here costs ZERO widening: no role gains access that did not have
--    it, and the policy can no longer drift away from the canonical derivation.
--
--    ALTER POLICY (not DROP + CREATE) so the name, table, roles={public} and
--    cmd=ALL are all preserved. For an ALL policy with no WITH CHECK, Postgres
--    applies USING to both read and write paths, so this covers writes too.
-- ---------------------------------------------------------------------------
ALTER POLICY archetype_benchmarks_admin
  ON public.archetype_benchmarks
  USING (public.is_chairman_role());
