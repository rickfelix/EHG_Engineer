-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1) -- CROSS-TENANT RLS FIX for
-- public.creative_asset_variant_scores. Replaces the vulnerable `cavs_venture_access` policy
-- and adds the SECURITY DEFINER resolver the corrected predicate depends on.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: PENDING
--
-- ═══════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- CEREMONY (two separate invocations; --issue-token is a MODE SWITCH, not a combinable flag).
-- Replace the PENDING header above with the applying chairman's `git config user.email`
-- FIRST, and commit the file -- guard 2 (git_committed) rejects uncommitted changes and
-- guard 3 (approver) rejects a header that does not match the invoker:
--
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql" \
--     --prod-deploy --allow-any-path
--
-- ── WHAT WAS WRONG (proven live, rolled-back transaction, this database) ───────────────
-- The deployed `cavs_venture_access` policy constrained ONLY creative_asset_id:
--
--     USING (creative_asset_id IN (SELECT ca.id FROM creative_assets ca
--            WHERE ca.venture_id IN (SELECT v.id FROM ventures v
--            WHERE v.company_id IN (SELECT company_id FROM user_company_access
--                                   WHERE user_id = auth.uid()))))
--
-- variant_id was entirely unconstrained, and with_check was NULL so Postgres reused that same
-- incomplete expression for INSERT/UPDATE. Measured result: a tenant holding
-- user_company_access to venture A successfully INSERTed (own_asset_id, venture_B_variant_id)
-- as the `authenticated` role. FK integrity checks run as table owner and bypass RLS, so the
-- foreign key to another tenant's variant did not stop it. Because both FKs on this table are
-- NO ACTION by deliberate FR-9 design (never CASCADE), the planted row then permanently
-- blocked venture B from deleting its own marketing_content_variants row (SQLSTATE 23503),
-- and blocked the venture-teardown chain ventures -> marketing_content ->
-- marketing_content_variants -> this table. Venture B could neither see nor remove the
-- blocking row, because RLS correctly hid it from them. A denial-of-service planted across a
-- tenant boundary, by a caller acting entirely within its own visible surface.
--
-- ── WHY THE OBVIOUS FIX IS WRONG (measured, and it fails in the opposite direction) ────
-- The natural correction is an inline EXISTS proving the variant's venture equals the asset's
-- venture. That predicate DOES block the attack -- and it also blocks every legitimate
-- same-venture write, because Postgres evaluates a policy expression as the querying role, so
-- every table the expression reads has its own RLS applied. marketing_content_variants and
-- marketing_content are RLS-enabled and scope `authenticated` through ventures.created_by,
-- a DIFFERENT ownership model from the user_company_access model this table uses. Measured
-- with a fixture user holding user_company_access to venture A's company:
--
--     inline-EXISTS variant: cross-tenant INSERT 42501 (blocked, good)
--                            same-venture  INSERT 42501 (BLOCKED -- false negative)
--                            marketing_content_variants rows visible: 0 of 2
--
-- That is a silently dead table, not a secured one. Resolving the variant's venture must
-- therefore bypass those two tables' RLS, which requires SECURITY DEFINER -- and SECURITY
-- DEFINER is exactly what makes this file TIER-2 and keeps it out of database/migrations/.
--
-- ── ROLLBACK ──────────────────────────────────────────────────────────────────────────
-- Paired 20260826_creative_asset_variant_scores_rls_fix_DOWN.sql. NOTE: that DOWN restores
-- the FAIL-CLOSED state (resolver and policy removed, RLS still enabled, no `authenticated`
-- policy), NOT the vulnerable predicate. There is deliberately no path back to the hole.

-- ── PRECONDITION ──────────────────────────────────────────────────────────────────────
DO $precondition$
BEGIN
  IF to_regclass('public.creative_asset_variant_scores') IS NULL THEN
    RAISE EXCEPTION 'precondition failed: public.creative_asset_variant_scores does not exist. Apply database/migrations/20260826_creative_asset_variant_scores.sql first.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.creative_asset_variant_scores'::regclass) THEN
    RAISE EXCEPTION 'precondition failed: row level security is not enabled on creative_asset_variant_scores.';
  END IF;
END
$precondition$;

