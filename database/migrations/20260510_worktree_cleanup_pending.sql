-- ============================================================================
-- 20260510_worktree_cleanup_pending.sql
-- ----------------------------------------------------------------------------
-- SD: SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001
-- UUID: a6642ea8-33fe-40dc-814b-54245e41e4c8
-- Phase: PLAN (database-agent design output)
--
-- Purpose:
--   Add cleanup_pending TIMESTAMPTZ marker column to claude_sessions so the
--   orphan-worktree-reaper can safely defer Windows-EBUSY-blocked filesystem
--   cleanup of released sessions and retry on its own schedule, decoupling
--   reaper backoff from the canonical session-release path.
--
-- Risk-agent rationale (evidence c3bdad3a-ce5d-4083-a71a-3261655aea75):
--   * ADD COLUMN with literal NULL default on PostgreSQL 11+ is a metadata-only
--     operation: brief AccessExclusiveLock, no row rewrite, no full-table scan.
--   * Skip explicit backfill — column defaults to NULL; reader treats NULL as
--     "no cleanup pending" (identical to all existing rows).
--   * Standalone migration ships and verifies BEFORE the code PR (deploy-order
--     safety: column must exist before any reader/writer references it).
--   * Module-load assertion in scripts/orphan-worktree-reaper.mjs fails loudly
--     if the column is missing post-deploy.
--   * CAS pattern UPDATE WHERE cleanup_pending = expected_ts protects against
--     concurrent reaper runs claiming the same row.
--
-- Validation-agent evidence: 7e8f4c86-cf3b-4c28-9fee-51af6e51036e
-- Testing-agent  evidence:   cdd621b9-033b-4fec-a993-3a481565e732
--
-- Deploy-order checklist:
--   1. Merge this migration PR.
--   2. Run migration in production. Verify column visible via the assertion query.
--   3. Then merge the code PR that wires reaper marking + sweep logic.
--   4. Reaper module-load assertion guards against any drift between the two.
--
-- Rollback:
--   ALTER TABLE claude_sessions DROP COLUMN IF EXISTS cleanup_pending;
--   DROP INDEX IF EXISTS idx_claude_sessions_cleanup_pending;
-- ============================================================================

BEGIN;

-- 1) Add the marker column.
--    Metadata-only on PG11+ when DEFAULT is NULL or a constant evaluable
--    without per-row computation (PG verified 17.4 in production).
ALTER TABLE public.claude_sessions
  ADD COLUMN IF NOT EXISTS cleanup_pending TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.claude_sessions.cleanup_pending IS
  'NULL = no filesystem cleanup pending. NOT NULL = orphan-worktree-reaper '
  'enqueued this released session for deferred worktree removal at the given '
  'timestamp (typically used as a CAS guard to coordinate concurrent reapers). '
  'Set when filesystem rm of worktree_path raised Windows EBUSY/ENOTEMPTY; '
  'cleared atomically by the reaper after a successful retry. '
  'See SD-LEO-INFRA-WORKTREE-CLEANUP-WINDOWS-001.';

-- 2) Partial index — small footprint, fast sweep.
--    Canonical reader query: WHERE cleanup_pending IS NOT NULL.
--    Predicate matches the query exactly so the planner uses an index-only
--    scan over the partial. Heartbeat writes (cleanup_pending stays NULL)
--    never touch this index.
CREATE INDEX IF NOT EXISTS idx_claude_sessions_cleanup_pending
  ON public.claude_sessions (cleanup_pending)
  WHERE cleanup_pending IS NOT NULL;

COMMIT;

-- ============================================================================
-- Post-deploy verification (run as a separate query in psql or scripted check):
--
--   SELECT EXISTS (
--     SELECT 1 FROM information_schema.columns
--     WHERE table_schema = 'public'
--       AND table_name   = 'claude_sessions'
--       AND column_name  = 'cleanup_pending'
--   ) AS column_exists,
--   EXISTS (
--     SELECT 1 FROM pg_indexes
--     WHERE schemaname = 'public'
--       AND tablename  = 'claude_sessions'
--       AND indexname  = 'idx_claude_sessions_cleanup_pending'
--   ) AS index_exists;
-- ============================================================================
