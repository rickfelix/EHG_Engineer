-- =====================================================
-- Parallel Sub-Agent Execution Tracking (Simplified)
-- =====================================================
-- Purpose: Track concurrent sub-agent executions for PLAN supervisor
-- Version: Phase 4 - Parallel Execution
-- Created: 2025-09-29
-- =====================================================

-- Create sub_agent_executions table
CREATE TABLE IF NOT EXISTS sub_agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_agent_id UUID REFERENCES leo_sub_agents(id) ON DELETE CASCADE,
  prd_id TEXT,
  strategic_directive_id TEXT,
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('sequential', 'parallel')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'timeout', 'circuit_open')),
  results JSONB DEFAULT '{}',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create execution_batches table
CREATE TABLE IF NOT EXISTS sub_agent_execution_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategic_directive_id TEXT NOT NULL,
  prd_id TEXT,
  batch_mode TEXT NOT NULL CHECK (batch_mode IN ('sequential', 'parallel')),
  total_agents INTEGER NOT NULL,
  completed_agents INTEGER DEFAULT 0,
  failed_agents INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial_failure', 'failed')),
  aggregated_results JSONB DEFAULT '{}',
  confidence_score INTEGER,
  final_verdict TEXT CHECK (final_verdict IN ('PASS', 'FAIL', 'CONDITIONAL_PASS', 'ESCALATE')),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  performance_metrics JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_sub_agent_id ON sub_agent_executions(sub_agent_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_prd_id ON sub_agent_executions(prd_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_sd_id ON sub_agent_executions(strategic_directive_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_status ON sub_agent_executions(status);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_created_at ON sub_agent_executions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_batches_sd_id ON sub_agent_execution_batches(strategic_directive_id);
CREATE INDEX IF NOT EXISTS idx_execution_batches_prd_id ON sub_agent_execution_batches(prd_id);
CREATE INDEX IF NOT EXISTS idx_execution_batches_status ON sub_agent_execution_batches(status);
CREATE INDEX IF NOT EXISTS idx_execution_batches_created_at ON sub_agent_execution_batches(created_at DESC);

-- Enable RLS
ALTER TABLE sub_agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_agent_execution_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY IF NOT EXISTS "Allow read access to sub_agent_executions"
  ON sub_agent_executions FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Allow insert sub_agent_executions"
  ON sub_agent_executions FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow update sub_agent_executions"
  ON sub_agent_executions FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow read access to execution_batches"
  ON sub_agent_execution_batches FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Allow insert execution_batches"
  ON sub_agent_execution_batches FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow update execution_batches"
  ON sub_agent_execution_batches FOR UPDATE USING (true) WITH CHECK (true);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Parallel execution tracking tables created successfully';
  RAISE NOTICE '   - sub_agent_executions: Individual execution tracking';
  RAISE NOTICE '   - sub_agent_execution_batches: Batch tracking with aggregation';
  RAISE NOTICE '   - Indexes and RLS policies enabled';
END $$;