-- ── RESOLVER ──────────────────────────────────────────────────────────────────────────
-- Boolean, not venture-id-returning, to minimise disclosure: a caller learns only whether a
-- (variant, venture) pair matches, and must already hold both uuids to ask. search_path is
-- pinned (a SECURITY DEFINER function without it is hijackable via a mutable search_path).
-- STABLE, single-statement SQL, no dynamic SQL, no writes.
CREATE OR REPLACE FUNCTION public.cavs_variant_matches_venture(p_variant_id uuid, p_venture_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM marketing_content_variants mcv
    JOIN marketing_content mc ON mc.id = mcv.content_id
    WHERE mcv.id = p_variant_id
      AND mc.venture_id = p_venture_id
  )
$fn$;

-- Postgres grants EXECUTE to PUBLIC on function creation, and this project additionally has an
-- ALTER DEFAULT PRIVILEGES entry in the public schema granting anon/authenticated EXECUTE on
-- new functions EXPLICITLY -- a separate, additive ACL entry that a FROM PUBLIC revoke cannot
-- touch (see this directory's README, SEC-M2, and the 20260825 canonical-writer choke files).
-- Both are therefore revoked by name before the intended grant is issued.
REVOKE ALL ON FUNCTION public.cavs_variant_matches_venture(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cavs_variant_matches_venture(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cavs_variant_matches_venture(uuid, uuid) TO authenticated, service_role;

-- ── POLICY ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cavs_venture_access ON public.creative_asset_variant_scores;

-- WITH CHECK is stated EXPLICITLY and identically to USING. Omitting it is what let the
-- original hole reach INSERT: Postgres silently reuses USING for the write path, so an
-- incomplete read predicate becomes an incomplete write predicate with no second signal.
CREATE POLICY cavs_venture_access ON public.creative_asset_variant_scores
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM creative_assets ca
      WHERE ca.id = creative_asset_variant_scores.creative_asset_id
        AND ca.venture_id IN (
          SELECT v.id FROM ventures v
          WHERE v.company_id IN (
            SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
          )
        )
        AND public.cavs_variant_matches_venture(creative_asset_variant_scores.variant_id, ca.venture_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM creative_assets ca
      WHERE ca.id = creative_asset_variant_scores.creative_asset_id
        AND ca.venture_id IN (
          SELECT v.id FROM ventures v
          WHERE v.company_id IN (
            SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
          )
        )
        AND public.cavs_variant_matches_venture(creative_asset_variant_scores.variant_id, ca.venture_id)
    )
  );

-- ── POST-CONDITION ────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_qual       text;
  v_with_check text;
  v_secdef     boolean;
  v_cfg        text[];
BEGIN
  SELECT qual, with_check INTO v_qual, v_with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'creative_asset_variant_scores'
    AND policyname = 'cavs_venture_access';

  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'verify failed: cavs_venture_access is missing or has a NULL qual.';
  END IF;
  IF v_with_check IS NULL THEN
    RAISE EXCEPTION 'verify failed: cavs_venture_access has a NULL with_check -- the write path would silently reuse USING.';
  END IF;
  IF v_qual NOT LIKE '%cavs_variant_matches_venture%' THEN
    RAISE EXCEPTION 'verify failed: USING does not constrain variant_id via the venture resolver.';
  END IF;
  IF v_with_check NOT LIKE '%cavs_variant_matches_venture%' THEN
    RAISE EXCEPTION 'verify failed: WITH CHECK does not constrain variant_id via the venture resolver.';
  END IF;
  IF v_qual NOT LIKE '%user_company_access%' THEN
    RAISE EXCEPTION 'verify failed: USING no longer traverses user_company_access.';
  END IF;

  SELECT p.prosecdef, p.proconfig INTO v_secdef, v_cfg
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'cavs_variant_matches_venture';

  IF v_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'verify failed: cavs_variant_matches_venture is not SECURITY DEFINER -- the predicate would be RLS-filtered and deny all legitimate access.';
  END IF;
  IF v_cfg IS NULL OR NOT (v_cfg::text LIKE '%search_path%') THEN
    RAISE EXCEPTION 'verify failed: cavs_variant_matches_venture has no pinned search_path.';
  END IF;
  IF has_function_privilege('anon', 'public.cavs_variant_matches_venture(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'verify failed: anon still holds EXECUTE on the resolver.';
  END IF;

  RAISE NOTICE 'cavs_venture_access verified: USING + WITH CHECK both constrain variant_id via SECURITY DEFINER resolver; anon has no EXECUTE.';
END
$verify$;
