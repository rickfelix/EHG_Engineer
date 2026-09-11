-- QF-20260905-256: retention-enforce's count against eva_scheduler_metrics (4.5M rows) has no
-- index on the timestamp column it filters by, so even the estimated-count branch it already
-- runs (QF-20260823-655) plans a sequential scan and crosses the PostgREST statement timeout --
-- reproduced live, ~7-8.5s, returning an empty-message error the job used to treat as a hard
-- failure. This migration is the underlying fix; scripts/retention-enforce.js additionally
-- gained a bounded-probe fallback (this same QF) so the job no longer fails even before this
-- index lands -- this is a genuine performance fix, not a correctness dependency anymore.
--
-- TIER: plain, bare column-list CREATE INDEX CONCURRENTLY IF NOT EXISTS -- matches Rule B in
-- scripts/lib/migration-tier-classifier.mjs (no expression/INCLUDE/USING/WHERE clause), so this
-- is NOT chairman-gated; it belongs in database/migrations/, not database/chairman-gated/.
--
-- CONCURRENTLY is required on a 4.5M-row live table: a plain CREATE INDEX takes a
-- SHARE lock for the full scan+build duration, blocking every writer for the whole build.
-- CONCURRENTLY cannot run inside a transaction block, so this file has NO BEGIN/COMMIT wrapper
-- and no inline DO-block verification step (a bare DO statement is itself in FORBIDDEN_TOPLEVEL
-- and would force TIER-2) -- verification is the separate, idempotent SELECT below, run after apply.

CREATE INDEX CONCURRENTLY IF NOT EXISTS eva_scheduler_metrics_created_at_idx
  ON public.eva_scheduler_metrics (created_at);

-- ============================================================================
-- APPLY:
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/migrations/20260907_eva_scheduler_metrics_created_at_index.sql" \
--     --prod-deploy --no-tx --i-know
--
-- VERIFY (after apply):
--   SELECT indexname FROM pg_indexes
--     WHERE schemaname='public' AND tablename='eva_scheduler_metrics'
--       AND indexname='eva_scheduler_metrics_created_at_idx'; -- expect 1 row
--   SELECT indisvalid FROM pg_index
--     WHERE indexrelid = 'public.eva_scheduler_metrics_created_at_idx'::regclass; -- expect true
--     (CONCURRENTLY leaves an INVALID index behind if the build is interrupted -- indisvalid
--      confirms the build actually completed, not just that the row exists)
--
-- ROLLBACK: DROP INDEX CONCURRENTLY IF EXISTS public.eva_scheduler_metrics_created_at_idx;
-- ============================================================================
