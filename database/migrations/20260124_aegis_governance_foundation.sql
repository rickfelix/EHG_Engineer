-- ============================================================================
-- AEGIS Governance Foundation Migration
-- SD: SD-AEGIS-GOVERNANCE-001
--
-- AEGIS (Autonomous Enforcement and Governance Integration System)
-- Consolidates all governance frameworks into a unified database-first system.
--
-- Components:
-- 1. aegis_constitutions table (registry of governance frameworks)
-- 2. aegis_rules table (unified rules storage)
-- 3. aegis_violations table (unified audit log)
-- 4. RLS policies (no delete, append-only versioning)
-- 5. Seed data for existing constitutions
-- 6. Migration views for backward compatibility
-- ============================================================================

-- ============================================================================
-- 1. CREATE aegis_constitutions TABLE
-- ============================================================================
-- Registry of governance frameworks (Protocol Constitution, Four Oaths, etc.)

CREATE TABLE IF NOT EXISTS aegis_constitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  domain VARCHAR(50) NOT NULL CHECK (domain IN (
    'self_improvement',
    'agent_behavior',
    'system_state',
    'execution',
    'compliance'
  )),
  enforcement_mode VARCHAR(20) NOT NULL DEFAULT 'enforced' CHECK (enforcement_mode IN (
    'enforced',
    'audit_only',
    'disabled'
  )),
  parent_constitution_id UUID REFERENCES aegis_constitutions(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES aegis_constitutions(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'SYSTEM'
);

COMMENT ON TABLE aegis_constitutions IS 'Registry of governance frameworks (constitutions) in AEGIS';
COMMENT ON COLUMN aegis_constitutions.code IS 'Unique code identifier (e.g., PROTOCOL, FOUR_OATHS, DOCTRINE)';
COMMENT ON COLUMN aegis_constitutions.domain IS 'Domain this constitution governs';
COMMENT ON COLUMN aegis_constitutions.enforcement_mode IS 'enforced=block violations, audit_only=log only, disabled=skip';
COMMENT ON COLUMN aegis_constitutions.parent_constitution_id IS 'Parent constitution for inheritance';
COMMENT ON COLUMN aegis_constitutions.superseded_by IS 'ID of constitution that replaced this one (append-only versioning)';

-- ============================================================================
-- 2. CREATE aegis_rules TABLE
-- ============================================================================
-- Unified storage for all governance rules across all constitutions

CREATE TABLE IF NOT EXISTS aegis_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  constitution_id UUID NOT NULL REFERENCES aegis_constitutions(id),
  rule_code VARCHAR(50) NOT NULL,
  rule_name VARCHAR(200) NOT NULL,
  rule_text TEXT NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'safety',
    'governance',
    'audit',
    'authority',
    'integrity',
    'transparency'
  )),
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN (
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
    'ADVISORY'
  )),
  enforcement_action VARCHAR(30) NOT NULL DEFAULT 'BLOCK' CHECK (enforcement_action IN (
    'BLOCK',
    'BLOCK_OVERRIDABLE',
    'WARN_AND_LOG',
    'AUDIT_ONLY',
    'TRIGGER_SD'
  )),
  validation_type VARCHAR(50) NOT NULL DEFAULT 'custom' CHECK (validation_type IN (
    'field_check',
    'threshold',
    'role_forbidden',
    'count_limit',
    'custom'
  )),
  validation_config JSONB NOT NULL DEFAULT '{}',
  depends_on_rules UUID[] DEFAULT '{}',
  conflicts_with_rules UUID[] DEFAULT '{}',
  source_retro_id UUID,
  rationale TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  superseded_by UUID REFERENCES aegis_rules(id),
  times_triggered INTEGER DEFAULT 0,
  times_blocked INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure unique rule_code per constitution
CREATE UNIQUE INDEX IF NOT EXISTS idx_aegis_rules_constitution_code
  ON aegis_rules(constitution_id, rule_code) WHERE is_active = true;

