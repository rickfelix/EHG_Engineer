-- @approved-by: codestreetlabs@gmail.com
-- approval-note: chairman verbal "A all" 22:17Z + amendment verbal "A" ~22:5xZ 2026-08-22 (CONCURRENTLY dropped — pooler txn-mode cannot run it; plain build, seconds on 687K-row archive table); scribe adam-0549d739
-- SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 (FR-1)
--
-- ROOT CAUSE of the "archive-dedup check failed: canceling statement due to statement timeout"
-- errors already observed live on model_usage_log/permission_audit_log (retention-enforce-cron.yml
-- run history, 5 of last 6 scheduled runs failed): the dedup-check query in
-- scripts/retention-enforce.js (enforcePolicy, id-cursor guard) filters retention_archive by
-- source_table + source_id (`.eq('source_table', ...).in('source_id', idCh)`), but the only
-- existing index, idx_retention_archive_source_ts (database/migrations/20260610_retention_substrate.sql),
-- covers (source_table, row_timestamp) -- it does not cover source_id lookups at all.
--
-- This affects EVERY table using the shared retention-enforce dedup path, not only the 2
-- currently observed. eva_scheduler_metrics (this SD's FR-1 subject) would hit the identical
-- failure once its own hot window opens, so this index is an in-scope prerequisite for FR-1's
-- convergence fix, not scope creep -- it is also expected to resolve the 2 already-failing
-- tables as a side effect (see harness-bug signal 1042940b-f94f-4581-96ac-5195ce5ff77e / feedback
-- follow-up 64a109d9-0ee4-4b5b-8201-8460cac93a46).
--
-- MUST be a separate file (no BEGIN/COMMIT) -- CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction (PostgreSQL constraint).
--
-- Apply: supabase db query --linked --file database/migrations/20260819_retention_archive_source_id_index.sql
-- Rollback: DROP INDEX CONCURRENTLY IF EXISTS idx_retention_archive_source_table_id;

CREATE INDEX IF NOT EXISTS idx_retention_archive_source_table_id
  ON retention_archive (source_table, source_id);

COMMENT ON INDEX idx_retention_archive_source_table_id IS
  'Supports scripts/retention-enforce.js''s per-batch archive-dedup check (.eq(source_table).in(source_id)) — missing since 20260610_retention_substrate.sql, the confirmed root cause of the shared archive-dedup statement-timeout failures. SD-LEO-INFRA-EVA-SCHEDULER-HYGIENE-001 FR-1.';
