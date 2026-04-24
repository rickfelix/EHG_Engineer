-- SD-LEARN-FIX-ADDRESS-PAT-AGENT-001
-- Migration: create learning_runs table
--
-- Tracks /learn command executions per SD. Used by LEARNING_OR_BYPASS_RESOLVED gate
-- at LEAD-FINAL-APPROVAL to verify that /learn was run before completion when
-- --bypass-validation was used during the SD's lifecycle.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS learning_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id             UUID NOT NULL,
  run_type          TEXT NOT NULL CHECK (run_type IN ('process', 'auto_approve', 'insights', 'apply')),
  status            TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'in_progress', 'completed', 'failed', 'cancelled')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  error_message     TEXT,
  items_approved    INTEGER DEFAULT 0,
  items_deferred    INTEGER DEFAULT 0,
  resulting_sd_keys TEXT[] DEFAULT ARRAY[]::TEXT[],
  metadata          JSONB DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_runs_sd_id       ON learning_runs (sd_id);
CREATE INDEX IF NOT EXISTS idx_learning_runs_status      ON learning_runs (status);
CREATE INDEX IF NOT EXISTS idx_learning_runs_completed   ON learning_runs (completed_at)
  WHERE completed_at IS NOT NULL;

COMMENT ON TABLE  learning_runs IS
  'SD-LEARN-FIX-ADDRESS-PAT-AGENT-001: tracks /learn executions per SD. Consumed by LEARNING_OR_BYPASS_RESOLVED gate at LEAD-FINAL-APPROVAL to verify /learn ran when bypass was used.';
COMMENT ON COLUMN learning_runs.sd_id IS
  'FK to strategic_directives_v2.id (no FK constraint — soft reference so SD deletions do not cascade-drop learning history).';
COMMENT ON COLUMN learning_runs.run_type IS
  'process (process phase), auto_approve (AUTO-PROCEED path), insights (effectiveness report), apply (final SD creation).';
COMMENT ON COLUMN learning_runs.status IS
  'started on invocation, completed on success, failed on exception. Gate queries status IN (completed, success).';
COMMENT ON COLUMN learning_runs.resulting_sd_keys IS
  'SD keys created by the /learn run, if any. Used by analytics and follow-up tracking.';

-- Trigger to maintain updated_at
CREATE OR REPLACE FUNCTION trg_learning_runs_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS learning_runs_touch_updated_at ON learning_runs;
CREATE TRIGGER learning_runs_touch_updated_at
  BEFORE UPDATE ON learning_runs
  FOR EACH ROW EXECUTE FUNCTION trg_learning_runs_touch_updated_at();