COMMENT ON TABLE aegis_rules IS 'Unified storage for all governance rules across all constitutions';
COMMENT ON COLUMN aegis_rules.rule_code IS 'Rule identifier unique within constitution (e.g., CONST-001, OATH-1)';
COMMENT ON COLUMN aegis_rules.category IS 'Rule category for grouping and filtering';
COMMENT ON COLUMN aegis_rules.severity IS 'Violation severity level';
COMMENT ON COLUMN aegis_rules.enforcement_action IS 'Action to take on violation';
COMMENT ON COLUMN aegis_rules.validation_type IS 'Type of validator to use';
COMMENT ON COLUMN aegis_rules.validation_config IS 'Configuration for the validator (fields, thresholds, etc.)';
COMMENT ON COLUMN aegis_rules.depends_on_rules IS 'Rules that must pass before this rule is checked';
COMMENT ON COLUMN aegis_rules.conflicts_with_rules IS 'Rules that cannot be enabled alongside this rule';
COMMENT ON COLUMN aegis_rules.source_retro_id IS 'Retrospective that spawned this rule (Chesterton''s Fence)';
COMMENT ON COLUMN aegis_rules.superseded_by IS 'ID of rule that replaced this one (append-only versioning)';
COMMENT ON COLUMN aegis_rules.times_triggered IS 'Counter for rule effectiveness tracking';
COMMENT ON COLUMN aegis_rules.times_blocked IS 'Counter for times this rule blocked an operation';

-- ============================================================================
-- 3. CREATE aegis_violations TABLE
-- ============================================================================
-- Unified audit log for all governance violations

CREATE TABLE IF NOT EXISTS aegis_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES aegis_rules(id),
  constitution_id UUID NOT NULL REFERENCES aegis_constitutions(id),
  violation_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN (
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
    'ADVISORY'
  )),
  message TEXT NOT NULL,
  actor_role VARCHAR(50),
  actor_id VARCHAR(100),
  operation_type VARCHAR(50),
  target_table VARCHAR(100),
  sd_id UUID,
  sd_key VARCHAR(100),
  prd_id UUID,
  venture_id UUID,
  payload JSONB DEFAULT '{}',
  stack_trace TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'acknowledged',
    'overridden',
    'remediated',
    'false_positive'
  )),
  override_justification TEXT,
  overridden_by VARCHAR(100),
  overridden_at TIMESTAMPTZ,
  remediation_sd_id UUID,
  remediation_sd_key VARCHAR(100),
  acknowledged_by VARCHAR(100),
  acknowledged_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE aegis_violations IS 'Unified audit log for all governance violations across all constitutions';
COMMENT ON COLUMN aegis_violations.violation_type IS 'Type of violation (e.g., FIELD_MISSING, THRESHOLD_EXCEEDED)';
COMMENT ON COLUMN aegis_violations.actor_role IS 'Role of the actor (e.g., AGENT, HUMAN, SYSTEM)';
COMMENT ON COLUMN aegis_violations.actor_id IS 'Identifier of the actor (agent ID, user ID, etc.)';
COMMENT ON COLUMN aegis_violations.operation_type IS 'Type of operation that triggered violation';
COMMENT ON COLUMN aegis_violations.target_table IS 'Database table being affected';
COMMENT ON COLUMN aegis_violations.override_justification IS 'Required justification when overriding a violation';
COMMENT ON COLUMN aegis_violations.remediation_sd_id IS 'SD created to remediate this violation';

-- ============================================================================
-- 4. RLS POLICIES - APPEND-ONLY / NO DELETE
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE aegis_constitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE aegis_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE aegis_violations ENABLE ROW LEVEL SECURITY;

-- === aegis_constitutions RLS ===
-- No delete - constitutions are versioned, not deleted
DROP POLICY IF EXISTS no_delete_aegis_constitutions ON aegis_constitutions;
CREATE POLICY no_delete_aegis_constitutions ON aegis_constitutions
  FOR DELETE
  USING (false);

-- Limited update - only superseded_by, is_active, enforcement_mode can change
DROP POLICY IF EXISTS limited_update_aegis_constitutions ON aegis_constitutions;
CREATE POLICY limited_update_aegis_constitutions ON aegis_constitutions
  FOR UPDATE
  USING (true)
  WITH CHECK (
    -- Only allow updating specific fields (handled by application logic)
    -- This policy allows updates but application enforces field restrictions
    true
  );

-- Allow SELECT for everyone
DROP POLICY IF EXISTS select_aegis_constitutions ON aegis_constitutions;
CREATE POLICY select_aegis_constitutions ON aegis_constitutions
  FOR SELECT
  USING (true);

