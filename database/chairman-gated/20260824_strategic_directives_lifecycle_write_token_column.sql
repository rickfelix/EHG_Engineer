-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — STEP 1 of 2: the stamp column, ALONE.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: Chairman, verbal at terminal 2026-08-24T12:43Z — "A on all" (11-item ceremony sitting presented by Adam 0549d739; scribe branch ceremony/20260824-sitting)
--   approval on record. See database/chairman-gated/README.md.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS IS A SEPARATE FILE FROM THE GUARD — MEASURED, NOT STYLISTIC
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The guard ceremony (20260824_strategic_directives_canonical_writer_choke.sql) is a permission and
-- enforcement change over a 54-trigger core table: it needs a full chairman review, and it must not
-- apply until all 13 remaining registered writers have been stamp-wired. That review could take a
-- while.
--
-- Meanwhile the CODE branch that stamps the handoff pipeline cannot merge until this column exists.
-- Measured live 2026-08-24, zero-write probe (predicate matched no row), service_role via PostgREST:
--
--   .update({ lifecycle_write_token: 'handoff.js', status: 'draft' }).eq('id', '<no such row>')
--     -> { data: null, error: { code: 'PGRST204',
--          message: "Could not find the 'lifecycle_write_token' column of
--                    'strategic_directives_v2' in the schema cache" } }
--
--   ...while the identical call with only pre-existing columns returns { data: [], error: null }.
--
-- PostgREST validates the PAYLOAD against its schema cache BEFORE it matches any row, so every one
-- of the 12 wired call sites hard-fails on its first real invocation if the column is absent — every
-- handoff transition, not a subset. And PGRST204 is not SDCW1, so isCanonicalWriteRejection()
-- returns FALSE for it and the two compensation paths fall back to their old log-and-swallow
-- behaviour — reaching the exact silent-rollback outcome FR-4's F8 amendment exists to prevent,
-- through a different door.
--
-- Splitting the column out is what decouples "this branch is safe to merge" from "the full guard
-- ceremony has been approved and applied". This file is additive, catalog-only, and independently
-- reviewable in about a minute.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- REQUIRED DEPLOY ORDER — all three steps, in this order
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--   1. APPLY THIS FILE, and confirm the column is present (the verification query below).
--   2. THEN merge/deploy the code branch that stamps scripts/modules/handoff/**. Safe at this point:
--      the column is an ordinary nullable column, nothing validates it, and writers that set it
--      simply write a value nobody reads.
--   3. THEN — after the 13 remaining registered writers are wired — run the guard ceremony
--      (20260824_strategic_directives_canonical_writer_choke.sql). That file REFUSES to apply if
--      this one has not, so step 3 cannot silently precede step 1.
--
-- Reversing 2 and 3 breaks the fleet in the other direction: a live guard with unstamped writers
-- rejects every lifecycle transition.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APPLY-TIME REQUIREMENT — lock_timeout (TR-2). NOT OPTIONAL, AND NOT INHERITED.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This requirement is restated here in full rather than deferred to the guard migration's header.
-- Splitting the ADD COLUMN out of that file also split it away from that file's lock warning, and a
-- one-statement migration is exactly the kind that gets applied casually.
--
-- ADD COLUMN of a NULLABLE column with NO DEFAULT is catalog-only in PostgreSQL 11+ — no table
-- rewrite, no backfill, O(1) regardless of row count. That makes it FAST, not LOCK-FREE: it still
-- takes an ACCESS EXCLUSIVE lock on strategic_directives_v2, which blocks READS as well as writes.
-- Measured: service_role and postgres (the roles migrations connect as) have NO lock_timeout
-- configured, so the lock QUEUES INDEFINITELY behind existing traffic (seq_scan=377,874 measured on
-- this table) rather than failing fast — hanging every worker session for as long as it waits.
--
-- The applying session MUST therefore run, in the same session, before the statement below:
--
--     SET lock_timeout = '3s';
--
-- SQLSTATE 55P03 (lock_not_available) on apply means the guard WORKED. Retry in a quiet window;
-- do not remove the timeout to force it through.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- NO DOWN-MIGRATION, DELIBERATELY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Dropping this column is NOT a safe backout once step 2 has shipped: every stamped writer would
-- immediately start failing with PGRST204, which is the very failure this split exists to prevent.
-- The guard ceremony's own MODE 1 rollback deliberately RETAINS this column for the same reason.
-- If the column must ever truly be removed, that is a separate decision requiring the code branch to
-- be reverted FIRST, and the statement is simply:
--     ALTER TABLE public.strategic_directives_v2 DROP COLUMN lifecycle_write_token;
--
-- VERIFICATION QUERY (run before step 2, and again before step 3):
--   SELECT column_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='strategic_directives_v2'
--      AND column_name='lifecycle_write_token';
--
-- APPLY (chairman ceremony; two separate invocations):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260824_strategic_directives_lifecycle_write_token_column.sql" \
--     --prod-deploy --allow-any-path
--
-- NOTE: no BEGIN;/COMMIT; here — scripts/apply-migration.js wraps the file in its own transaction.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.strategic_directives_v2
  ADD COLUMN IF NOT EXISTS lifecycle_write_token TEXT;

COMMENT ON COLUMN public.strategic_directives_v2.lifecycle_write_token IS
  'SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001. TRANSIENT per-statement validation token, NOT a '
  'writer-identity history. Set in the SAME UPDATE as a status/current_phase/completion_date change; '
  'validated against sd_canonical_writer_policy(); then set back to NULL by '
  'zzz_enforce_canonical_lifecycle_write_final on EVERY update, so the column is structurally NULL AT '
  'REST. That NULL-at-rest property is load-bearing: without it, one legitimate stamped write would '
  'leave a valid value behind that every subsequent UNSTAMPED write to the same row would inherit, '
  'degrading the guard to no-guard on exactly the hot rows canonical writers touch most. '
  'CONSEQUENCE: this column carries ZERO at-rest audit value. For writer-identity audit use the '
  'existing log_sd_mutation_audit() / trg_sd_governance_metadata_audit path instead.';

DO $verify_column$
DECLARE
  v_non_null bigint;
BEGIN
  -- SCHEMA property, asserted hard. NULLABLE with no DEFAULT is what makes a backfill structurally
  -- impossible: a DEFAULT would put a value on every row, and the guard treats any registry-valid
  -- value already present as a legitimate stamp — so a defaulted column would ship the F1b
  -- stale-stamp-reuse bug pre-armed on every row in the table.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'strategic_directives_v2'
       AND column_name = 'lifecycle_write_token'
       AND is_nullable = 'YES' AND column_default IS NULL
  ) THEN
    RAISE EXCEPTION 'lifecycle_write_token is missing, NOT NULL, or carries a DEFAULT — refusing to deploy';
  END IF;

  -- DATA state is only reported here, never enforced — deliberately. On a genuine first apply this
  -- is necessarily zero (the column is brand new and has no DEFAULT). It can be non-zero only when
  -- this file is RE-RUN during a MODE 1 rollback window, where the guard is down and stamps
  -- legitimately accumulate at rest. Clearing them is the GUARD migration's job ($reset_at_rest$,
  -- which runs before it arms aaa_ and hard-fails if any survive) — not this file's. Raising here
  -- instead would block the re-run of an additive, catalog-only migration over a condition it
  -- neither caused nor is responsible for fixing.
  SELECT count(*) INTO v_non_null
    FROM public.strategic_directives_v2 WHERE lifecycle_write_token IS NOT NULL;
  IF v_non_null > 0 THEN
    RAISE NOTICE 'lifecycle_write_token is non-NULL on % row(s). Expected ONLY when re-running during a rollback window; the guard migration''s $reset_at_rest$ block clears these before arming.', v_non_null;
  END IF;
END
$verify_column$;
