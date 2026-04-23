-- Migration: marketing_pipeline_runs table
-- SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A (Phase 0)
-- Date: 2026-04-23
-- Purpose: Per-invocation audit of marketing orchestrator runs
--          (status transitions, error payloads, metrics)

-- ============================================================================
-- Table: marketing_pipeline_runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketing_pipeline_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  pipeline_type   TEXT NOT NULL,
  invocation_id   TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'started'
                   CHECK (status IN ('started','running','completed','failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  error_details   JSONB,
  metrics         JSONB NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_marketing_pipeline_runs_venture_type
  ON marketing_pipeline_runs (venture_id, pipeline_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_pipeline_runs_status
  ON marketing_pipeline_runs (status, started_at DESC)
  WHERE status IN ('started','running','failed');

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE marketing_pipeline_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_marketing_pipeline_runs" ON marketing_pipeline_runs;
CREATE POLICY "service_role_all_marketing_pipeline_runs" ON marketing_pipeline_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "venture_read_marketing_pipeline_runs" ON marketing_pipeline_runs;
CREATE POLICY "venture_read_marketing_pipeline_runs" ON marketing_pipeline_runs
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
  ));

COMMENT ON TABLE marketing_pipeline_runs IS
  'Per-invocation audit for marketing orchestrator pipelines. Append-only. '
  'UNIQUE(invocation_id) prevents duplicate audit rows on retry. Added by '
  'SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A.';
