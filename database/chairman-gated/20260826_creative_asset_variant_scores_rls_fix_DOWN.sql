-- DOWN migration for 20260826_creative_asset_variant_scores_rls_fix.sql
-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1)
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: PENDING
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- THIS DOWN RESTORES THE FAIL-CLOSED STATE, NOT THE VULNERABLE PREDICATE.
--
-- After this runs, creative_asset_variant_scores still has RLS enabled and still has its
-- service_role policy, but no `authenticated` policy at all -- so `authenticated` is denied
-- every row (Postgres denies any role matching no permissive policy). That is the same state
-- database/migrations/20260826_creative_asset_variant_scores.sql leaves the table in.
--
-- There is deliberately NO statement here that recreates the creative_asset_id-only
-- `cavs_venture_access` policy. That predicate was a proven cross-tenant write hole (see the
-- UP file's header); a rollback path that reinstates it would be a rollback into the
-- vulnerability. If the corrected policy must be reverted, the table goes dark for
-- `authenticated` and stays dark until a corrected predicate is applied.
--
-- Ceremony is identical to the UP file (two invocations, --allow-any-path, @approved-by
-- replaced and committed first).

DROP POLICY IF EXISTS cavs_venture_access ON public.creative_asset_variant_scores;

-- Dropped AFTER the policy: the policy expression depends on this function, so the reverse
-- order would fail with a dependency error.
DROP FUNCTION IF EXISTS public.cavs_variant_matches_venture(uuid, uuid);

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'creative_asset_variant_scores'
      AND policyname = 'cavs_venture_access'
  ) THEN
    RAISE EXCEPTION 'verify failed: cavs_venture_access still present after rollback.';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.creative_asset_variant_scores'::regclass) THEN
    RAISE EXCEPTION 'verify failed: rollback left row level security DISABLED -- the table would be open, not fail-closed.';
  END IF;

  RAISE NOTICE 'rolled back to fail-closed: RLS still enabled, no authenticated policy, resolver removed.';
END
$verify$;
