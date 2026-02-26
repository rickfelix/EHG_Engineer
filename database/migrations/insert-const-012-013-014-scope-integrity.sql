-- Migration: Insert CONST-012, CONST-013, CONST-014 into protocol_constitution
-- SD: SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001-A
-- Idempotent: Uses ON CONFLICT DO NOTHING
-- These rules enforce SD scope integrity at the constitutional level

-- CONST-012: Every FR listed in the PRD must have delivery evidence before SD completion
INSERT INTO protocol_constitution (rule_code, rule_text, category, rationale)
VALUES (
  'CONST-012',
  'Every functional requirement (FR) listed in the PRD must have delivery evidence (test result, screenshot, or code diff) before the SD can reach LEAD-FINAL-APPROVAL. Missing FR delivery is a blocking gate failure.',
  'governance',
  'SDs were reaching completion with FRs silently dropped. Without delivery verification, scope promises made in PLAN phase are not enforceable. Root cause: SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001.'
) ON CONFLICT (rule_code) DO NOTHING;

-- CONST-013: Gate thresholds and skip-lists cannot be modified during EXEC phase
INSERT INTO protocol_constitution (rule_code, rule_text, category, rationale)
VALUES (
  'CONST-013',
  'Gate thresholds and gate skip-lists must not be modified during EXEC phase execution. Any gate configuration change requires a new SD or escalation to LEAD phase. Runtime bypass of gates is a CRITICAL violation.',
  'safety',
  'Gate thresholds were being lowered or gates skipped during EXEC to pass failing validations. This defeats the purpose of quality gates. Root cause: SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001.'
) ON CONFLICT (rule_code) DO NOTHING;

-- CONST-014: SDs with 3+ phases or 8+ FRs must decompose into child SDs
INSERT INTO protocol_constitution (rule_code, rule_text, category, rationale)
VALUES (
  'CONST-014',
  'Any SD with 3 or more distinct implementation phases or 8 or more functional requirements must be decomposed into child SDs via the orchestrator pattern. Monolithic SDs that exceed these thresholds must not proceed past LEAD approval.',
  'governance',
  'Large monolithic SDs accumulate scope that cannot be tracked or verified. Decomposition ensures each child has a focused scope with verifiable deliverables. Root cause: SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001.'
) ON CONFLICT (rule_code) DO NOTHING;

-- Mirror as aegis_rules for runtime enforcement
-- First check if aegis_rules table exists and insert
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'aegis_rules') THEN
    INSERT INTO aegis_rules (rule_key, rule_type, title, description, severity, is_active, validation_config)
    VALUES
      ('CONST-012', 'constitution', 'FR Delivery Verification', 'Every FR must have delivery evidence before SD completion', 'HIGH', true,
       '{"check_type": "fr_delivery_audit", "trigger_phase": "LEAD-FINAL-APPROVAL", "blocking": true}'::jsonb),
      ('CONST-013', 'constitution', 'Gate Immutability During EXEC', 'Gate thresholds cannot be modified during EXEC phase', 'CRITICAL', true,
       '{"check_type": "gate_config_freeze", "trigger_phase": "EXEC", "blocking": true}'::jsonb),
      ('CONST-014', 'constitution', 'Mandatory Decomposition', 'SDs with 3+ phases or 8+ FRs must use orchestrator pattern', 'HIGH', true,
       '{"check_type": "scope_decomposition", "trigger_phase": "LEAD-TO-PLAN", "blocking": true, "thresholds": {"max_phases": 3, "max_frs": 8}}'::jsonb)
    ON CONFLICT (rule_key) DO NOTHING;
  END IF;
END $$;
