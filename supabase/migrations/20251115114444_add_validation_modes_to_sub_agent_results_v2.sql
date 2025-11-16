-- SD-LEO-PROTOCOL-V4-4-0: Sub-Agent Adaptive Validation System
-- US-001: Database Migration for validation modes
-- Purpose: Add database schema columns to support adaptive validation modes
-- (prospective/retrospective) for sub-agent execution results
-- Author: Database Architecture Team
-- Date: 2025-11-15
-- Version: 2 (Fixed CONCURRENTLY index creation)

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
-- AC-006: Create indexes for query performance
-- NOTE: These must be run OUTSIDE of transaction blocks (DO $$)
-- ============================================================================

-- Index for validation mode filtering
CREATE INDEX IF NOT EXISTS idx_sub_agent_validation_mode
ON sub_agent_execution_results(sd_id, validation_mode);

-- Index for verdict + validation_mode filtering
CREATE INDEX IF NOT EXISTS idx_verdict_validation_mode
ON sub_agent_execution_results(verdict, validation_mode);

-- Index for audit trail queries (CONDITIONAL_PASS entries)
CREATE INDEX IF NOT EXISTS idx_audit_trail
ON sub_agent_execution_results(created_at DESC)
WHERE verdict = 'CONDITIONAL_PASS';

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
-- Backward Compatibility Validation
-- ============================================================================
-- AC-005: All existing rows have:
-- - validation_mode = 'prospective' (DEFAULT applied automatically)
-- - justification = NULL (backward compatible, only required for CONDITIONAL_PASS)
-- - conditions = NULL (backward compatible, only required for CONDITIONAL_PASS)
-- - Existing verdicts (PASS, FAIL, BLOCKED, WARNING) are unaffected
