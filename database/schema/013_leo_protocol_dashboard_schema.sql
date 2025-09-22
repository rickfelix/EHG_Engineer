-- LEO Protocol Dashboard Schema
-- Phase 0: Guardrails (PR-1)
-- Purpose: Complete schema for gate reviews, sub-agent executions, and compliance tracking
-- Author: LEO Protocol v4.1.2
-- Date: 2025-01-16

-- ============================================
-- Gate Reviews Table
-- ============================================
CREATE TABLE IF NOT EXISTS leo_gate_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id TEXT NOT NULL,
  gate TEXT NOT NULL CHECK (gate IN ('2A','2B','2C','2D','3')),
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  evidence JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_gate_reviews_prd ON leo_gate_reviews(prd_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gate_reviews_gate ON leo_gate_reviews(gate, score);

COMMENT ON TABLE leo_gate_reviews IS 'Tracks gate scoring and evidence for PRDs';
COMMENT ON COLUMN leo_gate_reviews.score IS 'Gate score 0-100, must be >=85 to pass';
COMMENT ON COLUMN leo_gate_reviews.evidence IS 'JSON evidence supporting the score';

-- ============================================
-- Sub-Agent Executions Table
-- ============================================
CREATE TABLE IF NOT EXISTS sub_agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id TEXT NOT NULL,
  sub_agent_id UUID NOT NULL REFERENCES leo_sub_agents(id),
  status TEXT NOT NULL CHECK (status IN ('pending','running','pass','fail','error','timeout')),
  results JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  execution_time_ms INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_subagent_prd ON sub_agent_executions(prd_id, sub_agent_id);
CREATE INDEX IF NOT EXISTS idx_subagent_status ON sub_agent_executions(status, started_at);

COMMENT ON TABLE sub_agent_executions IS 'Tracks sub-agent activation and execution results per PRD';
COMMENT ON COLUMN sub_agent_executions.status IS 'Execution status: pending|running|pass|fail|error|timeout';

-- ============================================
-- Validation Rules Table
-- ============================================
CREATE TABLE IF NOT EXISTS leo_validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate TEXT NOT NULL CHECK (gate IN ('2A','2B','2C','2D','3')),
  rule_name TEXT NOT NULL,
  weight NUMERIC(4,3) NOT NULL CHECK (weight >= 0 AND weight <= 1),
  criteria JSONB NOT NULL DEFAULT '{}',
  required BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_validation_rule ON leo_validation_rules(gate, rule_name) WHERE active = true;

COMMENT ON TABLE leo_validation_rules IS 'Defines validation rules and weights for gate scoring';
COMMENT ON COLUMN leo_validation_rules.weight IS 'Rule weight 0.000-1.000, sum per gate should = 1.000';

-- ============================================
-- PLAN+ Artifact Tables
-- ============================================

-- Architecture Decision Records
CREATE TABLE IF NOT EXISTS leo_adrs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id TEXT NOT NULL,
  adr_number TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','proposed','accepted','deprecated','superseded')),
  decision TEXT NOT NULL,
  context TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  consequences JSONB NOT NULL DEFAULT '{}',
  impact JSONB NOT NULL DEFAULT '{}', -- {perf,cost,complexity,risk}
  rollback_plan TEXT,
  superseded_by UUID REFERENCES leo_adrs(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_adr_number ON leo_adrs(prd_id, adr_number);
CREATE INDEX IF NOT EXISTS idx_adr_status ON leo_adrs(status, created_at);

COMMENT ON TABLE leo_adrs IS 'Architecture Decision Records for PLAN+ phase';

-- Interface Specifications
CREATE TABLE IF NOT EXISTS leo_interfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('openapi','asyncapi','graphql','grpc','typescript','jsonschema')),
  spec JSONB NOT NULL,
  version TEXT NOT NULL,
  validation_status TEXT CHECK (validation_status IN ('valid','invalid','pending')),
  validation_errors JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interface_prd ON leo_interfaces(prd_id, kind);
CREATE INDEX IF NOT EXISTS idx_interface_validation ON leo_interfaces(validation_status);

COMMENT ON TABLE leo_interfaces IS 'API and interface contracts for PLAN+ phase';

-- Test Plans
CREATE TABLE IF NOT EXISTS leo_test_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id TEXT NOT NULL,
  coverage_target NUMERIC(5,2) NOT NULL CHECK (coverage_target >= 0 AND coverage_target <= 100),
  matrices JSONB NOT NULL DEFAULT '{}', -- {unit,integration,e2e,a11y,perf,security}
  test_scenarios JSONB NOT NULL DEFAULT '[]',
  regression_suite JSONB DEFAULT '[]',
  smoke_tests JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_test_plan_prd ON leo_test_plans(prd_id);

COMMENT ON TABLE leo_test_plans IS 'Test planning artifacts for PLAN+ phase';

-- NFR Requirements
CREATE TABLE IF NOT EXISTS leo_nfr_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id TEXT NOT NULL,
  perf_budget_ms INTEGER CHECK (perf_budget_ms > 0),
  bundle_kb INTEGER CHECK (bundle_kb > 0),
  memory_mb INTEGER CHECK (memory_mb > 0),
  cpu_percent INTEGER CHECK (cpu_percent >= 0 AND cpu_percent <= 100),
  a11y_level TEXT CHECK (a11y_level IN ('WCAG2.0-A','WCAG2.0-AA','WCAG2.0-AAA','WCAG2.1-A','WCAG2.1-AA','WCAG2.1-AAA')),
  security_profile TEXT CHECK (security_profile IN ('baseline','standard','enhanced','maximum')),
  compliance_standards JSONB DEFAULT '[]', -- ['OWASP-Top10','GDPR','SOC2','HIPAA']
  telemetry_spec JSONB DEFAULT '{}',
  sla_requirements JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_nfr_prd ON leo_nfr_requirements(prd_id);

COMMENT ON TABLE leo_nfr_requirements IS 'Non-functional requirements for PLAN+ phase';

-- ============================================
-- Risk Spikes Table
-- ============================================
CREATE TABLE IF NOT EXISTS leo_risk_spikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id TEXT NOT NULL,
  risk_title TEXT NOT NULL,
  risk_description TEXT NOT NULL,
  spike_duration_days NUMERIC(3,1) NOT NULL CHECK (spike_duration_days > 0 AND spike_duration_days <= 5),
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('identified','in_progress','completed','mitigated','accepted')),
  findings TEXT,
  mitigation_plan TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_spike_prd ON leo_risk_spikes(prd_id, status);

