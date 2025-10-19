-- Sub-Agent Execution Results Table
-- Stores full sub-agent reports for compression system

CREATE TABLE IF NOT EXISTS sub_agent_execution_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL,
  sub_agent_code TEXT NOT NULL,
  sub_agent_name TEXT NOT NULL,
  verdict TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  critical_issues JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  detailed_analysis TEXT,
  execution_time INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_verdict CHECK (verdict IN ('PASS', 'FAIL', 'BLOCKED', 'CONDITIONAL_PASS', 'WARNING')),
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 100),
  CONSTRAINT valid_execution_time CHECK (execution_time >= 0)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sub_agent_results_sd_id ON sub_agent_execution_results(sd_id);
CREATE INDEX IF NOT EXISTS idx_sub_agent_results_sub_agent_code ON sub_agent_execution_results(sub_agent_code);
CREATE INDEX IF NOT EXISTS idx_sub_agent_results_verdict ON sub_agent_execution_results(verdict);
CREATE INDEX IF NOT EXISTS idx_sub_agent_results_created_at ON sub_agent_execution_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_agent_results_sd_created ON sub_agent_execution_results(sd_id, created_at DESC);

-- Comments
COMMENT ON TABLE sub_agent_execution_results IS 'Full sub-agent execution reports for compression system';
COMMENT ON COLUMN sub_agent_execution_results.sd_id IS 'Strategic Directive ID';
COMMENT ON COLUMN sub_agent_execution_results.sub_agent_code IS 'Short code (QA, SECURITY, DATABASE, etc.)';
COMMENT ON COLUMN sub_agent_execution_results.sub_agent_name IS 'Full sub-agent name';
COMMENT ON COLUMN sub_agent_execution_results.verdict IS 'Overall verdict (PASS, FAIL, BLOCKED, CONDITIONAL_PASS, WARNING)';
COMMENT ON COLUMN sub_agent_execution_results.confidence IS 'Confidence score 0-100';
COMMENT ON COLUMN sub_agent_execution_results.critical_issues IS 'Array of critical issues (JSONB)';
COMMENT ON COLUMN sub_agent_execution_results.warnings IS 'Array of warnings (JSONB)';
COMMENT ON COLUMN sub_agent_execution_results.recommendations IS 'Array of recommendations (JSONB)';
COMMENT ON COLUMN sub_agent_execution_results.detailed_analysis IS 'Full analysis text';
COMMENT ON COLUMN sub_agent_execution_results.execution_time IS 'Execution time in seconds';
COMMENT ON COLUMN sub_agent_execution_results.metadata IS 'Additional metadata (JSONB)';

-- RLS Policies
ALTER TABLE sub_agent_execution_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to all users" ON sub_agent_execution_results
  FOR SELECT
  USING (true);

CREATE POLICY "Allow insert to service role" ON sub_agent_execution_results
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update to service role" ON sub_agent_execution_results
  FOR UPDATE
  USING (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_sub_agent_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sub_agent_results_timestamp
  BEFORE UPDATE ON sub_agent_execution_results
  FOR EACH ROW
  EXECUTE FUNCTION update_sub_agent_results_updated_at();
