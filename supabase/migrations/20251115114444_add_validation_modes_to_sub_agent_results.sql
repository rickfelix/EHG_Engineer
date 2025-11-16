-- SD-LEO-PROTOCOL-V4-4-0: Sub-Agent Adaptive Validation System
-- US-001: Database Migration for validation modes
-- Purpose: Add database schema columns to support adaptive validation modes
-- (prospective/retrospective) for sub-agent execution results
-- Author: Database Architecture Team
-- Date: 2025-11-15

-- ============================================================================
-- AC-001: Add validation_mode column with constraints
-- ============================================================================

-- Add validation_mode column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sub_agent_execution_results'
    AND column_name = 'validation_mode'
  ) THEN
    ALTER TABLE sub_agent_execution_results
    ADD COLUMN validation_mode TEXT DEFAULT 'prospective';
  END IF;
END $$;

-- Add CHECK constraint for validation_mode (only if column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sub_agent_execution_results'
    AND column_name = 'validation_mode'
  ) THEN
    -- Drop existing constraint if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'sub_agent_execution_results'
      AND constraint_name = 'check_validation_mode_values'
    ) THEN
      ALTER TABLE sub_agent_execution_results
      DROP CONSTRAINT check_validation_mode_values;
    END IF;

    -- Add the constraint
    ALTER TABLE sub_agent_execution_results
    ADD CONSTRAINT check_validation_mode_values
    CHECK (validation_mode IN ('prospective', 'retrospective'));
  END IF;
END $$;

-- ============================================================================
-- Create index for validation mode filtering (AC-006)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'sub_agent_execution_results'
    AND indexname = 'idx_sub_agent_validation_mode'
  ) THEN
    CREATE INDEX CONCURRENTLY idx_sub_agent_validation_mode
    ON sub_agent_execution_results(sd_id, validation_mode);
  END IF;
END $$;

-- ============================================================================
-- AC-002: Add justification column with constraints
-- ============================================================================

-- Add justification column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sub_agent_execution_results'
    AND column_name = 'justification'
  ) THEN
    ALTER TABLE sub_agent_execution_results
    ADD COLUMN justification TEXT;
  END IF;
END $$;

-- Add CHECK constraint for justification (required when CONDITIONAL_PASS, >= 50 chars)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sub_agent_execution_results'
    AND column_name = 'justification'
  ) THEN
    -- Drop existing constraint if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'sub_agent_execution_results'
      AND constraint_name = 'check_justification_required'
    ) THEN
      ALTER TABLE sub_agent_execution_results
      DROP CONSTRAINT check_justification_required;
    END IF;

    -- Add the constraint: NULL allowed for non-CONDITIONAL_PASS,
    -- but if provided must be >= 50 chars
    ALTER TABLE sub_agent_execution_results
    ADD CONSTRAINT check_justification_required
    CHECK (
      verdict != 'CONDITIONAL_PASS' OR
      (justification IS NOT NULL AND length(justification) >= 50)
    );
  END IF;
END $$;

-- ============================================================================
-- AC-003: Add conditions column with constraints
-- ============================================================================

-- Add conditions column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sub_agent_execution_results'
    AND column_name = 'conditions'
  ) THEN
    ALTER TABLE sub_agent_execution_results
    ADD COLUMN conditions JSONB;
  END IF;
END $$;

-- Add CHECK constraint for conditions (required when CONDITIONAL_PASS, non-empty array)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sub_agent_execution_results'
    AND column_name = 'conditions'
  ) THEN
    -- Drop existing constraint if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'sub_agent_execution_results'
      AND constraint_name = 'check_conditions_required'
    ) THEN
      ALTER TABLE sub_agent_execution_results
      DROP CONSTRAINT check_conditions_required;
    END IF;

    -- Add the constraint: NULL allowed for non-CONDITIONAL_PASS,
    -- but if provided must be non-empty array (length > 0)
    ALTER TABLE sub_agent_execution_results
    ADD CONSTRAINT check_conditions_required
    CHECK (
      verdict != 'CONDITIONAL_PASS' OR
      (conditions IS NOT NULL AND jsonb_array_length(conditions) > 0)
    );
  END IF;
END $$;

-- ============================================================================
-- AC-004: Enforce CONDITIONAL_PASS only in retrospective mode
-- ============================================================================

