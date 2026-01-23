-- ============================================================================
-- Migration: AEGIS Phase 4 Rules - Hard Halt, Manifesto Mode, Doctrine
-- ============================================================================
-- SD: SD-AEGIS-GOVERNANCE-001
-- Phase: 4 - Doctrine & System State Migration
-- Date: 2026-01-24
-- Purpose: Add governance rules for Hard Halt Protocol, Manifesto Mode,
--          and Doctrine of Constraint to the unified AEGIS system.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Insert Hard Halt Protocol Rules
-- ============================================================================

INSERT INTO aegis_rules (
  constitution_id,
  rule_code,
  rule_name,
  rule_text,
  category,
  severity,
  enforcement_action,
  validation_type,
  validation_config,
  source_document,
  version
)
SELECT
  c.id,
  v.rule_code,
  v.rule_name,
  v.rule_text,
  v.category,
  v.severity,
  v.enforcement_action,
  v.validation_type,
  v.validation_config::jsonb,
  v.source_document,
  1
FROM aegis_constitutions c,
(VALUES
  (
    'HALT-001',
    'Dead-Man Switch Timeout',
    'When Chairman activity exceeds timeout threshold, system must auto-halt. No Chairman activity for 72+ hours triggers Hard Halt.',
    'safety',
    'CRITICAL',
    'BLOCK',
    'threshold',
    '{"field": "hours_since_activity", "operator": "lt", "value": 72, "warning_threshold": 48}',
    'EVA Manifesto Part IV: Continuity & Succession'
  ),
  (
    'HALT-002',
    'L2+ Operations Blocked During Halt',
    'When system is in Hard Halt state, all L2+ (CEO and above) autonomous operations must cease. L4 (Crews) may complete in-flight tasks.',
    'safety',
    'CRITICAL',
    'BLOCK',
    'custom',
    '{"check": "l2_plus_blocked_when_halted", "exempt_levels": ["L4", "L4_CREW"]}',
    'EVA Manifesto Part IV: Continuity & Succession'
  ),
  (
    'HALT-003',
    'Halt Trigger Authority',
    'Only Chairman (L0/L1) authority or system dead-man switch can trigger Hard Halt.',
    'authority',
    'CRITICAL',
    'BLOCK',
    'role_forbidden',
    '{"allowed_roles": ["L0_CHAIRMAN", "L1_CHAIRMAN", "L0", "L1", "SYSTEM_DEAD_MAN_SWITCH"], "action": "trigger_halt"}',
    'EVA Manifesto Part IV: Continuity & Succession'
  ),
  (
    'HALT-004',
    'Halt Restore Authority',
    'Only Chairman (L0/L1) authority can restore operations after Hard Halt.',
    'authority',
    'CRITICAL',
    'BLOCK',
    'role_forbidden',
    '{"allowed_roles": ["L0_CHAIRMAN", "L1_CHAIRMAN", "L0", "L1"], "action": "restore_halt"}',
    'EVA Manifesto Part IV: Continuity & Succession'
  )
) AS v(rule_code, rule_name, rule_text, category, severity, enforcement_action, validation_type, validation_config, source_document)
WHERE c.code = 'HARD_HALT'
ON CONFLICT (constitution_id, rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  source_document = EXCLUDED.source_document,
  updated_at = NOW();

-- ============================================================================
-- PHASE 2: Insert Manifesto Mode Rules
-- ============================================================================

INSERT INTO aegis_rules (
  constitution_id,
  rule_code,
  rule_name,
  rule_text,
  category,
  severity,
  enforcement_action,
  validation_type,
  validation_config,
  source_document,
  version
)
SELECT
  c.id,
  v.rule_code,
  v.rule_name,
  v.rule_text,
  v.category,
  v.severity,
  v.enforcement_action,
  v.validation_type,
  v.validation_config::jsonb,
  v.source_document,
  1
FROM aegis_constitutions c,
(VALUES
  (
    'MANIF-001',
    'Manifesto Activation Authority',
    'Only L0_CHAIRMAN can activate manifesto mode (Constitution Signing). This is a ceremonial act that cannot be delegated.',
    'authority',
    'CRITICAL',
    'BLOCK',
    'role_forbidden',
    '{"allowed_roles": ["L0_CHAIRMAN"], "action": "activate_manifesto"}',
    'SD-MANIFESTO-004: Manifesto Mode Activation System'
  ),
  (
    'MANIF-002',
    'L2+ Operation Verification',
    'When manifesto is active, L2+ operations must be logged for audit and require Four Oaths enforcement.',
    'audit',
    'HIGH',
    'WARN_AND_LOG',
    'custom',
    '{"check": "l2_plus_operation_logging", "l2_plus_operations": ["venture_creation", "venture_pivot", "venture_termination", "budget_allocation", "agent_deployment", "strategic_directive", "crew_kickoff", "eva_decision"]}',
    'SD-MANIFESTO-004: Manifesto Mode Activation System'
  ),
  (
    'MANIF-003',
    'Manifesto Version Update Authority',
    'Only L0_CHAIRMAN can update manifesto version (amendments). Version updates must include changelog.',
    'authority',
    'HIGH',
    'BLOCK',
    'role_forbidden',
    '{"allowed_roles": ["L0_CHAIRMAN"], "action": "update_manifesto_version", "required_fields": ["changelog"]}',
    'SD-MANIFESTO-004: Manifesto Mode Activation System'
  ),
  (
    'MANIF-004',
    'Manifesto Deactivation Requirements',
    'Manifesto deactivation requires L0_CHAIRMAN authority and a MANDATORY reason. Emergency use only.',
    'authority',
    'CRITICAL',
    'BLOCK',
    'field_check',
    '{"required_fields": ["reason"], "allowed_roles": ["L0_CHAIRMAN"], "action": "deactivate_manifesto"}',
    'SD-MANIFESTO-004: Manifesto Mode Activation System'
  )
) AS v(rule_code, rule_name, rule_text, category, severity, enforcement_action, validation_type, validation_config, source_document)
WHERE c.code = 'MANIFESTO_MODE'
ON CONFLICT (constitution_id, rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  source_document = EXCLUDED.source_document,
  updated_at = NOW();

-- ============================================================================
-- PHASE 3: Insert Doctrine of Constraint Rules
-- ============================================================================

INSERT INTO aegis_rules (
  constitution_id,
  rule_code,
  rule_name,
  rule_text,
  category,
  severity,
  enforcement_action,
  validation_type,
  validation_config,
  source_document,
  version
)
SELECT
  c.id,
  v.rule_code,
  v.rule_name,
  v.rule_text,
  v.category,
  v.severity,
  v.enforcement_action,
  v.validation_type,
  v.validation_config::jsonb,
  v.source_document,
  1
FROM aegis_constitutions c,
(VALUES
  (
    'DOC-001',
    'EXEC Cannot Create Strategic Directives',
    'EXEC agents are DATABASE-FORBIDDEN from creating Strategic Directives. They execute; they do not think. Intelligence without authority is a bug.',
    'governance',
    'CRITICAL',
    'BLOCK',
    'role_forbidden',
    '{"forbidden_roles": ["EXEC"], "target_tables": ["strategic_directives_v2"], "operations": ["INSERT"]}',
    'Law 1: Doctrine of Constraint - EHG Immutable Laws v9.0.0'
  ),
  (
    'DOC-002',
    'EXEC Cannot Modify PRD Scope',
    'EXEC agents are DATABASE-FORBIDDEN from modifying PRD scope. Scope expansion requires PLAN phase and LEAD approval.',
    'governance',
    'CRITICAL',
    'BLOCK',
    'role_forbidden',
    '{"forbidden_roles": ["EXEC"], "target_tables": ["product_requirements_v2"], "operations": ["INSERT", "UPDATE"]}',
    'Law 1: Doctrine of Constraint - EHG Immutable Laws v9.0.0'
  ),
  (
    'DOC-003',
    'EXEC Cannot Log Governance Events',
    'EXEC agents may only log implementation events (TASK_COMPLETED, TEST_PASSED, etc.). Governance events require LEAD/PLAN authority.',
    'governance',
    'HIGH',
    'BLOCK',
    'role_forbidden',
    '{"forbidden_roles": ["EXEC"], "forbidden_events": ["SD_CREATED", "SD_MODIFIED", "SD_SCOPE_EXPANDED", "PRD_CREATED", "PRD_MODIFIED", "PRD_SCOPE_EXPANDED", "STRATEGIC_PIVOT", "DIRECTIVE_ISSUED", "CHAIRMAN_DECISION_CREATED", "PROTOCOL_MODIFIED"]}',
    'Law 1: Doctrine of Constraint - EHG Immutable Laws v9.0.0'
  ),
  (
    'DOC-004',
    'EXEC Cannot Modify Protocols',
    'EXEC agents are DATABASE-FORBIDDEN from modifying LEO protocols or protocol sections. Protocol changes require governance review.',
    'governance',
    'CRITICAL',
    'BLOCK',
    'role_forbidden',
    '{"forbidden_roles": ["EXEC"], "target_tables": ["leo_protocols", "leo_protocol_sections", "chairman_decisions"], "operations": ["INSERT", "UPDATE", "DELETE"]}',
    'Law 1: Doctrine of Constraint - EHG Immutable Laws v9.0.0'
  )
) AS v(rule_code, rule_name, rule_text, category, severity, enforcement_action, validation_type, validation_config, source_document)
WHERE c.code = 'DOCTRINE'
ON CONFLICT (constitution_id, rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  rule_text = EXCLUDED.rule_text,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  enforcement_action = EXCLUDED.enforcement_action,
  validation_type = EXCLUDED.validation_type,
  validation_config = EXCLUDED.validation_config,
  source_document = EXCLUDED.source_document,
  updated_at = NOW();

-- ============================================================================
-- PHASE 4: Verification
-- ============================================================================

DO $$
DECLARE
  halt_rules INTEGER;
  manifesto_rules INTEGER;
  doctrine_rules INTEGER;
BEGIN
  SELECT COUNT(*) INTO halt_rules
  FROM aegis_rules r
  JOIN aegis_constitutions c ON r.constitution_id = c.id
  WHERE c.code = 'HARD_HALT';

  SELECT COUNT(*) INTO manifesto_rules
  FROM aegis_rules r
  JOIN aegis_constitutions c ON r.constitution_id = c.id
  WHERE c.code = 'MANIFESTO_MODE';

  SELECT COUNT(*) INTO doctrine_rules
  FROM aegis_rules r
  JOIN aegis_constitutions c ON r.constitution_id = c.id
  WHERE c.code = 'DOCTRINE';

  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║           AEGIS PHASE 4 RULES INSTALLED                              ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'HARD_HALT rules:       %', halt_rules;
  RAISE NOTICE 'MANIFESTO_MODE rules:  %', manifesto_rules;
  RAISE NOTICE 'DOCTRINE rules:        %', doctrine_rules;
  RAISE NOTICE '';
  RAISE NOTICE 'Total Phase 4 rules: %', halt_rules + manifesto_rules + doctrine_rules;
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- DELETE FROM aegis_rules WHERE rule_code LIKE 'HALT-%';
-- DELETE FROM aegis_rules WHERE rule_code LIKE 'MANIF-%';
-- DELETE FROM aegis_rules WHERE rule_code LIKE 'DOC-%';
-- ============================================================================