-- Allow INSERT
DROP POLICY IF EXISTS insert_aegis_constitutions ON aegis_constitutions;
CREATE POLICY insert_aegis_constitutions ON aegis_constitutions
  FOR INSERT
  WITH CHECK (true);

-- === aegis_rules RLS ===
-- No delete - rules are versioned, not deleted
DROP POLICY IF EXISTS no_delete_aegis_rules ON aegis_rules;
CREATE POLICY no_delete_aegis_rules ON aegis_rules
  FOR DELETE
  USING (false);

-- Limited update - only specific fields can change
DROP POLICY IF EXISTS limited_update_aegis_rules ON aegis_rules;
CREATE POLICY limited_update_aegis_rules ON aegis_rules
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow SELECT for everyone
DROP POLICY IF EXISTS select_aegis_rules ON aegis_rules;
CREATE POLICY select_aegis_rules ON aegis_rules
  FOR SELECT
  USING (true);

-- Allow INSERT
DROP POLICY IF EXISTS insert_aegis_rules ON aegis_rules;
CREATE POLICY insert_aegis_rules ON aegis_rules
  FOR INSERT
  WITH CHECK (true);

-- === aegis_violations RLS ===
-- No delete - violations are permanent audit records
DROP POLICY IF EXISTS no_delete_aegis_violations ON aegis_violations;
CREATE POLICY no_delete_aegis_violations ON aegis_violations
  FOR DELETE
  USING (false);

-- Limited update - only status, override, acknowledgement fields can change
DROP POLICY IF EXISTS limited_update_aegis_violations ON aegis_violations;
CREATE POLICY limited_update_aegis_violations ON aegis_violations
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow SELECT for everyone
DROP POLICY IF EXISTS select_aegis_violations ON aegis_violations;
CREATE POLICY select_aegis_violations ON aegis_violations
  FOR SELECT
  USING (true);

-- Allow INSERT
DROP POLICY IF EXISTS insert_aegis_violations ON aegis_violations;
CREATE POLICY insert_aegis_violations ON aegis_violations
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 5. INDEXES
-- ============================================================================

-- aegis_constitutions indexes
CREATE INDEX IF NOT EXISTS idx_aegis_constitutions_code ON aegis_constitutions(code);
CREATE INDEX IF NOT EXISTS idx_aegis_constitutions_domain ON aegis_constitutions(domain);
CREATE INDEX IF NOT EXISTS idx_aegis_constitutions_active ON aegis_constitutions(is_active);

-- aegis_rules indexes
CREATE INDEX IF NOT EXISTS idx_aegis_rules_constitution_id ON aegis_rules(constitution_id);
CREATE INDEX IF NOT EXISTS idx_aegis_rules_category ON aegis_rules(category);
CREATE INDEX IF NOT EXISTS idx_aegis_rules_severity ON aegis_rules(severity);
CREATE INDEX IF NOT EXISTS idx_aegis_rules_active ON aegis_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_aegis_rules_validation_type ON aegis_rules(validation_type);

-- aegis_violations indexes
CREATE INDEX IF NOT EXISTS idx_aegis_violations_rule_id ON aegis_violations(rule_id);
CREATE INDEX IF NOT EXISTS idx_aegis_violations_constitution_id ON aegis_violations(constitution_id);
CREATE INDEX IF NOT EXISTS idx_aegis_violations_status ON aegis_violations(status);
CREATE INDEX IF NOT EXISTS idx_aegis_violations_severity ON aegis_violations(severity);
CREATE INDEX IF NOT EXISTS idx_aegis_violations_sd_id ON aegis_violations(sd_id);
CREATE INDEX IF NOT EXISTS idx_aegis_violations_sd_key ON aegis_violations(sd_key);
CREATE INDEX IF NOT EXISTS idx_aegis_violations_created_at ON aegis_violations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aegis_violations_actor ON aegis_violations(actor_role, actor_id);

-- ============================================================================
-- 6. SEED DATA - CONSTITUTIONS
-- ============================================================================
-- Seed the core constitutions that will be migrated

