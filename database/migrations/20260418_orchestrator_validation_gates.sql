-- Migration: Add orchestrator completion validation gates
-- SD: SD-MAN-INFRA-FIX-ORCHESTRATOR-CHILD-001-A
-- Adds smoke_test_cmd column and registers 4 new completion gates

-- Step 1: Add smoke_test_cmd column to product_requirements_v2
ALTER TABLE product_requirements_v2
  ADD COLUMN IF NOT EXISTS smoke_test_cmd TEXT;

COMMENT ON COLUMN product_requirements_v2.smoke_test_cmd IS 'Shell command executed by integration smoke test gate during PLAN-TO-LEAD handoff. Non-zero exit blocks completion.';

-- Step 2: Register 4 orchestrator completion validation gates
-- Schema: (gate_key, sd_type, validation_profile, applicability, reason)
-- One row per gate + sd_type combination

-- GATE_INTEGRATION_SMOKE_TEST: feature, integration, infrastructure, orchestrator
INSERT INTO validation_gate_registry (gate_key, sd_type, validation_profile, applicability, reason)
VALUES
  ('GATE_INTEGRATION_SMOKE_TEST', 'feature', 'orchestrator_completion', 'REQUIRED', 'Executes PRD smoke_test_cmd and verifies exit code 0'),
  ('GATE_INTEGRATION_SMOKE_TEST', 'integration', 'orchestrator_completion', 'REQUIRED', 'Executes PRD smoke_test_cmd and verifies exit code 0'),
  ('GATE_INTEGRATION_SMOKE_TEST', 'infrastructure', 'orchestrator_completion', 'REQUIRED', 'Executes PRD smoke_test_cmd and verifies exit code 0'),
  ('GATE_INTEGRATION_SMOKE_TEST', 'orchestrator', 'orchestrator_completion', 'REQUIRED', 'Executes PRD smoke_test_cmd and verifies exit code 0'),
  -- GATE_ACCEPTANCE_TRACEABILITY: feature, integration, infrastructure, orchestrator, quality
  ('GATE_ACCEPTANCE_TRACEABILITY', 'feature', 'orchestrator_completion', 'REQUIRED', 'Maps vision success criteria to test files'),
  ('GATE_ACCEPTANCE_TRACEABILITY', 'integration', 'orchestrator_completion', 'REQUIRED', 'Maps vision success criteria to test files'),
  ('GATE_ACCEPTANCE_TRACEABILITY', 'infrastructure', 'orchestrator_completion', 'REQUIRED', 'Maps vision success criteria to test files'),
  ('GATE_ACCEPTANCE_TRACEABILITY', 'orchestrator', 'orchestrator_completion', 'REQUIRED', 'Maps vision success criteria to test files'),
  ('GATE_ACCEPTANCE_TRACEABILITY', 'quality', 'orchestrator_completion', 'REQUIRED', 'Maps vision success criteria to test files'),
  -- GATE_WIRE_CHECK: feature, integration, infrastructure
  ('GATE_WIRE_CHECK', 'feature', 'orchestrator_completion', 'REQUIRED', 'Verifies new modules are reachable from entry points via AST call graph'),
  ('GATE_WIRE_CHECK', 'integration', 'orchestrator_completion', 'REQUIRED', 'Verifies new modules are reachable from entry points via AST call graph'),
  ('GATE_WIRE_CHECK', 'infrastructure', 'orchestrator_completion', 'REQUIRED', 'Verifies new modules are reachable from entry points via AST call graph'),
  -- GATE_AUTOMATED_UAT: feature, integration
  ('GATE_AUTOMATED_UAT', 'feature', 'orchestrator_completion', 'REQUIRED', 'Generates and executes automated user journey scenarios from user stories'),
  ('GATE_AUTOMATED_UAT', 'integration', 'orchestrator_completion', 'REQUIRED', 'Generates and executes automated user journey scenarios from user stories')
ON CONFLICT (gate_key, sd_type) DO NOTHING;
