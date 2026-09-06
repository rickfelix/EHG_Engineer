-- Restore strategic_directives_v2.backlog_summary / backlog_summary_generated_at
-- (SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-C)
--
-- server/routes/backlog.js's GET /backlog-summary/:sd_id caches an LLM-generated
-- backlog summary in these two columns (write path at backlog.js:299-306, confirmed
-- real: it calls the LLM, then updates strategic_directives_v2 with the result).
-- Neither column exists live -- the read side (backlog.js:154-165) silently swallowed
-- the resulting Postgres 42703 and fell through to always regenerating the summary
-- fresh, which is the SD's own measured-severity finding (a false "no backlog items
-- found" response instead of the true "could not check the cache").
--
-- Additive-only: two nullable columns, no data migration, no constraint change.

BEGIN;

ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS backlog_summary TEXT,
  ADD COLUMN IF NOT EXISTS backlog_summary_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN strategic_directives_v2.backlog_summary IS
  'Cached LLM-generated backlog summary, written by server/routes/backlog.js GET /backlog-summary/:sd_id. Restored by SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-E-C after being absent live since before the code that reads/writes it was authored.';
COMMENT ON COLUMN strategic_directives_v2.backlog_summary_generated_at IS
  'Timestamp the cached backlog_summary was generated. Paired with backlog_summary.';

COMMIT;
