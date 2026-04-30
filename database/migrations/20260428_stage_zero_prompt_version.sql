-- Migration: Add prompt_version column to stage_zero_requests + discovery_strategies
-- SD: SD-LEO-ENH-TREND-SCANNER-SCORING-001 (FR-5, AC-8)
-- Purpose: Enable Trend Scanner v2 prompt-version stamping per FR-4. Nullable design
--          preserves backfill compat — pre-migration rows surface via COALESCE in the
--          replacement RPC migration as 'v1-pre-versioning'.
--
-- ─── DEPLOY ORDER (TR-3, BLOCKING) ─────────────────────────────────────────────
-- Two-stage deploy mandatory:
--   1. MERGE THIS MIGRATION FIRST.
--   2. Wait >=30s for the queue processor schema cache to refresh.
--   3. Merge the RPC migration (20260428_stage_zero_prompt_version_rpc.sql).
--   4. Merge the application code that writes prompt_version.
-- Rationale: bundling migration + code change risks deploy-ordering races. Single-instance
-- queue processor design accepts the brief column-present-but-unused window with no data loss.
-- ────────────────────────────────────────────────────────────────────────────────

ALTER TABLE stage_zero_requests
  ADD COLUMN IF NOT EXISTS prompt_version TEXT NULL;

ALTER TABLE discovery_strategies
  ADD COLUMN IF NOT EXISTS prompt_version_active TEXT NULL;

-- Partial index: only over rows that carry a prompt_version (most legacy rows are NULL).
-- Keeps the index small and effective for closed-loop RPC GROUP BY behavior.
CREATE INDEX IF NOT EXISTS idx_stage_zero_requests_prompt_version
  ON stage_zero_requests (prompt_version)
  WHERE prompt_version IS NOT NULL;

COMMENT ON COLUMN stage_zero_requests.prompt_version IS
  'Prompt version stamped by Stage Zero strategy runner (e.g. ''2026-04-28-v2''). NULL for pre-versioning runs; surfaced via COALESCE in get_discovery_strategy_scores as ''v1-pre-versioning''. Bumps deliberately when a strategy''s LLM prompt template changes meaningfully — never a content hash (TR-2). Set by SD-LEO-ENH-TREND-SCANNER-SCORING-001.';

COMMENT ON COLUMN discovery_strategies.prompt_version_active IS
  'Optional override for the strategy''s active prompt version. When NULL, the runtime falls back to the code-default constant (TREND_SCANNER_PROMPT_VERSION etc). Set by SD-LEO-ENH-TREND-SCANNER-SCORING-001.';

-- ─── DOWN ──────────────────────────────────────────────────────────────────────
-- To revert (reverse order of creation):
--   DROP INDEX IF EXISTS idx_stage_zero_requests_prompt_version;
--   ALTER TABLE discovery_strategies DROP COLUMN IF EXISTS prompt_version_active;
--   ALTER TABLE stage_zero_requests  DROP COLUMN IF EXISTS prompt_version;
--
-- Roll back code change first (queue processor reverts to v1 path); wait for active requests to
-- drain (~30s); then run the DOWN block above. ehg/ hook continues to work — StrategyScore
-- interface extension is additive (extra field ignored by older callers).
-- ────────────────────────────────────────────────────────────────────────────────
