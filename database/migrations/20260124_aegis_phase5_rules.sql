-- ============================================================================
-- AEGIS Phase 5: Crew Governance & Compliance Rules Migration
-- ============================================================================
-- Adds rules for:
-- - Crew Governance (CREW-001 to CREW-005)
-- - Compliance Policies (COMP-001 to COMP-006)
--
-- @implements SD-AEGIS-GOVERNANCE-001
-- ============================================================================

-- Ensure CREW_GOVERNANCE constitution exists
INSERT INTO aegis_constitutions (id, code, name, description, domain, enforcement_mode, is_active)
VALUES (
  'const-crew',
  'CREW_GOVERNANCE',
  'Crew Governance',
  'Budget and semantic guardrails for crew agents',
  'execution',
  'enforced',
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  domain = EXCLUDED.domain,
  enforcement_mode = EXCLUDED.enforcement_mode,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Ensure COMPLIANCE constitution exists
INSERT INTO aegis_constitutions (id, code, name, description, domain, enforcement_mode, is_active)
VALUES (
  'const-compliance',
  'COMPLIANCE',
  'Compliance Policies',
  'External compliance requirements',
  'compliance',
  'enforced',
  true
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  domain = EXCLUDED.domain,
  enforcement_mode = EXCLUDED.enforcement_mode,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ============================================================================
-- CREW GOVERNANCE RULES
-- ============================================================================

-- CREW-001: Venture ID Required
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-crew-001',
  'const-crew',
  'CREW-001',
  'Venture ID Required',
  'venture_id is MANDATORY for crew execution (GOVERNED-ENGINE-v5.1.0)',
  'governance',
  'CRITICAL',
  'BLOCK',
  'field_check',
  '{"required_fields": ["venture_id"]}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- CREW-002: PRD ID Required
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-crew-002',
  'const-crew',
  'CREW-002',
  'PRD ID Required',
  'prd_id is REQUIRED for crew execution except meta-operations',
  'governance',
  'HIGH',
  'BLOCK',
  'custom',
  '{"check": "prd_required_unless_meta", "meta_operations": ["health_check", "status_report", "eva_scan", "system_diagnostic"]}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- CREW-003: Budget Validation
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-crew-003',
  'const-crew',
  'CREW-003',
  'Budget Validation',
  'Budget must be validated before crew execution starts - no execution with zero budget',
  'governance',
  'CRITICAL',
  'BLOCK',
  'threshold',
  '{"field": "budget_remaining", "operator": "gt", "value": 0}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- CREW-004: Budget Monitoring
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-crew-004',
  'const-crew',
  'CREW-004',
  'Budget Monitoring',
  'Budget must be monitored during crew execution with kill switch at 0% and warning at 20%',
  'safety',
  'HIGH',
  'WARN_AND_LOG',
  'threshold',
  '{"field": "budget_percentage", "operator": "gt", "value": 0.2, "warning_threshold": 0.2, "kill_threshold": 0}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- CREW-005: Semantic Validation
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-crew-005',
  'const-crew',
  'CREW-005',
  'Semantic Validation',
  'Crew outputs must pass semantic validation (60/40 Truth Law)',
  'integrity',
  'HIGH',
  'WARN_AND_LOG',
  'custom',
  '{"check": "semantic_validation", "truth_ratio": 0.6}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ============================================================================
-- COMPLIANCE RULES
-- ============================================================================

-- COMP-001: Data Retention Policy
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-comp-001',
  'const-compliance',
  'COMP-001',
  'Data Retention Policy',
  'Data must be retained for minimum required periods: audit_logs=365d, execution_logs=90d, pii_data=30d, session_data=7d',
  'compliance',
  'HIGH',
  'WARN_AND_LOG',
  'threshold',
  '{"retention_days": {"audit_logs": 365, "execution_logs": 90, "pii_data": 30, "session_data": 7}}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- COMP-002: PII Handling Requirements
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-comp-002',
  'const-compliance',
  'COMP-002',
  'PII Handling Requirements',
  'PII must be encrypted for storage/transmission and masked for logging',
  'compliance',
  'CRITICAL',
  'BLOCK',
  'custom',
  '{"check": "pii_handling", "pii_patterns": ["email", "phone", "ssn", "social_security", "credit_card", "card_number", "password", "secret", "api_key", "token"]}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- COMP-003: Audit Logging Requirements
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-comp-003',
  'const-compliance',
  'COMP-003',
  'Audit Logging Requirements',
  'Audit entries must include actor, action, timestamp, resource_type, and resource_id',
  'audit',
  'HIGH',
  'BLOCK',
  'field_check',
  '{"required_fields": ["actor", "action", "timestamp", "resource_type", "resource_id"]}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- COMP-004: Access Control Enforcement
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-comp-004',
  'const-compliance',
  'COMP-004',
  'Access Control Enforcement',
  'Access levels must be validated: public, internal, confidential, restricted',
  'compliance',
  'CRITICAL',
  'BLOCK',
  'custom',
  '{"check": "access_control", "valid_levels": ["public", "internal", "confidential", "restricted"]}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- COMP-005: Secret Management Policy
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-comp-005',
  'const-compliance',
  'COMP-005',
  'Secret Management Policy',
  'Secrets must never be logged, stored in code, or transmitted in plaintext',
  'compliance',
  'CRITICAL',
  'BLOCK',
  'custom',
  '{"check": "secret_handling", "secret_patterns": ["password", "secret", "api_key", "token", "private_key", "credentials"]}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- COMP-006: Change Management Policy
INSERT INTO aegis_rules (
  id, constitution_id, rule_code, rule_name, rule_text,
  category, severity, enforcement_action,
  validation_type, validation_config, is_active
)
VALUES (
  'rule-comp-006',
  'const-compliance',
  'COMP-006',
  'Change Management Policy',
  'Schema, RLS, trigger, and function changes require documented approval',
  'governance',
  'HIGH',
  'BLOCK',
  'custom',
  '{"check": "change_management", "approval_required": ["schema_change", "rls_policy_change", "trigger_modification", "function_modification"]}',
  true
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
  crew_count INTEGER;
  comp_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO crew_count FROM aegis_rules WHERE rule_code LIKE 'CREW-%';
  SELECT COUNT(*) INTO comp_count FROM aegis_rules WHERE rule_code LIKE 'COMP-%';

  RAISE NOTICE '=== AEGIS Phase 5 Rules Verification ===';
  RAISE NOTICE 'Crew Governance rules: %', crew_count;
  RAISE NOTICE 'Compliance rules: %', comp_count;
  RAISE NOTICE 'Total Phase 5 rules: %', crew_count + comp_count;

  IF crew_count < 5 OR comp_count < 6 THEN
    RAISE EXCEPTION 'Phase 5 rule count verification failed';
  END IF;
END $$;
