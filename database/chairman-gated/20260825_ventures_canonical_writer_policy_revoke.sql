-- SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 — STEP 4 of 4: REVOKE EXECUTE on
-- public.ventures_canonical_writer_policy(text) for PUBLIC, anon, AND authenticated explicitly.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: codestreetlabs@gmail.com
--   (Chairman verbal, in-terminal stage sitting 2026-08-25: 'approve all four, applied in order
--    with a readback after each.' Scribed by Adam per CLAUDE_ADAM.md §3c.)
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 20260825_ventures_canonical_writer_choke.sql GRANTs EXECUTE to service_role only. Postgres extends
-- a default EXECUTE grant to PUBLIC on function creation; that alone is what this file used to
-- target. SECURITY REVIEW CORRECTION (adversarial SECURITY review S-H2, live-measured): this project
-- has an ALTER DEFAULT PRIVILEGES entry in the public schema that grants anon/authenticated EXECUTE
-- on new functions EXPLICITLY -- a separate, additive grant that "REVOKE ... FROM PUBLIC" cannot
-- touch, since PUBLIC-revocation and role-specific grants are independent ACL entries. The original
-- version of this file revoked only FROM PUBLIC and its own $verify$ block only checked
-- grantee='PUBLIC', so it would have reported success while anon/authenticated both still held
-- EXECUTE (measured: has_function_privilege('anon', ..., 'EXECUTE') = true after a from-PUBIC-only
-- revoke). This mirrors an already-documented defect class for a sibling SD (see this directory's
-- README, "SEC-M2").
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

-- Explicit per-role revokes, not just PUBLIC: this project's schema-level ALTER DEFAULT PRIVILEGES
-- grants anon/authenticated EXECUTE on new functions independently of PUBLIC (S-H2). A role that was
-- never explicitly granted here is unaffected by "REVOKE ... FROM anon" (harmless no-op), so this is
-- safe to run even where the additive default-privilege grant turns out not to apply.
REVOKE EXECUTE ON FUNCTION public.ventures_canonical_writer_policy(text) FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_remaining_grantees TEXT;
BEGIN
  -- Check the FULL grantee list, not just PUBLIC -- a from-PUBLIC-only revoke can leave anon/
  -- authenticated holding EXECUTE via an independent default-privilege grant while this exact check,
  -- scoped only to grantee='PUBLIC', would report success (S-H2's own false-green failure mode).
  SELECT string_agg(grantee, ', ') INTO v_remaining_grantees
    FROM information_schema.routine_privileges
   WHERE routine_schema = 'public' AND routine_name = 'ventures_canonical_writer_policy'
     AND privilege_type = 'EXECUTE'
     AND grantee IN ('PUBLIC', 'anon', 'authenticated');

  IF v_remaining_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'ventures_canonical_writer_policy REVOKE addendum: % still hold(s) EXECUTE — refusing to consider this applied', v_remaining_grantees;
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
--   GRANT EXECUTE ON FUNCTION public.ventures_canonical_writer_policy(text) TO PUBLIC, anon, authenticated;