-- Add CHECK constraint to enforce CONDITIONAL_PASS only in retrospective mode
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sub_agent_execution_results'
    AND column_name = 'validation_mode'
  ) THEN
    -- Drop existing constraint if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'sub_agent_execution_results'
      AND constraint_name = 'check_conditional_pass_retrospective'
    ) THEN
      ALTER TABLE sub_agent_execution_results
      DROP CONSTRAINT check_conditional_pass_retrospective;
    END IF;

    -- Add the constraint
    ALTER TABLE sub_agent_execution_results
    ADD CONSTRAINT check_conditional_pass_retrospective
    CHECK (
      verdict != 'CONDITIONAL_PASS' OR
      validation_mode = 'retrospective'
    );
  END IF;
END $$;

-- ============================================================================
-- AC-006: Create additional indexes for query performance
-- ============================================================================

-- Index for verdict + validation_mode filtering
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'sub_agent_execution_results'
    AND indexname = 'idx_verdict_validation_mode'
  ) THEN
    CREATE INDEX CONCURRENTLY idx_verdict_validation_mode
    ON sub_agent_execution_results(verdict, validation_mode);
  END IF;
END $$;

-- Index for audit trail queries (CONDITIONAL_PASS entries)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'sub_agent_execution_results'
    AND indexname = 'idx_audit_trail'
  ) THEN
    CREATE INDEX CONCURRENTLY idx_audit_trail
    ON sub_agent_execution_results(created_at DESC)
    WHERE verdict = 'CONDITIONAL_PASS';
  END IF;
END $$;

-- ============================================================================
-- Backward Compatibility Validation
-- ============================================================================
-- AC-005: All existing rows have:
-- - validation_mode = 'prospective' (DEFAULT applied automatically)
-- - justification = NULL (backward compatible, only required for CONDITIONAL_PASS)
-- - conditions = NULL (backward compatible, only required for CONDITIONAL_PASS)
-- - Existing verdicts (PASS, FAIL, BLOCKED, WARNING) are unaffected

-- ============================================================================
-- Table Documentation (COMMENTS)
-- ============================================================================

COMMENT ON COLUMN sub_agent_execution_results.validation_mode IS
'Validation mode: prospective (default, pre-execution validation) or retrospective (post-execution review)';

COMMENT ON COLUMN sub_agent_execution_results.justification IS
'Required for CONDITIONAL_PASS verdicts: explanation of conditions and follow-up actions (min 50 chars)';

COMMENT ON COLUMN sub_agent_execution_results.conditions IS
'Required for CONDITIONAL_PASS verdicts: array of follow-up action strings (non-empty array)';

-- ============================================================================
-- Test Data Statements (for manual verification)
-- ============================================================================
-- These statements demonstrate the validation rules and can be used for testing

-- Example 1: Prospective PASS (existing behavior - should work)
-- INSERT INTO sub_agent_execution_results (
--   sd_id, sub_agent_code, sub_agent_name, verdict, validation_mode, confidence
-- ) VALUES (
--   'SD-TEST-001', 'QA', 'QA_DIRECTOR', 'PASS', 'prospective', 95
-- );

-- Example 2: Retrospective CONDITIONAL_PASS (new behavior - should work)
-- INSERT INTO sub_agent_execution_results (
--   sd_id, sub_agent_code, sub_agent_name, verdict, validation_mode,
--   justification, conditions, confidence
-- ) VALUES (
--   'SD-TEST-002', 'TESTING', 'TESTING_AGENT', 'CONDITIONAL_PASS', 'retrospective',
--   'E2E tests exist and pass. Infrastructure gap documented with follow-up actions.',
--   '["Create SD-TESTING-INFRASTRUCTURE-FIX-001", "Add --full-e2e flag to CI/CD pipeline"]',
--   85
-- );

-- Example 3: Invalid case - CONDITIONAL_PASS in prospective mode (should fail)
-- INSERT INTO sub_agent_execution_results (
--   sd_id, sub_agent_code, sub_agent_name, verdict, validation_mode,
--   justification, conditions, confidence
-- ) VALUES (
--   'SD-TEST-003', 'TESTING', 'TESTING_AGENT', 'CONDITIONAL_PASS', 'prospective',
--   'This should fail because CONDITIONAL_PASS requires retrospective mode.',
--   '["Some action"]',
--   75
-- );

-- Example 4: Invalid case - CONDITIONAL_PASS without justification (should fail)
-- INSERT INTO sub_agent_execution_results (
--   sd_id, sub_agent_code, sub_agent_name, verdict, validation_mode,
--   conditions, confidence
-- ) VALUES (
--   'SD-TEST-004', 'TESTING', 'TESTING_AGENT', 'CONDITIONAL_PASS', 'retrospective',
--   '["Some action"]',
--   75
-- );
