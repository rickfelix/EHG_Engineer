-- Migration: Create Agent Execution Tracking Schema (SAFE VERSION)
-- SD: SD-STAGE4-AGENT-PROGRESS-001
-- Purpose: Database schema for tracking AI agent execution progress
-- Created: 2025-11-08
-- Version: 1.0 (Safe - Drops existing tables)

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CLEANUP: Drop existing tables if they exist (CASCADE to remove dependencies)
-- ============================================================================

DROP TABLE IF EXISTS execution_metrics CASCADE;
DROP TABLE IF EXISTS agent_execution_logs CASCADE;
DROP TABLE IF EXISTS agent_executions CASCADE;

-- Drop functions if they exist
DROP FUNCTION IF EXISTS update_agent_executions_timestamp() CASCADE;
DROP FUNCTION IF EXISTS notify_agent_execution_updates() CASCADE;

-- ============================================================================
-- TABLE: agent_executions
-- Purpose: Track execution state for AI agents
-- ============================================================================

CREATE TABLE agent_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign keys & identification
  venture_id UUID NOT NULL,

  -- Execution state
  execution_status VARCHAR(50) NOT NULL
    CHECK (execution_status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  current_stage VARCHAR(100) NOT NULL,

  -- Progress tracking
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  total_steps INTEGER NOT NULL CHECK (total_steps > 0),
  completed_steps INTEGER NOT NULL DEFAULT 0 CHECK (completed_steps >= 0),

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_step_count CHECK (completed_steps <= total_steps),
  CONSTRAINT valid_timestamps CHECK (started_at <= completed_at OR completed_at IS NULL)
);

-- Indexes for common queries
CREATE INDEX idx_agent_executions_venture_id
  ON agent_executions(venture_id);

CREATE INDEX idx_agent_executions_status
  ON agent_executions(execution_status);

CREATE INDEX idx_agent_executions_updated_at
  ON agent_executions(updated_at DESC);

CREATE INDEX idx_agent_executions_created_at
  ON agent_executions(created_at DESC);

CREATE INDEX idx_agent_executions_venture_status
  ON agent_executions(venture_id, execution_status);

-- ============================================================================
-- TABLE: agent_execution_logs
-- Purpose: Structured logging for each execution step
-- ============================================================================

CREATE TABLE agent_execution_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign keys
  execution_id UUID NOT NULL REFERENCES agent_executions(id) ON DELETE CASCADE,

  -- Log data
  log_level VARCHAR(20) NOT NULL
    CHECK (log_level IN ('debug', 'info', 'warning', 'error')),
  message TEXT NOT NULL,

  -- Execution context
  step_number INTEGER NOT NULL CHECK (step_number > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),

  -- Error details (only populated for errors)
  error_details JSONB,

  -- Tracing
  correlation_id VARCHAR(255),

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_agent_execution_logs_execution_id
  ON agent_execution_logs(execution_id);

CREATE INDEX idx_agent_execution_logs_created_at
  ON agent_execution_logs(created_at DESC);

CREATE INDEX idx_agent_execution_logs_correlation_id
  ON agent_execution_logs(correlation_id);

CREATE INDEX idx_agent_execution_logs_log_level
  ON agent_execution_logs(log_level);

CREATE INDEX idx_agent_execution_logs_execution_step
  ON agent_execution_logs(execution_id, step_number);

-- ============================================================================
-- TABLE: execution_metrics
-- Purpose: Aggregated metrics for completed executions
-- ============================================================================

CREATE TABLE execution_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Foreign keys
  execution_id UUID NOT NULL UNIQUE REFERENCES agent_executions(id) ON DELETE CASCADE,

  -- Timing metrics
  execution_duration_ms INTEGER NOT NULL CHECK (execution_duration_ms >= 0),

  -- Progress metrics
  stage_completion_rate NUMERIC(5, 2) NOT NULL
    CHECK (stage_completion_rate >= 0 AND stage_completion_rate <= 100),

  -- Error tracking
  error_frequency INTEGER NOT NULL DEFAULT 0 CHECK (error_frequency >= 0),

  -- Last step tracking
  last_step_timestamp TIMESTAMP,

  -- Resource metrics
  memory_usage_mb NUMERIC(10, 2) CHECK (memory_usage_mb IS NULL OR memory_usage_mb >= 0),

  -- Metadata
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX idx_execution_metrics_execution_id
  ON execution_metrics(execution_id);

