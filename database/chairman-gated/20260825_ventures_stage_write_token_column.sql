-- SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 — STEP 1 of 4: the stamp column, ALONE.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq), table public.ventures
--
-- @approved-by: PENDING
-- @approval-record: PENDING — chairman ratification not yet scheduled. DO NOT APPLY.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS IS A SEPARATE FILE — mirrors SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001's own
-- 3-step split (database/chairman-gated/README.md, "Applying SD-LEO-INFRA-STRATEGIC-DIRECTIVES-
-- CANONICAL-001"), which measured (not assumed) that PostgREST validates an UPDATE payload against
-- its schema cache BEFORE matching any row — a payload naming stage_write_token while the column is
-- absent returns PGRST204 on every wired call site's first real call. Splitting the column out lets
-- writer self-stamping code (STEP 2) merge independently of the much larger guard-trigger review
-- (STEP 3).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- REQUIRED DEPLOY ORDER — all four steps, in this order (LEAD-phase VALIDATION finding
-- e8ca10e8-7b5d-41b4-b000-b7cb9a1c6d90: R5's own equivalent choke on strategic_directives_v2 was
-- staged-but-never-wired despite its SD showing status=completed. This SD must not repeat that.)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--   1. APPLY THIS FILE. Confirm the column exists (verification query below).
--   2. APPLY 20260825_ventures_stage_rpcs_self_stamp.sql (advance_venture_stage,
--      advance_venture_to_stage, rescan_stage_20 self-stamp; also closes the promotion-gate array
--      gap via the SSOT read, folding in 20260722_stage_advancement_advance_venture_stage_gate_type_
--      ssot.sql's fix). THEN merge/deploy the JS writer self-stamping code (stage-execution-worker.js,
--      venture-ceo/handlers.js, saga-coordinator.js, eva-run.js, run-canary-probe.mjs) and the ehg
--      repo's promote.ts routing change. Verify EVERY writer is observed stamping live before
--      proceeding — this file's guard is not yet armed, so an unstamped write still succeeds; a
--      stale/omitted writer is silently invisible until step 3 arms the guard.
--   3. ONLY after every registry entry below shows stamp_wired=true verified live: apply
--      20260825_ventures_canonical_writer_choke.sql (registry + aaa_/zzz_ guard triggers). That
--      file's own $precondition$ block refuses to apply before this one has landed.
--   4. Apply 20260825_ventures_canonical_writer_policy_revoke.sql (REVOKE EXECUTE FROM PUBLIC/anon).
--
-- Applying step 3 before every writer in step 2 is verified stamping breaks that writer instantly —
-- this is the exact sequencing error R5's own incomplete rollout risked, called out explicitly so it
-- is not repeated here.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APPLY-TIME REQUIREMENT — lock_timeout. NOT OPTIONAL.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ADD COLUMN of a NULLABLE column with NO DEFAULT is catalog-only in PostgreSQL 11+ (no table
-- rewrite, no backfill) but still takes an ACCESS EXCLUSIVE lock on ventures, blocking READS too.
-- service_role/postgres (the roles migrations connect as) have no lock_timeout configured, so an
-- unbounded wait would queue indefinitely behind live fleet traffic rather than failing fast.
--
-- The applying session MUST run, in the same session, before the statement below:
--
--     SET lock_timeout = '3s';
--
-- SQLSTATE 55P03 on apply means the guard worked — retry in a quiet window; do not remove the timeout.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- NO DOWN-MIGRATION, DELIBERATELY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Dropping this column once step 2 has shipped breaks every stamping writer instantly (PGRST204).
-- The choke migration's own MODE 1 rollback deliberately retains this column for the same reason.
--
-- VERIFICATION QUERY (run before step 2, and again before step 3):
--   SELECT column_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='ventures'
--      AND column_name='stage_write_token';
--
-- APPLY (chairman ceremony; two separate invocations):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260825_ventures_stage_write_token_column.sql" \
--     --prod-deploy --allow-any-path
--
-- NOTE: no BEGIN;/COMMIT; here — scripts/apply-migration.js wraps the file in its own transaction.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS stage_write_token TEXT;

COMMENT ON COLUMN public.ventures.stage_write_token IS
  'SD-LEO-INFRA-STAGE-WRITER-CHOKE-001. TRANSIENT per-statement validation token, NOT a writer-'
  'identity history. Set in the SAME UPDATE as a current_lifecycle_stage change; validated against '
  'ventures_canonical_writer_policy(); then set back to NULL by '
  'zzz_enforce_canonical_stage_write_final on EVERY update, so the column is structurally NULL AT '
  'REST. That NULL-at-rest property is load-bearing: without it, one legitimate stamped write would '
  'leave a valid value behind that the next UNSTAMPED write to the same row would inherit.';

DO $verify_column$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ventures'
       AND column_name = 'stage_write_token'
       AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'ventures.stage_write_token is missing, NOT NULL, or carries a DEFAULT — refusing to deploy';
  END IF;
END
$verify_column$;