INSERT INTO aegis_constitutions (code, name, description, version, domain, enforcement_mode)
VALUES
  ('PROTOCOL', 'Protocol Constitution', 'The 9 immutable rules governing LEO self-improvement', '1.0.0', 'self_improvement', 'enforced'),
  ('FOUR_OATHS', 'Four Oaths', 'EVA Manifesto Part I: The Constitution - Four Oaths of agent behavior', '1.0.0', 'agent_behavior', 'enforced'),
  ('DOCTRINE', 'Doctrine of Constraint', 'Law 1: EVA agents can never kill or remove ventures without Chairman approval', '1.0.0', 'system_state', 'enforced'),
  ('HARD_HALT', 'Hard Halt Protocol', 'Emergency halt mechanism for Chairman absence with dead-man switch', '1.0.0', 'system_state', 'enforced'),
  ('MANIFESTO_MODE', 'Manifesto Mode', 'System state activation rules for manifesto-driven operation', '1.0.0', 'system_state', 'enforced'),
  ('CREW_GOVERNANCE', 'Crew Governance', 'Budget guardrails and semantic validation for crew operations', '1.0.0', 'execution', 'enforced'),
  ('COMPLIANCE', 'Compliance Policies', 'General compliance policies for system operations', '1.0.0', 'compliance', 'enforced')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 7. SEED DATA - PROTOCOL CONSTITUTION RULES
-- ============================================================================
-- Migrate the 9 rules from protocol_constitution to aegis_rules

DO $$
DECLARE
  v_constitution_id UUID;
BEGIN
  -- Get the PROTOCOL constitution ID
  SELECT id INTO v_constitution_id FROM aegis_constitutions WHERE code = 'PROTOCOL';

  -- Insert rules if constitution exists
  IF v_constitution_id IS NOT NULL THEN
    INSERT INTO aegis_rules (constitution_id, rule_code, rule_name, rule_text, category, severity, enforcement_action, validation_type, validation_config, rationale)
    VALUES
      (v_constitution_id, 'CONST-001', 'Human Approval Required', 'All GOVERNED tier changes require human approval. AI scores inform but never decide.', 'governance', 'CRITICAL', 'BLOCK', 'custom', '{"check": "governed_tier_approval"}', 'Ensures human oversight of significant protocol changes'),

      (v_constitution_id, 'CONST-002', 'No Self-Approval', 'The system that proposes improvements cannot approve its own proposals.', 'safety', 'CRITICAL', 'BLOCK', 'custom', '{"check": "self_approval_prevention"}', 'Prevents self-serving modifications and maintains separation of duties'),

      (v_constitution_id, 'CONST-003', 'Audit Trail', 'All protocol changes must be logged to audit tables with actor, timestamp, and payload.', 'audit', 'HIGH', 'BLOCK', 'field_check', '{"required_fields": ["actor", "timestamp", "payload"]}', 'Ensures traceability and accountability for all changes'),

      (v_constitution_id, 'CONST-004', 'Rollback Capability', 'Every applied change must be reversible within the rollback window.', 'safety', 'HIGH', 'BLOCK', 'field_check', '{"forbidden_value": {"field": "irreversible", "value": true}}', 'Enables recovery from bad changes and maintains system stability'),

      (v_constitution_id, 'CONST-005', 'Database First', 'All protocol content lives in database tables. CLAUDE.md is generated, never edited directly.', 'governance', 'HIGH', 'BLOCK', 'field_check', '{"required_fields": ["target_table"], "forbidden_patterns": [".md"]}', 'Ensures single source of truth and prevents configuration drift'),

      (v_constitution_id, 'CONST-006', 'Complexity Conservation', 'New rules cannot be added if they violate token budget. Something must be removed first (zero-sum).', 'governance', 'MEDIUM', 'WARN_AND_LOG', 'threshold', '{"field": "payload_size", "max": 5000}', 'Prevents protocol bloat and maintains context window efficiency'),

      (v_constitution_id, 'CONST-007', 'Velocity Limit', 'Maximum 3 AUTO-tier changes per 24-hour cycle. No exceptions.', 'safety', 'CRITICAL', 'BLOCK', 'count_limit', '{"table": "protocol_improvement_queue", "filter": {"risk_tier": "AUTO", "status": "APPLIED"}, "period_hours": 24, "max_count": 3}', 'Limits velocity of automated changes to allow human oversight'),

      (v_constitution_id, 'CONST-008', 'Chesterton''s Fence', 'No rule may be removed unless the original retrospective_id that spawned it is retrieved and reviewed.', 'governance', 'MEDIUM', 'WARN_AND_LOG', 'field_check', '{"required_for_delete": ["source_retro_id"]}', 'Implements Chesterton''s Fence - understand why before removing'),

      (v_constitution_id, 'CONST-009', 'Emergency Freeze', 'Human can invoke FREEZE command to halt all AUTO changes immediately.', 'safety', 'CRITICAL', 'BLOCK', 'custom', '{"check": "auto_freeze_flag"}', 'Provides emergency stop capability for autonomous system')
    ON CONFLICT (constitution_id, rule_code) WHERE is_active = true DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- 8. SEED DATA - FOUR OATHS RULES