CREATE INDEX idx_execution_metrics_created_at
  ON execution_metrics(created_at DESC);

-- ============================================================================
-- TRIGGERS & AUTO-UPDATE LOGIC
-- ============================================================================

-- Update agent_executions.updated_at timestamp on every change
CREATE OR REPLACE FUNCTION update_agent_executions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_agent_executions_timestamp
BEFORE UPDATE ON agent_executions
FOR EACH ROW
EXECUTE FUNCTION update_agent_executions_timestamp();

-- ============================================================================
-- TRIGGER: Broadcast execution updates via PostgreSQL NOTIFY
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_agent_execution_updates()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'agent_execution_updates',
    json_build_object(
      'execution_id', NEW.id,
      'venture_id', NEW.venture_id,
      'status', NEW.execution_status,
      'current_stage', NEW.current_stage,
      'completed_steps', NEW.completed_steps,
      'total_steps', NEW.total_steps,
      'timestamp', NEW.updated_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notify_agent_execution_updates
AFTER INSERT OR UPDATE ON agent_executions
FOR EACH ROW
EXECUTE FUNCTION notify_agent_execution_updates();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_metrics ENABLE ROW LEVEL SECURITY;

-- Policy for agent_executions: Users can only see executions for their ventures
-- NOTE: If ventures table exists with user_id column, uncomment the subquery version
-- For now, using simplified auth-based policy
CREATE POLICY agent_executions_select_policy ON agent_executions
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY agent_executions_insert_policy ON agent_executions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY agent_executions_update_policy ON agent_executions
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY agent_executions_delete_policy ON agent_executions
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Policy for agent_execution_logs: Inherit from parent execution
CREATE POLICY agent_execution_logs_select_policy ON agent_execution_logs
  FOR SELECT
  USING (
    execution_id IN (
      SELECT id FROM agent_executions WHERE auth.uid() IS NOT NULL
    )
  );

CREATE POLICY agent_execution_logs_insert_policy ON agent_execution_logs
  FOR INSERT
  WITH CHECK (
    execution_id IN (
      SELECT id FROM agent_executions WHERE auth.uid() IS NOT NULL
    )
  );

-- Policy for execution_metrics: Inherit from parent execution
CREATE POLICY execution_metrics_select_policy ON execution_metrics
  FOR SELECT
  USING (
    execution_id IN (
      SELECT id FROM agent_executions WHERE auth.uid() IS NOT NULL
    )
  );

CREATE POLICY execution_metrics_insert_policy ON execution_metrics
  FOR INSERT
  WITH CHECK (
    execution_id IN (
      SELECT id FROM agent_executions WHERE auth.uid() IS NOT NULL
    )
  );

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE agent_executions IS 'Tracks AI agent execution state and progress for ventures';
COMMENT ON COLUMN agent_executions.execution_status IS 'State: pending, running, completed, failed, or cancelled';
COMMENT ON COLUMN agent_executions.current_stage IS 'Current processing stage (e.g., stage_3_research, stage_4_competitive_intelligence)';
COMMENT ON COLUMN agent_executions.completed_steps IS 'Number of completed steps out of total_steps';

COMMENT ON TABLE agent_execution_logs IS 'Structured JSON logs for each execution step';
COMMENT ON COLUMN agent_execution_logs.log_level IS 'Severity level: debug, info, warning, or error';
COMMENT ON COLUMN agent_execution_logs.correlation_id IS 'Trace ID for correlating related log entries across services';
COMMENT ON COLUMN agent_execution_logs.error_details IS 'JSONB containing error stack trace and context';

COMMENT ON TABLE execution_metrics IS 'Aggregated performance metrics after execution completes';
COMMENT ON COLUMN execution_metrics.stage_completion_rate IS 'Percentage of steps completed (0-100)';
COMMENT ON COLUMN execution_metrics.error_frequency IS 'Total count of error-level log entries';

-- ============================================================================
-- MIGRATION STATUS
-- ============================================================================
-- This migration creates the foundational schema for agent execution tracking.
-- Next migration will add service functions and stored procedures.
-- ============================================================================
