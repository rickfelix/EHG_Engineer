-- Migration: stage_zero_requests.processing_attempts
-- SD: SD-LEO-FIX-FIX-STAGE-QUEUE-001
-- Purpose: Bound stale-claim re-processing so a request that keeps stalling/failing WITHOUT
--          producing a venture is failed-terminal instead of being re-queued forever. Part of the
--          fix for the Stage-0 queue runaway that generated 131 duplicate "discovery" ventures
--          (2026-05-31..06-06): the queue processor's stale-claim sweep increments this counter
--          each time it re-queues a venture-less request and fails it once it reaches
--          STAGE_ZERO_MAX_ATTEMPTS (default 3).
-- Safety:  ADD COLUMN ... NOT NULL DEFAULT 0 is metadata-only in PostgreSQL 11+ (no full table
--          rewrite / no backfill scan); only a brief ACCESS EXCLUSIVE lock. Idempotent via
--          IF NOT EXISTS so re-running is a no-op.
-- Date:    2026-06-06
-- @approved-by: codestreetlabs@gmail.com

ALTER TABLE stage_zero_requests
  ADD COLUMN IF NOT EXISTS processing_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN stage_zero_requests.processing_attempts IS
  'Number of times this request has been (re-)claimed for processing. Incremented by the Stage-0 queue processor stale-claim sweep when a request is re-queued without having produced a venture; at STAGE_ZERO_MAX_ATTEMPTS the request is failed-terminal rather than looped. SD-LEO-FIX-FIX-STAGE-QUEUE-001.';

-- ============================================================
-- ROLLBACK (run manually if migration needs reverting)
-- ============================================================
-- ALTER TABLE stage_zero_requests DROP COLUMN IF EXISTS processing_attempts;
