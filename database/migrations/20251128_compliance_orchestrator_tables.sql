-- SD-GOV-COMPLIANCE-READINESS-ORCHESTRATOR-001: Compliance Tracking Tables
-- Created: 2025-11-28
-- Purpose: Always-On Compliance & Agent Readiness Orchestrator tables

-- Table: compliance_checks - Stores compliance check run history
CREATE TABLE IF NOT EXISTS compliance_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  run_type TEXT NOT NULL CHECK (run_type IN ('scheduled', 'manual', 'on_demand')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_stages INTEGER NOT NULL DEFAULT 40,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  critical_score DECIMAL(5,2) DEFAULT 0.00,
  overall_score DECIMAL(5,2) DEFAULT 0.00,
  results JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  error_message TEXT,
  created_by TEXT DEFAULT 'github-actions',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: compliance_violations - Stores individual violations from checks
CREATE TABLE IF NOT EXISTS compliance_violations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  check_id UUID NOT NULL REFERENCES compliance_checks(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 25),
  violation_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  rule_id TEXT,
  description TEXT NOT NULL,
  expected_value TEXT,
  actual_value TEXT,
  remediation_sd_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'remediated', 'false_positive')),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_compliance_checks_run_id ON compliance_checks(run_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_status ON compliance_checks(status);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_created_at ON compliance_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_run_type ON compliance_checks(run_type);

CREATE INDEX IF NOT EXISTS idx_compliance_violations_check_id ON compliance_violations(check_id);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_severity ON compliance_violations(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_status ON compliance_violations(status);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_stage_number ON compliance_violations(stage_number);
CREATE INDEX IF NOT EXISTS idx_compliance_violations_remediation_sd ON compliance_violations(remediation_sd_id) WHERE remediation_sd_id IS NOT NULL;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_compliance_checks_updated_at ON compliance_checks;
CREATE TRIGGER update_compliance_checks_updated_at
  BEFORE UPDATE ON compliance_checks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_compliance_violations_updated_at ON compliance_violations;
CREATE TRIGGER update_compliance_violations_updated_at
  BEFORE UPDATE ON compliance_violations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (service role access)
ALTER TABLE compliance_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_violations ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS compliance_checks_service_role ON compliance_checks;
CREATE POLICY compliance_checks_service_role ON compliance_checks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS compliance_violations_service_role ON compliance_violations;
CREATE POLICY compliance_violations_service_role ON compliance_violations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read (for UI dashboards)
DROP POLICY IF EXISTS compliance_checks_authenticated_read ON compliance_checks;
CREATE POLICY compliance_checks_authenticated_read ON compliance_checks
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS compliance_violations_authenticated_read ON compliance_violations;
CREATE POLICY compliance_violations_authenticated_read ON compliance_violations
  FOR SELECT
  TO authenticated
  USING (true);

-- Add comment documentation
COMMENT ON TABLE compliance_checks IS 'Stores compliance check run history for the Always-On Compliance orchestrator';
COMMENT ON TABLE compliance_violations IS 'Stores individual compliance violations detected during checks';
COMMENT ON COLUMN compliance_checks.run_type IS 'scheduled=P7D cron, manual=human triggered, on_demand=API triggered';
COMMENT ON COLUMN compliance_checks.critical_score IS 'Weighted score for critical compliance rules (0-100)';
COMMENT ON COLUMN compliance_violations.severity IS 'critical=blocks operations, high=requires immediate action, medium/low=advisory';
