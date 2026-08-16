-- SD-LEO-INFRA-PRE-PLAN-CRITIQUE-PRD-TRUNCATION-001 — TR-3
--
-- Adds two columns to plan_critiques:
--   metadata      jsonb — gate-run metadata. truncated: {prd, arch, shown, total}; cache_hit: bool
--                  + pointer to the reused row when a content-hash cache hit occurs (FR-4/FR-5).
--   content_hash  text — SHA-256 of the exact post-truncation/chunking PRD+arch text sent to the
--                  critique LLM, plus the requested model (adapter.defaultModel, NEVER
--                  response.model — see FR-4's binding-predicate note). Becomes findActiveOverride's
--                  new matching predicate (REPLACING findingsFingerprint, not ANDing with it),
--                  because a human override is realistically recorded minutes-to-days after a block,
--                  well outside any LLM-call-caching window — content identity is what must bind,
--                  not a specific LLM call's non-deterministic finding composition.
--
-- TIER-1 (all_statements_provably_additive): verified by EXECUTING classifyMigration() against this
-- exact SQL (database-agent, LEAD phase evidence 4cac69dc-0cf8-4b4f-95b3-c4febd8c06ed), not by
-- reading the classifier's rules. Lands here in database/migrations/, NOT database/chairman-gated/ —
-- confirmed live that the chairman tier-gate is NOT inert (tierGateEnabled() returns true,
-- LEO_MIGRATION_TIER_GATE_BYPASS is_enabled=false → gate ON, fails closed), so a TIER-2
-- misclassification would have genuinely required the chairman ceremony; this migration correctly
-- avoids that path.
--
-- NO BACKFILL, NO DEFAULT. An UPDATE statement would force TIER-2 (forbidden top-level verb for
-- additive classification). NULL is honest for the ~241 pre-migration rows: "this row predates the
-- feature", not "measured empty". All existing readers are NULL-safe by construction (independently
-- confirmed by both database-agent and testing-agent): scripts/critique-catch-rate-monitor.js does a
-- count-only head select; scripts/critique-override.js and findActiveOverride use explicit column
-- lists that must be updated in application code (this migration only adds the column; the
-- content_hash equality filter itself is FR-4/FR-5's code change, not this file's).
--
-- NO NEW INDEX on content_hash. Measured live (database-agent): table is 6 pages / 96 kB / 237 rows
-- at measurement time; the existing idx_plan_critiques_sd_id already narrows to <=17 rows per SD,
-- and the residual filter benchmarks identically to the current (unindexed) override lookup at
-- 0.065-0.097ms. Two pre-existing indexes on this table (idx_plan_critiques_severity,
-- the created_at BRIN) already show 0 scans — a third would compound, not fix, that. Defer a
-- content_hash index as a documented TIER-1 follow-up only if this table passes ~10k rows.
--
-- ROLLBACK: 20260816_plan_critiques_add_metadata_and_content_hash_DOWN.sql

ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE plan_critiques ADD COLUMN IF NOT EXISTS content_hash text;
COMMENT ON COLUMN plan_critiques.content_hash IS 'SHA-256 of the exact PRD+arch text sent to the LLM, post-truncation.';
COMMENT ON COLUMN plan_critiques.metadata IS 'Gate-run metadata. truncated: {prd,arch,shown,total}.';