COMMENT ON TABLE leo_risk_spikes IS 'Technical risk spikes with time-boxed investigation';

-- ============================================
-- Compliance Alerts Table
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('filesystem_drift','boundary_violation','missing_artifact','gate_failure','timeout')),
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','error','critical')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_unresolved ON compliance_alerts(alert_type, severity) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_compliance_created ON compliance_alerts(created_at DESC);

COMMENT ON TABLE compliance_alerts IS 'Tracks compliance violations and drift detection';
COMMENT ON COLUMN compliance_alerts.alert_type IS 'Type of compliance issue detected';

-- ============================================
-- LEO Artifacts Table (General Purpose)
-- ============================================
CREATE TABLE IF NOT EXISTS leo_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_name TEXT NOT NULL,
  content JSONB,
  file_path TEXT,
  checksum TEXT,
  version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifact_prd ON leo_artifacts(prd_id, artifact_type);
CREATE UNIQUE INDEX IF NOT EXISTS ux_artifact_name ON leo_artifacts(prd_id, artifact_type, artifact_name);

COMMENT ON TABLE leo_artifacts IS 'General artifact storage for PLAN+ phase';

-- ============================================
-- Add RLS Policies
-- ============================================
ALTER TABLE leo_gate_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_validation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_adrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_interfaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_test_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_nfr_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_risk_spikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_artifacts ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies (adjust based on auth strategy)
CREATE POLICY "Enable read access for all users" ON leo_gate_reviews FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON sub_agent_executions FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON leo_validation_rules FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON leo_adrs FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON leo_interfaces FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON leo_test_plans FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON leo_nfr_requirements FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON leo_risk_spikes FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON compliance_alerts FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON leo_artifacts FOR SELECT USING (true);

