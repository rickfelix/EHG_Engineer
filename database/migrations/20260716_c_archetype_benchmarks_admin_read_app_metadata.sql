-- Rewrite the archetype_benchmarks_admin RLS policy to authorize off raw_app_meta_data.
-- SD-LEO-INFRA-FN-IS-CHAIRMAN-APP-METADATA-001 (FR-4 fold-in). SECURITY-CRITICAL.
--
-- WHY: the FR-4 authorization audit (docs/audits/fn-is-chairman-authz-audit.md) found a SECOND
-- instance of the exact same privilege-escalation class OUTSIDE fn_is_chairman: the RLS policy
-- public.archetype_benchmarks.archetype_benchmarks_admin authorizes admin/chairman DIRECTLY off
-- auth.users.raw_user_meta_data->>'role' (user-writable). Any authenticated user could self-set
-- user_metadata.role='admin' and gain FOR ALL access to archetype_benchmarks. FR-4 authorizes
-- folding in-scope siblings; this shares the same raw_app_meta_data backfill enabler (migration _a_),
-- so the class is closed completely rather than partially.
--
-- The rewrite preserves the policy exactly (FOR ALL, TO public, same admin/chairman role set) and
-- changes ONLY the metadata source column (raw_user_meta_data -> raw_app_meta_data). Original policy
-- had no WITH CHECK; recreated the same way (USING applies to add/modify for FOR ALL policies).
--
-- APPLY ORDER: MUST be applied AFTER 20260716_a_backfill_chairman_app_metadata.sql (same lockout
-- hazard as fn_is_chairman). Independent of migration _b_.
--
-- ROLLBACK (chairman-gated): recreate the policy with the raw_user_meta_data USING expression.
--
-- STAGED, NOT YET APPROVED FOR APPLY. APPLY IS CHAIRMAN-ONLY / NON-DELEGATABLE (access-control
-- change). Intentionally omits the @approved-by tag until the chairman explicitly applies it.
--
-- requires-chairman-apply

DROP POLICY IF EXISTS archetype_benchmarks_admin ON public.archetype_benchmarks;

CREATE POLICY archetype_benchmarks_admin ON public.archetype_benchmarks
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM auth.users
      WHERE auth.uid() = users.id
        AND (users.raw_app_meta_data->>'role') = ANY (ARRAY['admin'::text, 'chairman'::text])
    )
  );
