-- SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-1)
--
-- eva_scheduler_metrics has 3.4M+ rows and no index on created_at, the column its retention
-- policy (lib/retention/policies.js:74) sweeps via `.lt('created_at', cutoff)`. Without this
-- index, the sweep's count/select queries seq-scan the full table -- the same query shape
-- already times out on 2 other registered tables at only 560-647 eligible rows (confirmed via
-- retention-enforce-cron.yml run history). This table will present a far larger backlog once
-- its 90-day hot window opens, so the index is added ahead of that, not reactively.
--
-- MUST be a separate file (no BEGIN/COMMIT) -- CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction (PostgreSQL constraint). CONCURRENTLY avoids an exclusive lock on a 3.4M-row
-- table in prod.
--
-- Apply: supabase db query --linked --file database/migrations/20260819_eva_scheduler_metrics_created_at_index.sql
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS idx_eva_scheduler_metrics_created_at;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_eva_scheduler_metrics_created_at
  ON eva_scheduler_metrics (created_at);

COMMENT ON INDEX idx_eva_scheduler_metrics_created_at IS
  'Supports the retention policy sweep (lib/retention/policies.js, timestampColumn=created_at) — SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 FR-1.';
