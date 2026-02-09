-- Migration: workflow_trace_log
-- SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A
-- Purpose: Create workflow_trace_log table for storing telemetry spans
-- Date: 2026-02-09

-- ============================================================
-- UP MIGRATION
-- ============================================================

-- Create workflow_trace_log table
CREATE TABLE IF NOT EXISTS workflow_trace_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL,
  span_id uuid NOT NULL,
  parent_span_id uuid,
  workflow_execution_id text NOT NULL,
  sd_id text,
  phase text,
  gate_name text,
  subagent_name text,
  span_name text NOT NULL,
  span_type text NOT NULL,
  start_time_ms bigint NOT NULL,
  end_time_ms bigint,
  duration_ms bigint,
  queue_wait_ms bigint,
  attributes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add comment
COMMENT ON TABLE workflow_trace_log IS 'Stores workflow telemetry spans for bottleneck detection (SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A)';

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_workflow_trace_log_execution_time
  ON workflow_trace_log (workflow_execution_id, start_time_ms DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_trace_log_trace_id
  ON workflow_trace_log (trace_id);

CREATE INDEX IF NOT EXISTS idx_workflow_trace_log_span_type_name
  ON workflow_trace_log (span_type, span_name);

CREATE INDEX IF NOT EXISTS idx_workflow_trace_log_created_at
  ON workflow_trace_log (created_at DESC);

-- RLS: Allow service_role full access
ALTER TABLE workflow_trace_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_workflow_trace_log
  ON workflow_trace_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- DOWN MIGRATION (run manually if rollback needed)
-- ============================================================
-- DROP POLICY IF EXISTS service_role_all_workflow_trace_log ON workflow_trace_log;
-- DROP TABLE IF EXISTS workflow_trace_log;