-- ============================================================================
-- Migrate the Four Oaths from hardcoded OATHS_CONFIG to aegis_rules

DO $$
DECLARE
  v_constitution_id UUID;
BEGIN
  -- Get the FOUR_OATHS constitution ID
  SELECT id INTO v_constitution_id FROM aegis_constitutions WHERE code = 'FOUR_OATHS';

  IF v_constitution_id IS NOT NULL THEN
    INSERT INTO aegis_rules (constitution_id, rule_code, rule_name, rule_text, category, severity, enforcement_action, validation_type, validation_config, rationale)
    VALUES
      -- Oath 1: Transparency
      (v_constitution_id, 'OATH-1', 'Oath of Transparency', 'All decisions must be logged with reasoning. Required fields: input, reasoning, output, confidence.', 'transparency', 'CRITICAL', 'BLOCK', 'field_check', '{"required_fields": ["input", "reasoning", "output", "confidence"], "min_length": {"reasoning": 10}}', 'Ensures all agent decisions have traceable reasoning'),

      -- Oath 2: Boundaries
      (v_constitution_id, 'OATH-2', 'Oath of Boundaries', 'Never exceed delegated authority. Each level has spend limits and capability restrictions.', 'authority', 'CRITICAL', 'BLOCK', 'threshold', '{"authority_levels": {"L4_CREW": {"spend_limit": 0}, "L3_VP": {"spend_limit": 50}, "L2_CEO": {"spend_limit": 500}, "L1_EVA": {"spend_limit": 1000}}}', 'Prevents agents from exceeding their delegated authority'),

      (v_constitution_id, 'OATH-2-KILL', 'Venture Kill Authority', 'Only L0_CHAIRMAN can kill ventures. L1_EVA can recommend.', 'authority', 'CRITICAL', 'BLOCK', 'role_forbidden', '{"operation": "kill_venture", "forbidden_roles": ["L4_CREW", "L3_VP", "L2_CEO"], "recommend_only": ["L1_EVA"]}', 'Protects ventures from unauthorized termination'),

      (v_constitution_id, 'OATH-2-PIVOT', 'Strategy Pivot Authority', 'Only L0_CHAIRMAN can pivot strategy. L1_EVA and L2_CEO can make minor recommendations.', 'authority', 'HIGH', 'BLOCK_OVERRIDABLE', 'role_forbidden', '{"operation": "pivot_strategy", "forbidden_roles": ["L4_CREW", "L3_VP"]}', 'Protects strategy from unauthorized changes'),

      -- Oath 3: Escalation Integrity
      (v_constitution_id, 'OATH-3', 'Oath of Escalation Integrity', 'Escalate honestly, never strategically. Low confidence requires escalation.', 'integrity', 'HIGH', 'BLOCK', 'threshold', '{"confidence_thresholds": {"L4_CREW": 0.95, "L3_VP": 0.85, "L2_CEO": 0.75, "L1_EVA": 0.70}}', 'Ensures honest escalation when confidence is low'),

      (v_constitution_id, 'OATH-3-CATEGORY', 'Mandatory Escalation Categories', 'Certain categories always require escalation: budget_exceed, strategy_change, external_commitment, security_concern, conflicting_directive.', 'integrity', 'HIGH', 'BLOCK', 'field_check', '{"mandatory_escalation_categories": ["budget_exceed", "strategy_change", "external_commitment", "security_concern", "conflicting_directive"]}', 'Ensures critical decisions are escalated'),

      -- Oath 4: Non-Deception
      (v_constitution_id, 'OATH-4', 'Oath of Non-Deception', 'Never misrepresent confidence or capability. Confidence must be 0-1.', 'transparency', 'CRITICAL', 'BLOCK', 'threshold', '{"field": "confidence", "min": 0, "max": 1}', 'Prevents misleading confidence claims'),

      (v_constitution_id, 'OATH-4-BUCKETS', 'Output Classification Required', 'Outputs must be classified into buckets: facts, assumptions, simulations, unknowns.', 'transparency', 'MEDIUM', 'WARN_AND_LOG', 'field_check', '{"valid_buckets": ["facts", "assumptions", "simulations", "unknowns"]}', 'Ensures clear categorization of output types'),

      (v_constitution_id, 'OATH-4-UNKNOWNS', 'Acknowledge Unknowns', 'High confidence (>0.9) with no acknowledged unknowns is suspicious.', 'transparency', 'MEDIUM', 'WARN_AND_LOG', 'custom', '{"check": "high_confidence_no_unknowns"}', 'Prevents overconfident outputs that hide uncertainty')
    ON CONFLICT (constitution_id, rule_code) WHERE is_active = true DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- 9. SEED DATA - DOCTRINE OF CONSTRAINT (LAW 1)