-- ============================================
-- Initial Validation Rules Seed Data
-- ============================================
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required) VALUES
-- Gate 2A: Planning & Architecture (Total: 1.000)
('2A', 'has_adrs', 0.350, '{"min_count": 1, "check": "Architecture decisions documented"}', true),
('2A', 'has_interfaces', 0.350, '{"min_count": 1, "check": "API contracts defined"}', true),
('2A', 'has_tech_design', 0.300, '{"min_count": 1, "check": "Technical design document exists"}', true),

-- Gate 2B: Design & Database (Total: 1.000)
('2B', 'has_wireframes', 0.400, '{"check": "UI/UX wireframes provided"}', false),
('2B', 'has_db_schema', 0.350, '{"check": "Database schema defined"}', false),
('2B', 'has_a11y_audit', 0.250, '{"check": "Accessibility audit completed"}', false),

-- Gate 2C: Security & Risk (Total: 1.000)
('2C', 'security_scan_clean', 0.400, '{"check": "Security scan passed"}', true),
('2C', 'risk_spikes_complete', 0.350, '{"check": "Risk spikes investigated"}', true),
('2C', 'threat_model_exists', 0.250, '{"check": "Threat model documented"}', false),

-- Gate 2D: NFR & Testing (Total: 1.000)
('2D', 'nfr_defined', 0.300, '{"check": "NFR requirements specified"}', true),
('2D', 'test_plan_complete', 0.400, '{"check": "Test plan with scenarios"}', true),
('2D', 'perf_budget_set', 0.300, '{"check": "Performance budgets defined"}', true),

-- Gate 3: Final Verification (Total: 1.000)
('3', 'all_gates_passed', 0.400, '{"min_score": 85, "check": "Gates 2A-2D passed"}', true),
('3', 'sub_agents_complete', 0.300, '{"check": "All sub-agents reported"}', true),
('3', 'no_critical_alerts', 0.300, '{"check": "No unresolved critical alerts"}', true)
ON CONFLICT (gate, rule_name) WHERE active = true
DO UPDATE SET 
  weight = EXCLUDED.weight,
  criteria = EXCLUDED.criteria,
  required = EXCLUDED.required;

-- ============================================
-- Helper Functions
-- ============================================

-- Function to calculate gate score
CREATE OR REPLACE FUNCTION calculate_gate_score(p_prd_id TEXT, p_gate TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_score NUMERIC := 0;
  v_rule RECORD;
BEGIN
  FOR v_rule IN 
    SELECT * FROM leo_validation_rules 
    WHERE gate = p_gate AND active = true
  LOOP
    -- Check rule criteria (simplified - expand based on actual checks)
    -- This is a placeholder - actual implementation would check the specific tables
    v_score := v_score + (v_rule.weight * 100);
  END LOOP;
  
  RETURN LEAST(v_score, 100);
END;
$$ LANGUAGE plpgsql;

-- Function to check for filesystem drift
CREATE OR REPLACE FUNCTION check_compliance_status()
RETURNS TABLE(alert_type TEXT, count BIGINT, severity TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ca.alert_type,
    COUNT(*) as count,
    MAX(ca.severity) as severity
  FROM compliance_alerts ca
  WHERE ca.resolved = false
  GROUP BY ca.alert_type;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Grants (adjust based on your user model)
-- ============================================
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================
-- Migration Complete
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'LEO Protocol Dashboard schema (PR-1) created successfully';
  RAISE NOTICE 'Tables created: leo_gate_reviews, sub_agent_executions, leo_validation_rules, leo_adrs, leo_interfaces, leo_test_plans, leo_nfr_requirements, leo_risk_spikes, compliance_alerts, leo_artifacts';
  RAISE NOTICE 'Initial validation rules seeded for gates 2A-3';
END $$;