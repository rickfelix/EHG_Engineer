-- Migration: Add smoke_test_cmd column to product_requirements_v2
-- SD: SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-A
-- Purpose: Stores an executable command that validates SD delivery via exit-code check.
--          Used by the SMOKE_TEST_GATE at LEAD-FINAL-APPROVAL.

ALTER TABLE product_requirements_v2
  ADD COLUMN IF NOT EXISTS smoke_test_cmd TEXT;

COMMENT ON COLUMN product_requirements_v2.smoke_test_cmd IS
  'Optional shell command executed by SMOKE_TEST_GATE during LEAD-FINAL-APPROVAL. Exit 0 = pass.';