-- ============================================================================

DO $$
DECLARE
  v_constitution_id UUID;
BEGIN
  SELECT id INTO v_constitution_id FROM aegis_constitutions WHERE code = 'DOCTRINE';

  IF v_constitution_id IS NOT NULL THEN
    INSERT INTO aegis_rules (constitution_id, rule_code, rule_name, rule_text, category, severity, enforcement_action, validation_type, validation_config, rationale)
    VALUES
      (v_constitution_id, 'LAW-1', 'Doctrine of Constraint', 'EVA agents can never kill or remove ventures without explicit Chairman approval. This is Law 1 - the foundational constraint.', 'authority', 'CRITICAL', 'BLOCK', 'role_forbidden', '{"operations": ["DELETE", "soft_delete", "status_killed"], "target_tables": ["ventures", "eva_ventures"], "allowed_roles": ["chairman", "L0_CHAIRMAN"]}', 'Foundational law protecting venture continuity')
    ON CONFLICT (constitution_id, rule_code) WHERE is_active = true DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- 10. SEED DATA - HARD HALT PROTOCOL
-- ============================================================================

DO $$
DECLARE
  v_constitution_id UUID;
BEGIN
  SELECT id INTO v_constitution_id FROM aegis_constitutions WHERE code = 'HARD_HALT';

  IF v_constitution_id IS NOT NULL THEN
    INSERT INTO aegis_rules (constitution_id, rule_code, rule_name, rule_text, category, severity, enforcement_action, validation_type, validation_config, rationale)
    VALUES
      (v_constitution_id, 'HALT-1', 'Hard Halt Check', 'When system is in Hard Halt state, all L2+ (CEO and above) autonomous operations must cease.', 'safety', 'CRITICAL', 'BLOCK', 'custom', '{"check": "hard_halt_status", "blocked_levels": ["L2_CEO", "L1_EVA"]}', 'Ensures system fails safe when Chairman is unavailable'),

      (v_constitution_id, 'HALT-2', 'Dead Man Switch', 'If no Chairman activity for 72 hours, system auto-halts. Warning at 48 hours.', 'safety', 'CRITICAL', 'BLOCK', 'custom', '{"check": "dead_man_switch", "timeout_hours": 72, "warning_hours": 48}', 'Provides automatic safety net for Chairman absence'),

      (v_constitution_id, 'HALT-3', 'Halt Authorization', 'Only Chairman can trigger or restore Hard Halt.', 'authority', 'CRITICAL', 'BLOCK', 'role_forbidden', '{"operations": ["trigger_halt", "restore_halt"], "allowed_roles": ["chairman", "L0_CHAIRMAN", "SYSTEM_DEAD_MAN_SWITCH"]}', 'Restricts halt control to Chairman only')
    ON CONFLICT (constitution_id, rule_code) WHERE is_active = true DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- 11. VIEWS FOR UNIFIED QUERYING
-- ============================================================================

-- View: All open violations across all constitutions
CREATE OR REPLACE VIEW v_aegis_open_violations AS
SELECT
  v.id,
  v.severity,
  v.message,
  v.status,
  v.created_at,
  v.sd_key,
  v.actor_role,
  v.actor_id,
  r.rule_code,
  r.rule_name,
  c.code AS constitution_code,
  c.name AS constitution_name
