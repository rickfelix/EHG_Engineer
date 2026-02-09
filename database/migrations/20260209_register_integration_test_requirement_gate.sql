-- Migration: Register GATE_INTEGRATION_TEST_REQUIREMENT in validation_gate_registry
-- SD: SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-E
-- Date: 2026-02-09
--
-- This gate checks for integration tests in tests/integration/ for complex SDs.
-- BLOCKING (REQUIRED) for feature/refactor with story_points >= 5.
-- ADVISORY (OPTIONAL) for other complex SDs.

INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'feature', 'REQUIRED', 'Feature SDs with SP>=5 require integration tests (BLOCKING)'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'refactor', 'REQUIRED', 'Refactor SDs with SP>=5 require integration tests (BLOCKING)'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'bugfix', 'OPTIONAL', 'Advisory integration test check for complex bugfix SDs'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'security', 'OPTIONAL', 'Advisory integration test check for complex security SDs'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'infrastructure', 'OPTIONAL', 'Advisory integration test check for complex infrastructure SDs'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'enhancement', 'OPTIONAL', 'Advisory integration test check for complex enhancement SDs'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'orchestrator', 'OPTIONAL', 'Advisory integration test check for complex orchestrator SDs'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'uat', 'OPTIONAL', 'Advisory integration test check for complex UAT SDs'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'database', 'OPTIONAL', 'Advisory integration test check for complex database SDs'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'documentation', 'OPTIONAL', 'Advisory integration test check for complex documentation SDs'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'docs', 'OPTIONAL', 'Advisory integration test check for complex docs SDs'),
  ('GATE_INTEGRATION_TEST_REQUIREMENT', 'process', 'OPTIONAL', 'Advisory integration test check for complex process SDs')
ON CONFLICT (gate_key, COALESCE(sd_type, '*'), COALESCE(validation_profile, '*'))
DO NOTHING;
