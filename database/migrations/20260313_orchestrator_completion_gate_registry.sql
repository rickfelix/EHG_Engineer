-- Migration: Register orchestrator completion validation gates in the gate registry
-- SD: SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001
-- Purpose: Adds registry entries for the 4 orchestrator completion gates so the
--          gate-policy-resolver can apply SD-type-specific applicability rules.
-- Note: chk_gate_registry_scope requires sd_type OR validation_profile to be non-null.

INSERT INTO validation_gate_registry (gate_key, validation_profile, applicability, reason)
VALUES
  ('SMOKE_TEST_GATE', 'orchestrator_completion', 'OPTIONAL', 'Orchestrator completion: smoke test execution via smoke_test_cmd (child -A)'),
  ('ACCEPTANCE_CRITERIA_TRACE', 'orchestrator_completion', 'OPTIONAL', 'Orchestrator completion: acceptance criteria traceability (child -B placeholder)'),
  ('WIRE_CHECK_GATE', 'orchestrator_completion', 'OPTIONAL', 'Orchestrator completion: integration wire-check verification (child -C placeholder)'),
  ('UAT_GATE', 'orchestrator_completion', 'OPTIONAL', 'Orchestrator completion: user acceptance testing gate (child -D placeholder)')
ON CONFLICT DO NOTHING;