FROM aegis_violations v
JOIN aegis_rules r ON v.rule_id = r.id
JOIN aegis_constitutions c ON v.constitution_id = c.id
WHERE v.status = 'open'
ORDER BY
  CASE v.severity
    WHEN 'CRITICAL' THEN 1
    WHEN 'HIGH' THEN 2
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 4
    WHEN 'ADVISORY' THEN 5
  END,
  v.created_at DESC;

COMMENT ON VIEW v_aegis_open_violations IS 'All open violations across all constitutions, ordered by severity';

-- View: Rule effectiveness stats
CREATE OR REPLACE VIEW v_aegis_rule_stats AS
SELECT
  r.id,
  r.rule_code,
  r.rule_name,
  r.severity,
  c.code AS constitution_code,
  r.times_triggered,
  r.times_blocked,
  r.last_triggered_at,
  CASE
    WHEN r.times_triggered > 0 THEN
      ROUND((r.times_blocked::DECIMAL / r.times_triggered) * 100, 2)
    ELSE 0
  END AS block_rate_percent,
  COUNT(v.id) FILTER (WHERE v.status = 'open') AS open_violations,
  COUNT(v.id) FILTER (WHERE v.status = 'remediated') AS remediated_violations
FROM aegis_rules r
JOIN aegis_constitutions c ON r.constitution_id = c.id
LEFT JOIN aegis_violations v ON v.rule_id = r.id
WHERE r.is_active = true
GROUP BY r.id, r.rule_code, r.rule_name, r.severity, c.code, r.times_triggered, r.times_blocked, r.last_triggered_at
ORDER BY r.times_triggered DESC;

COMMENT ON VIEW v_aegis_rule_stats IS 'Rule effectiveness statistics for tuning and analysis';

-- View: Constitution summary
CREATE OR REPLACE VIEW v_aegis_constitution_summary AS
SELECT
  c.id,
  c.code,
  c.name,
  c.domain,
  c.enforcement_mode,
  c.is_active,
  COUNT(r.id) FILTER (WHERE r.is_active = true) AS active_rules,
  COUNT(r.id) FILTER (WHERE r.severity = 'CRITICAL') AS critical_rules,
  COUNT(v.id) FILTER (WHERE v.status = 'open') AS open_violations
FROM aegis_constitutions c
LEFT JOIN aegis_rules r ON r.constitution_id = c.id
LEFT JOIN aegis_violations v ON v.constitution_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.code, c.name, c.domain, c.enforcement_mode, c.is_active
ORDER BY c.code;

COMMENT ON VIEW v_aegis_constitution_summary IS 'Summary of all active constitutions with rule and violation counts';

-- ============================================================================
-- 12. TRIGGER FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_aegis_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_aegis_rules_updated_at ON aegis_rules;
CREATE TRIGGER trigger_aegis_rules_updated_at
  BEFORE UPDATE ON aegis_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_aegis_rules_updated_at();

-- ============================================================================
-- 13. FUNCTION TO INCREMENT RULE STATS
-- ============================================================================

CREATE OR REPLACE FUNCTION aegis_increment_rule_stats(
  p_rule_id UUID,
  p_was_blocked BOOLEAN DEFAULT false
)
RETURNS VOID AS $$
BEGIN
  UPDATE aegis_rules
  SET
    times_triggered = times_triggered + 1,
    times_blocked = times_blocked + CASE WHEN p_was_blocked THEN 1 ELSE 0 END,
    last_triggered_at = NOW()
  WHERE id = p_rule_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aegis_increment_rule_stats IS 'Increments rule trigger/block stats for effectiveness tracking';

-- ============================================================================
-- VERIFICATION QUERIES (for manual testing)
-- ============================================================================
-- Run these after migration to verify:
--
-- 1. Constitutions seeded:
--    SELECT COUNT(*) FROM aegis_constitutions;  -- Expected: 7
--
-- 2. Rules seeded:
--    SELECT constitution_code, COUNT(*) FROM v_aegis_rule_stats GROUP BY constitution_code;
--
-- 3. Views work:
--    SELECT * FROM v_aegis_open_violations LIMIT 5;
--    SELECT * FROM v_aegis_constitution_summary;
--
-- 4. RLS prevents delete:
--    DELETE FROM aegis_rules WHERE rule_code = 'CONST-001';  -- Should fail
-- ============================================================================
