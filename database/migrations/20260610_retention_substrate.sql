-- @approved-by: codestreetlabs@gmail.com
-- Migration: Retention substrate — cold JSONB archive + age-keyed run stamps (additive, reversible)
-- SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001
--
-- WHAT: two NEW tables, nothing else touched.
--   1. retention_archive — single cold store for rows aged out of the unbounded audit/trace
--      tables (workflow_trace_log 607k, governance_audit_log 605k, audit_log 143k,
--      validation_audit_log 59k, model_usage_log 52k, permission_audit_log 41k at authoring).
--      ARCHIVE-NOT-DELETE: the enforcement CLI copies each row to row_data (jsonb) BEFORE
--      deleting it from the hot table; restore = re-insert row_data filtered by
--      source_table/run_id.
--   2. retention_runs — one stamp per enforcement run (including dry runs). Observability is
--      the AGE of max(ran_at) — never self-reported status (the dormant-daemon lesson:
--      eva_scheduler_heartbeat said status=running for ~105 days while dead).
--
-- SAFETY: additive only; no triggers/FKs on the six source tables (verified: none exist);
-- enforcement itself is a separate chairman-gated CLI (dry-run by default). Reversible via
-- the column-explicit DOWN (20260610_retention_substrate_DOWN.sql).

SELECT pg_advisory_xact_lock(hashtext('retention_substrate_20260610'));

CREATE TABLE IF NOT EXISTS retention_archive (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table  text NOT NULL,
  source_id     text,
  row_data      jsonb NOT NULL,
  row_timestamp timestamptz,
  archived_at   timestamptz NOT NULL DEFAULT now(),
  archived_by   text,
  run_id        uuid
);

CREATE INDEX IF NOT EXISTS idx_retention_archive_source_ts
  ON retention_archive (source_table, row_timestamp);
CREATE INDEX IF NOT EXISTS idx_retention_archive_archived_at
  ON retention_archive (archived_at);
CREATE INDEX IF NOT EXISTS idx_retention_archive_run
  ON retention_archive (run_id);

CREATE TABLE IF NOT EXISTS retention_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at      timestamptz NOT NULL DEFAULT now(),
  mode        text NOT NULL,
  caps        jsonb,
  per_table   jsonb,
  duration_ms integer,
  ran_by      text
);

CREATE INDEX IF NOT EXISTS idx_retention_runs_ran_at
  ON retention_runs (ran_at DESC);

COMMENT ON TABLE retention_archive IS
  'Cold JSONB archive for rows aged out of unbounded audit/trace tables. Restore = re-insert row_data (filter by source_table/run_id). Writer: scripts/retention-enforce.js (archive-before-delete invariant). SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001.';
COMMENT ON TABLE retention_runs IS
  'Age-keyed liveness stamps for retention enforcement: alarm on AGE of max(ran_at), never on self-reported status. One row per run incl. dry runs. SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001.';

-- Post-asserts: both tables queryable.
DO $retention_post$
DECLARE
  v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN ('retention_archive','retention_runs');
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'retention substrate post-assert failed: % of 2 tables present', v_cnt;
  END IF;
END;
$retention_post$;
