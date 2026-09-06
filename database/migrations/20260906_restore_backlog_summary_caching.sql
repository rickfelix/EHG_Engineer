-- @delegated-by: adam
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
-- Additive-only: two nullable columns, no data migration, no constraint change --
-- same low-risk shape as the already-approved sibling E-B/E-D migrations.
--
-- SD-LEO-INFRA-APPLY-PENDING-LEO-001: rewritten for the delegated-apply tier-1
-- classifier (scripts/lib/migration-tier-classifier.mjs Rule C), which requires a
-- single ALTER TABLE ... ADD COLUMN IF NOT EXISTS statement with no other statement
-- kind present. The prior BEGIN/COMMIT wrapper and the two COMMENT ON COLUMN
-- statements are dropped per Adam's routed rewrite instruction (metadata
-- delegated_apply_route, row be199eff) -- ADD COLUMN IF NOT EXISTS is already
-- idempotent, so the transaction wrapper added no safety Postgres doesn't already
-- provide per-statement, and the column comments were documentation-only.

ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS backlog_summary TEXT,
  ADD COLUMN IF NOT EXISTS backlog_summary_generated_at TIMESTAMPTZ;
