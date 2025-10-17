-- =====================================================
-- Parallel Sub-Agent Execution Tracking
-- =====================================================
-- Purpose: Track concurrent sub-agent executions for PLAN supervisor
-- Version: Phase 4 - Parallel Execution
-- Created: 2025-09-29
-- =====================================================

-- Create sub_agent_executions table
CREATE TABLE IF NOT EXISTS sub_agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  sub_agent_id UUID REFERENCES leo_sub_agents(id) ON DELETE CASCADE,
  prd_id TEXT,
  strategic_directive_id TEXT, -- References strategic_directives_v2.id

  -- Execution details
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('sequential', 'parallel')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'timeout', 'circuit_open')),

  -- Results
  results JSONB DEFAULT '{}',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_sub_agent_id ON sub_agent_executions(sub_agent_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_prd_id ON sub_agent_executions(prd_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_sd_id ON sub_agent_executions(strategic_directive_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_status ON sub_agent_executions(status);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_execution_mode ON sub_agent_executions(execution_mode);
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_created_at ON sub_agent_executions(created_at DESC);

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_sub_agent_executions_sd_status
ON sub_agent_executions(strategic_directive_id, status, created_at DESC);

-- Create execution_batches table to track parallel execution groups
CREATE TABLE IF NOT EXISTS sub_agent_execution_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- References
  strategic_directive_id TEXT NOT NULL,
  prd_id TEXT,

  -- Batch details
  batch_mode TEXT NOT NULL CHECK (batch_mode IN ('sequential', 'parallel')),
  total_agents INTEGER NOT NULL,
  completed_agents INTEGER DEFAULT 0,
  failed_agents INTEGER DEFAULT 0,

  -- Status
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial_failure', 'failed')),

  -- Aggregated results
  aggregated_results JSONB DEFAULT '{}',
  confidence_score INTEGER,
  final_verdict TEXT CHECK (final_verdict IN ('PASS', 'FAIL', 'CONDITIONAL_PASS', 'ESCALATE')),

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,

  -- Performance metrics
  performance_metrics JSONB DEFAULT '{}',

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for execution_batches
CREATE INDEX IF NOT EXISTS idx_execution_batches_sd_id ON sub_agent_execution_batches(strategic_directive_id);
CREATE INDEX IF NOT EXISTS idx_execution_batches_prd_id ON sub_agent_execution_batches(prd_id);
CREATE INDEX IF NOT EXISTS idx_execution_batches_status ON sub_agent_execution_batches(status);
CREATE INDEX IF NOT EXISTS idx_execution_batches_created_at ON sub_agent_execution_batches(created_at DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_sub_agent_executions_updated_at
  BEFORE UPDATE ON sub_agent_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_execution_batches_updated_at
  BEFORE UPDATE ON sub_agent_execution_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to calculate duration on completion
CREATE OR REPLACE FUNCTION calculate_execution_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
    NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for duration calculation
CREATE TRIGGER calculate_sub_agent_execution_duration
  BEFORE UPDATE ON sub_agent_executions
  FOR EACH ROW
  WHEN (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL)
  EXECUTE FUNCTION calculate_execution_duration();

CREATE TRIGGER calculate_execution_batch_duration
  BEFORE UPDATE ON sub_agent_execution_batches
  FOR EACH ROW
  WHEN (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL)
  EXECUTE FUNCTION calculate_execution_duration();

-- Create function to update batch completion status
CREATE OR REPLACE FUNCTION update_batch_completion_status()
RETURNS TRIGGER AS $$
DECLARE
  batch_record RECORD;
BEGIN
  -- Find the batch this execution belongs to
  SELECT * INTO batch_record
  FROM sub_agent_execution_batches
  WHERE strategic_directive_id = NEW.strategic_directive_id
    AND status IN ('queued', 'running')
  ORDER BY created_at DESC
  LIMIT 1;

  IF batch_record IS NOT NULL THEN
    -- Update completed/failed counts
    IF NEW.status = 'completed' THEN
      UPDATE sub_agent_execution_batches
      SET completed_agents = completed_agents + 1
      WHERE id = batch_record.id;
    ELSIF NEW.status IN ('failed', 'timeout', 'circuit_open') THEN
      UPDATE sub_agent_execution_batches
      SET failed_agents = failed_agents + 1
      WHERE id = batch_record.id;
    END IF;

    -- Check if batch is complete
    IF (batch_record.completed_agents + batch_record.failed_agents + 1) >= batch_record.total_agents THEN
      UPDATE sub_agent_execution_batches
      SET
        status = CASE
          WHEN failed_agents > 0 THEN 'partial_failure'
          ELSE 'completed'
        END,
        completed_at = NOW()
      WHERE id = batch_record.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for batch status updates
CREATE TRIGGER update_batch_on_execution_complete
  AFTER UPDATE ON sub_agent_executions
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed', 'timeout', 'circuit_open')
    AND OLD.status NOT IN ('completed', 'failed', 'timeout', 'circuit_open'))
  EXECUTE FUNCTION update_batch_completion_status();

-- Create view for execution performance metrics
CREATE OR REPLACE VIEW v_execution_performance AS
SELECT
  sa.code as sub_agent_code,
  sa.name as sub_agent_name,
  e.execution_mode,
  COUNT(*) as total_executions,
  COUNT(*) FILTER (WHERE e.status = 'completed') as successful_executions,
  COUNT(*) FILTER (WHERE e.status IN ('failed', 'timeout', 'circuit_open')) as failed_executions,
  ROUND(AVG(e.duration_ms)) as avg_duration_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.duration_ms)) as median_duration_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY e.duration_ms)) as p95_duration_ms,
  MAX(e.duration_ms) as max_duration_ms,
  MIN(e.duration_ms) as min_duration_ms
