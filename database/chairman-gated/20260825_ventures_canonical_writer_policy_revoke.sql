-- SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 — STEP 4 of 4: REVOKE EXECUTE on
-- public.ventures_canonical_writer_policy(text) for PUBLIC (and therefore anon/authenticated, which
-- inherit from PUBLIC and were never separately GRANTed by the choke file).
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: PENDING
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 20260825_ventures_canonical_writer_choke.sql GRANTs EXECUTE to service_role only (unlike R5's
-- sd_canonical_writer_policy, this table has no legitimate authenticated direct-write path to
-- current_lifecycle_stage, so there is no authenticated-breakage risk to reason about here). Postgres
-- extends a default EXECUTE grant to PUBLIC on function creation; this file closes that.
--
-- CEREMONY ORDERING: MUST apply strictly AFTER the choke file — the function does not exist until
-- then. The $precondition$ block below enforces this rather than relying on operator discipline.
--
-- DOWN-CYCLE COUPLING: a DOWN-then-re-apply cycle of the choke file (its own DOWN drops
-- ventures_canonical_writer_policy entirely) silently reverts this REVOKE too — a fresh CREATE
-- restores the default PUBLIC grant. Any ceremony that runs the choke file's DOWN migration must
-- re-apply this file afterward.
--
-- APPLY (chairman ceremony):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260825_ventures_canonical_writer_policy_revoke.sql" \
--     --prod-deploy --allow-any-path
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'ventures_canonical_writer_policy'
  ) THEN
    RAISE EXCEPTION 'ventures_canonical_writer_policy REVOKE addendum: the function does not exist yet — apply database/chairman-gated/20260825_ventures_canonical_writer_choke.sql FIRST. Refusing to proceed out of order.';
  END IF;
END
$precondition$;

REVOKE EXECUTE ON FUNCTION public.ventures_canonical_writer_policy(text) FROM PUBLIC;

DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'ventures_canonical_writer_policy'
       AND grantee = 'PUBLIC' AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ventures_canonical_writer_policy REVOKE addendum: PUBLIC still holds EXECUTE — refusing to consider this applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'ventures_canonical_writer_policy'
       AND grantee = 'service_role' AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ventures_canonical_writer_policy REVOKE addendum: service_role LOST EXECUTE — refusing to consider this applied';
  END IF;
END
$verify$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--   GRANT EXECUTE ON FUNCTION public.ventures_canonical_writer_policy(text) TO PUBLIC;
