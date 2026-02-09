-- Migration: telemetry_analysis_runs
-- SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001C
-- Purpose: Track analysis run lifecycle for auto-trigger integration
-- Depends on: 20260209_telemetry_thresholds.sql

-- Create table
CREATE TABLE IF NOT EXISTS telemetry_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL UNIQUE,
  scope_type TEXT NOT NULL DEFAULT 'workspace' CHECK (scope_type IN ('workspace', 'user', 'global')),
  scope_id TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'FAILED_ENQUEUE')),
  triggered_by TEXT NOT NULL DEFAULT 'SESSION_START' CHECK (triggered_by IN ('SESSION_START', 'MANUAL', 'SCHEDULED', 'CLI')),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  correlation_id TEXT,
  output_ref JSONB,
  findings_count INTEGER DEFAULT 0,
  top_bottleneck_category TEXT,
  reason_code TEXT,
  error_class TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for staleness check (find most recent SUCCEEDED run per scope)
CREATE INDEX IF NOT EXISTS idx_telemetry_runs_scope_status ON telemetry_analysis_runs (scope_type, scope_id, status, finished_at DESC);

-- Index for dedup check (find active runs)
CREATE INDEX IF NOT EXISTS idx_telemetry_runs_active ON telemetry_analysis_runs (scope_type, scope_id, status) WHERE status IN ('QUEUED', 'RUNNING');

-- Index for correlation lookups
CREATE INDEX IF NOT EXISTS idx_telemetry_runs_correlation ON telemetry_analysis_runs (correlation_id) WHERE correlation_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_telemetry_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_telemetry_runs_updated_at ON telemetry_analysis_runs;
CREATE TRIGGER trg_telemetry_runs_updated_at
BEFORE UPDATE ON telemetry_analysis_runs
FOR EACH ROW EXECUTE FUNCTION update_telemetry_runs_updated_at();

-- RLS
ALTER TABLE telemetry_analysis_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY telemetry_analysis_runs_service_all ON telemetry_analysis_runs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY telemetry_analysis_runs_anon_read ON telemetry_analysis_runs
  FOR SELECT USING (true);

-- Comment
COMMENT ON TABLE telemetry_analysis_runs IS 'Tracks lifecycle of telemetry auto-analysis runs (QUEUED->RUNNING->SUCCEEDED/FAILED/TIMED_OUT)';
