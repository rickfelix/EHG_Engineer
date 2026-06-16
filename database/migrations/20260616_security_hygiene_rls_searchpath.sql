-- ============================================================================
-- SD-LEO-INFRA-SECURITY-HYGIENE-RLS-SEARCHPATH-001 — FR-3
-- Security hygiene: enable RLS on scope_completion_chain + pin
-- fn_advance_venture_stage search_path.
-- ============================================================================
--
-- ⚠️ TIER-2 / CHAIRMAN-GATED — SHIPS DORMANT ⚠️
-- This migration contains ALTER (RLS-enable, ALTER FUNCTION) statements, which
-- are TIER-2 under the migration-tier classifier and therefore do NOT auto-apply
-- post-merge. It requires the chairman's 3-factor attestation to apply:
--   1. the migration-apply feature flag,
--   2. --issue-token <token>, and
--   3. the @approved-by line below filled in with the chairman's email.
--
-- The authoring worker MUST NOT self-author the attestation (CONST-002). The
-- line below is intentionally left WITHOUT a value so apply-migration.js blocks
-- until the chairman fills it in and runs the gated apply:
--   node scripts/apply-migration.js database/migrations/20260616_security_hygiene_rls_searchpath.sql \
--     --issue-token <token> --prod-deploy
--
-- @approved-by:
-- ============================================================================
--
-- WHY THESE TWO GAPS:
--   (1) scope_completion_chain (created additively in 20260516130000, no RLS)
--       is a public table with RLS disabled and 0 policies — flagged by the
--       Supabase database linter rule `rls_disabled_in_public` and by the
--       weekly security-linter sentinel. It is written/read by service-role
--       callers (runtime-probe-coverage-gate.js) and aggregated by the
--       owner-privileged writer_consumer_asymmetry_witnesses VIEW; both bypass
--       RLS, so enabling RLS with a permissive read policy is behavior-neutral.
--   (2) fn_advance_venture_stage is SECURITY DEFINER with a mutable search_path
--       (proconfig = null) — flagged by `function_search_path_mutable`, a real
--       privilege-escalation surface (CVE-2018-1058 class). Its body references
--       only unqualified public objects + built-ins, so pinning
--       search_path = pg_catalog, public preserves behavior exactly.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) scope_completion_chain — enable RLS + permissive read policy
--     Mirrors the *_read_all convention used by sibling instrumentation tables
--     bypass_ledger / goal_evaluator_verdicts:  FOR SELECT TO public USING (true).
--     Writes continue to flow through service-role (which bypasses RLS), so no
--     write policy is added — least privilege for any future anon/auth reader.
-- ----------------------------------------------------------------------------
ALTER TABLE scope_completion_chain ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'scope_completion_chain'::regclass
      AND polname = 'scope_completion_chain_read_all'
  ) THEN
    CREATE POLICY scope_completion_chain_read_all
      ON scope_completion_chain
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- (2) fn_advance_venture_stage — pin search_path (behavior-preserving)
--     Signature is fixed: (uuid, integer, integer, jsonb, uuid). The body uses
--     only unqualified public tables/functions + pg_catalog built-ins, so
--     pg_catalog, public is the exact resolution order it already relies on.
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid)
  SET search_path = pg_catalog, public;

-- ----------------------------------------------------------------------------
-- Self-verification — fails the migration loudly if either fix did not land.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_rls_enabled  boolean;
  v_policy_count integer;
  v_searchpath   text[];
BEGIN
  SELECT c.relrowsecurity,
         (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid)
    INTO v_rls_enabled, v_policy_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'scope_completion_chain';

  IF v_rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY FAILED: RLS not enabled on scope_completion_chain';
  END IF;
  IF v_policy_count < 1 THEN
    RAISE EXCEPTION 'VERIFY FAILED: no policy on scope_completion_chain';
  END IF;

  SELECT p.proconfig
    INTO v_searchpath
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_advance_venture_stage';

  IF v_searchpath IS NULL
     OR NOT EXISTS (SELECT 1 FROM unnest(v_searchpath) x WHERE x LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_advance_venture_stage search_path not pinned';
  END IF;

  RAISE NOTICE 'VERIFY OK: scope_completion_chain RLS + policy present; fn_advance_venture_stage search_path pinned';
END $verify$;
