-- SD-LEO-INFRA-UNIVERSAL-PLANNING-COMPLETENESS-003
-- Register GATE_PLANNING_COMPLETENESS in validation_gate_registry
-- Gate is DISABLED for types that have no planning artifacts

INSERT INTO validation_gate_registry (id, gate_key, sd_type, applicability, reason)
VALUES
  (gen_random_uuid(), 'GATE_PLANNING_COMPLETENESS', 'quick_fix', 'DISABLED', 'Quick fixes have no planning artifacts'),
  (gen_random_uuid(), 'GATE_PLANNING_COMPLETENESS', 'uat', 'DISABLED', 'UAT SDs do not require planning completeness'),
  (gen_random_uuid(), 'GATE_PLANNING_COMPLETENESS', 'ux_debt', 'DISABLED', 'UX debt items have minimal planning requirements')
ON CONFLICT DO NOTHING;