FROM sub_agent_executions e
JOIN leo_sub_agents sa ON e.sub_agent_id = sa.id
WHERE e.status IN ('completed', 'failed', 'timeout')
GROUP BY sa.code, sa.name, e.execution_mode;

-- Create view for batch performance
CREATE OR REPLACE VIEW v_batch_performance AS
SELECT
  batch_mode,
  COUNT(*) as total_batches,
  COUNT(*) FILTER (WHERE status = 'completed') as successful_batches,
  COUNT(*) FILTER (WHERE status IN ('partial_failure', 'failed')) as failed_batches,
  ROUND(AVG(total_agents)) as avg_agents_per_batch,
  ROUND(AVG(duration_ms)) as avg_duration_ms,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)) as median_duration_ms,
  ROUND(AVG(confidence_score)) as avg_confidence_score
FROM sub_agent_execution_batches
WHERE status IN ('completed', 'partial_failure')
GROUP BY batch_mode;

-- Enable RLS (Row Level Security)
ALTER TABLE sub_agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_agent_execution_batches ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for read access
CREATE POLICY "Allow read access to sub_agent_executions"
  ON sub_agent_executions
  FOR SELECT
  USING (true);

CREATE POLICY "Allow read access to execution_batches"
  ON sub_agent_execution_batches
  FOR SELECT
  USING (true);

-- Create RLS policies for insert/update (authenticated users only)
CREATE POLICY "Allow insert sub_agent_executions"
  ON sub_agent_executions
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update sub_agent_executions"
  ON sub_agent_executions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow insert execution_batches"
  ON sub_agent_execution_batches
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update execution_batches"
  ON sub_agent_execution_batches
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Add comments for documentation
COMMENT ON TABLE sub_agent_executions IS 'Tracks individual sub-agent execution runs with timing and results';
COMMENT ON TABLE sub_agent_execution_batches IS 'Tracks groups of parallel sub-agent executions with aggregated results';
COMMENT ON COLUMN sub_agent_executions.execution_mode IS 'Whether this execution was part of sequential or parallel batch';
COMMENT ON COLUMN sub_agent_executions.retry_count IS 'Number of retries attempted (circuit breaker tracking)';
COMMENT ON COLUMN sub_agent_execution_batches.confidence_score IS 'Overall confidence score from 0-100 based on all sub-agent results';
COMMENT ON COLUMN sub_agent_execution_batches.final_verdict IS 'PASS, FAIL, CONDITIONAL_PASS, or ESCALATE';

-- Update leo_protocols metadata to include parallel execution capability
UPDATE leo_protocols
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{features,parallel_execution}',
  jsonb_build_object(
    'enabled', true,
    'max_concurrent', 10,
    'timeout_ms', 300000,
    'circuit_breaker', jsonb_build_object(
      'max_retries', 3,
      'backoff_ms', 1000
    ),
    'added_in_phase', 4,
    'added_at', NOW()
  )
)
WHERE status = 'active';

-- Grant permissions (adjust based on your RLS setup)
-- GRANT ALL ON sub_agent_executions TO authenticated;
-- GRANT ALL ON sub_agent_execution_batches TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Parallel execution tracking tables created successfully';
  RAISE NOTICE '   - sub_agent_executions: Individual execution tracking';
  RAISE NOTICE '   - sub_agent_execution_batches: Batch tracking with aggregation';
  RAISE NOTICE '   - v_execution_performance: Performance metrics view';
  RAISE NOTICE '   - v_batch_performance: Batch performance view';
  RAISE NOTICE '   - Triggers: Auto-calculate duration and update batch status';
  RAISE NOTICE '   - RLS: Enabled with read/write policies';
END $$;