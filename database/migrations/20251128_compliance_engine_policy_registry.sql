-- SD-AUTO-COMPLIANCE-ENGINE-001: Continuous Compliance Engine Tables
-- Created: 2025-11-28
-- Purpose: Policy Registry for configurable compliance rules with JSONB storage

-- Table: compliance_policies - JSONB-based LEO rules storage with versioning
CREATE TABLE IF NOT EXISTS compliance_policies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_id TEXT NOT NULL UNIQUE, -- e.g., 'CREWAI-001', 'DOSSIER-001'
  policy_name TEXT NOT NULL,
  policy_version INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL CHECK (category IN ('crewai', 'dossier', 'session', 'integration', 'custom')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,

  -- JSONB rule configuration
  rule_config JSONB NOT NULL DEFAULT '{}',
  -- rule_config schema:
  -- {
  --   "check_type": "table_exists" | "row_count" | "field_exists" | "custom",
  --   "target_table": "crewai_agents",
  --   "where_clause": "stage = $1",
  --   "expected_condition": "count >= 1",
  --   "custom_function": "check_crewai_agents"
  -- }

  -- Validation targets
  applicable_stages JSONB DEFAULT '[]', -- Array of stage numbers, empty = all

  -- Remediation guidance
  remediation_template TEXT, -- Template for auto-generated SD
  remediation_priority TEXT DEFAULT 'medium' CHECK (remediation_priority IN ('critical', 'high', 'medium', 'low')),

  -- Audit
  created_by TEXT DEFAULT 'system',
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Versioning support
  superseded_by UUID REFERENCES compliance_policies(id),
  supersedes UUID REFERENCES compliance_policies(id)
);

-- Table: compliance_events - Normalized compliance events for external consumers
CREATE TABLE IF NOT EXISTS compliance_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE, -- Unique event identifier
  event_type TEXT NOT NULL CHECK (event_type IN (
    'check_started', 'check_completed', 'check_failed',
    'violation_detected', 'violation_resolved',
    'policy_changed', 'remediation_created'
  )),
  check_id UUID REFERENCES compliance_checks(id) ON DELETE SET NULL,
  policy_id TEXT REFERENCES compliance_policies(policy_id),
  stage_number INTEGER CHECK (stage_number BETWEEN 1 AND 40),

  -- Event data
  severity TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}',

  -- For UI consumption
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  -- Timestamps
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_compliance_policies_policy_id ON compliance_policies(policy_id);
CREATE INDEX IF NOT EXISTS idx_compliance_policies_category ON compliance_policies(category);
CREATE INDEX IF NOT EXISTS idx_compliance_policies_is_active ON compliance_policies(is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_policies_severity ON compliance_policies(severity);

CREATE INDEX IF NOT EXISTS idx_compliance_events_event_type ON compliance_events(event_type);
CREATE INDEX IF NOT EXISTS idx_compliance_events_check_id ON compliance_events(check_id);
CREATE INDEX IF NOT EXISTS idx_compliance_events_policy_id ON compliance_events(policy_id);
CREATE INDEX IF NOT EXISTS idx_compliance_events_severity ON compliance_events(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_events_emitted_at ON compliance_events(emitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_events_is_read ON compliance_events(is_read) WHERE is_read = false;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_compliance_policies_updated_at ON compliance_policies;
CREATE TRIGGER update_compliance_policies_updated_at
  BEFORE UPDATE ON compliance_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE compliance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS compliance_policies_service_role ON compliance_policies;
CREATE POLICY compliance_policies_service_role ON compliance_policies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS compliance_events_service_role ON compliance_events;
CREATE POLICY compliance_events_service_role ON compliance_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read
DROP POLICY IF EXISTS compliance_policies_authenticated_read ON compliance_policies;
CREATE POLICY compliance_policies_authenticated_read ON compliance_policies
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS compliance_events_authenticated_read ON compliance_events;
CREATE POLICY compliance_events_authenticated_read ON compliance_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Comments
COMMENT ON TABLE compliance_policies IS 'CCE Policy Registry: Configurable compliance rules with JSONB configuration';
COMMENT ON TABLE compliance_events IS 'CCE Event Store: Normalized compliance events for UI and external consumers';
COMMENT ON COLUMN compliance_policies.rule_config IS 'JSONB configuration for the compliance check logic';
COMMENT ON COLUMN compliance_policies.applicable_stages IS 'Array of stage numbers this policy applies to, empty = all stages';
COMMENT ON COLUMN compliance_events.event_type IS 'Type of compliance event for routing and filtering';

-- Seed default policies from existing COMPLIANCE_RULES
INSERT INTO compliance_policies (policy_id, policy_name, category, severity, description, rule_config, remediation_template)
VALUES
  ('CREWAI-001', 'CrewAI Agent Registration', 'crewai', 'critical',
   'Stage must have registered CrewAI agents per dossier specification',
   '{"check_type": "row_count", "target_table": "crewai_agents", "where_clause": "stage = $1", "expected_condition": "count >= 1"}',
   'Register CrewAI agents for stage ${stage} according to dossier requirements'),

  ('CREWAI-002', 'CrewAI Crew Configuration', 'crewai', 'critical',
   'Stage must have configured CrewAI crews with proper orchestration',
   '{"check_type": "row_count", "target_table": "crewai_crews", "where_clause": "stage = $1", "expected_condition": "count >= 1"}',
   'Configure CrewAI crews for stage ${stage}'),

  ('CREWAI-003', 'CrewAI Agent-Crew Assignments', 'crewai', 'high',
   'Agents must be properly assigned to crews',
   '{"check_type": "custom", "custom_function": "check_agent_assignments"}',
   'Assign agents to crews for stage ${stage}'),

  ('DOSSIER-001', 'Stage Dossier Documentation', 'dossier', 'high',
   'Stage must have a documented dossier',
   '{"check_type": "row_count", "target_table": "stage_dossiers", "where_clause": "stage_number = $1", "expected_condition": "count >= 1"}',
   'Create dossier documentation for stage ${stage}'),

  ('SESSION-001', 'Session Routing Compliance', 'session', 'medium',
   'Stage session routing must be properly configured',
   '{"check_type": "custom", "custom_function": "check_session_routing"}',
   'Configure session routing for stage ${stage}'),

  ('EXCEPTION-001', 'Exception Documentation', 'custom', 'info',
   'Check for documented exceptions if non-compliant',
   '{"check_type": "custom", "custom_function": "check_exception_status"}',
   NULL)
ON CONFLICT (policy_id) DO NOTHING;
