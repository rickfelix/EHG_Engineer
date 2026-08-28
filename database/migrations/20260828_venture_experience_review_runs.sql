-- Migration: create venture_experience_review_runs
-- SD: SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001 (FR-4)
-- Date: 2026-08-28
--
-- Queryable persistence of raw findings + time/token cost telemetry for the
-- Stage-20 experience-design review pilot, so Solomon can author his
-- chairman-assigned report directly against this table without depending on
-- sub_agent_execution_results (no token-cost column, requires sd_id NOT NULL
-- -- wrong shape for a standalone/no-SD review) or model_usage_log (no cost
-- column either; documented dead at 0/1904 rows for cost capture generally).
--
-- Additive-only: a new table, no existing schema touched.

BEGIN;

CREATE TABLE IF NOT EXISTS venture_experience_review_runs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id                  UUID NOT NULL,
  run_id                      TEXT NOT NULL,
  run_mode                    TEXT NOT NULL,
  findings_count_by_category  JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity_breakdown          JSONB NOT NULL DEFAULT '{}'::jsonb,
  duration_ms                 INTEGER,
  token_usage                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_usd                    NUMERIC(10, 4),
  adapter_version              TEXT NOT NULL DEFAULT '1.0.0',
  deployment_url              TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT venture_experience_review_runs_run_mode_check
    CHECK (run_mode IN ('in_traversal', 'out_of_band_annex')),

  -- Idempotency: one row per (venture, run_id). A re-run with the same
  -- run_id (e.g. a retried CI step) UPSERTs rather than duplicating.
  CONSTRAINT venture_experience_review_runs_unique_run
    UNIQUE (venture_id, run_id)
);

CREATE INDEX IF NOT EXISTS venture_experience_review_runs_venture_idx
  ON venture_experience_review_runs (venture_id);

CREATE INDEX IF NOT EXISTS venture_experience_review_runs_created_idx
  ON venture_experience_review_runs (created_at);

COMMIT;
