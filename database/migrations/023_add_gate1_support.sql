-- Migration 023: Add Gate 1 Support for Unit Test Integration
-- SD-VERIFY-LADDER-002: Gate 1 Unit Test Integration
-- Created: 2025-12-04
--
-- Purpose: Update CHECK constraints on leo_validation_rules and leo_gate_reviews
--          to allow gate='1' for unit test validation rules.
--
-- Changes:
--   1. ALTER leo_validation_rules CHECK constraint to include '1'
--   2. ALTER leo_gate_reviews CHECK constraint to include '1'
--   3. INSERT 3 validation rules for Gate 1 (Unit Tests, Coverage, Quality)
--   4. Verify weights sum to 1.0
--
-- Rollback: See rollback script 023_rollback_gate1_support.sql

BEGIN;

-- ============================================================================
-- STEP 1: Update leo_validation_rules CHECK constraint
-- ============================================================================

-- Drop existing constraint that only allows gates 0, 2A-3
ALTER TABLE leo_validation_rules
DROP CONSTRAINT IF EXISTS leo_validation_rules_gate_check;

-- Add updated constraint that includes Gate 1
ALTER TABLE leo_validation_rules
ADD CONSTRAINT leo_validation_rules_gate_check
CHECK (gate = ANY (ARRAY['0'::text, '1'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text]));

-- Verify constraint added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'leo_validation_rules_gate_check'
  ) THEN
    RAISE EXCEPTION 'Failed to add leo_validation_rules_gate_check constraint';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Update leo_gate_reviews CHECK constraint
-- ============================================================================

-- Drop existing constraint that only allows gates 0, 2A-3
ALTER TABLE leo_gate_reviews
DROP CONSTRAINT IF EXISTS leo_gate_reviews_gate_check;

-- Add updated constraint that includes Gate 1
ALTER TABLE leo_gate_reviews
ADD CONSTRAINT leo_gate_reviews_gate_check
CHECK (gate = ANY (ARRAY['0'::text, '1'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text]));

-- Verify constraint added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'leo_gate_reviews_gate_check'
  ) THEN
    RAISE EXCEPTION 'Failed to add leo_gate_reviews_gate_check constraint';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Insert Gate 1 validation rules
-- ============================================================================

-- Delete any existing Gate 1 rules (for idempotency)
DELETE FROM leo_validation_rules WHERE gate = '1';

-- Insert Gate 1 rules with weights summing to 1.0
-- Rule names per PRD-SD-VERIFY-LADDER-002:
--   hasUnitTestsExecuted (0.40) - Tests run without error
--   hasUnitTestsPassing (0.40) - Zero test failures
--   hasCoverageThreshold (0.20) - Coverage >= 50%
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, created_at) VALUES
(
  '1',
  'hasUnitTestsExecuted',
  0.400,
  jsonb_build_object(
    'description', 'Jest unit tests execute successfully',
    'command', 'npx jest --json',
    'expectZeroErrors', true,
    'timeout', 120,
    'successCriteria', 'Jest runs without execution errors (exit code 0)'
  ),
  true,  -- required (blocking)
  true,  -- active
  NOW()
),
(
  '1',
  'hasUnitTestsPassing',
  0.400,
  jsonb_build_object(
    'description', 'All unit tests pass (zero failures)',
    'command', 'npx jest --json',
    'expectZeroErrors', true,
    'successCriteria', 'numFailedTests === 0 in Jest JSON output'
  ),
  true,  -- required (blocking)
  true,  -- active
  NOW()
),
(
  '1',
  'hasCoverageThreshold',
  0.200,
  jsonb_build_object(
    'description', 'Code coverage meets minimum threshold',
    'command', 'npx jest --coverage --json',
    'expectZeroErrors', false,
    'minCoverage', 50,
    'successCriteria', 'Line coverage >= 50% from coverage-summary.json'
  ),
  false,  -- not required (non-blocking, advisory)
  true,   -- active
  NOW()
);

-- ============================================================================
-- STEP 4: Verify weight calculations
-- ============================================================================

DO $$
DECLARE
  total_weight NUMERIC;
BEGIN
  -- Calculate sum of weights for gate='1'
  SELECT SUM(weight) INTO total_weight
  FROM leo_validation_rules
  WHERE gate = '1' AND active = true;

  -- Verify weights sum to 1.0 (with tolerance for floating-point precision)
  IF total_weight IS NULL THEN
    RAISE EXCEPTION 'No active rules found for gate=1';
  END IF;

  IF ABS(total_weight - 1.0) > 0.001 THEN
    RAISE EXCEPTION 'Gate 1 weights sum to %, expected 1.0', total_weight;
  END IF;

  RAISE NOTICE 'Gate 1 weights verified: % (within tolerance)', total_weight;
END $$;

-- ============================================================================
-- STEP 5: Verification queries
-- ============================================================================

-- Display inserted rules
SELECT
  gate,
  rule_name,
  weight,
  required,
  active,
  criteria->>'description' as description,
  created_at
FROM leo_validation_rules
WHERE gate = '1'
ORDER BY weight DESC;

-- Display weight summary
SELECT
  gate,
  COUNT(*) as rule_count,
  SUM(weight) as total_weight,
  SUM(CASE WHEN required THEN 1 ELSE 0 END) as required_count,
  SUM(CASE WHEN active THEN 1 ELSE 0 END) as active_count
FROM leo_validation_rules
WHERE gate = '1'
GROUP BY gate;

COMMIT;

-- ============================================================================
-- Post-Migration Notes
-- ============================================================================

-- Migration completed successfully!
-- Next steps:
--   1. Implement tools/gates/gate1.ts following gate0.ts pattern
--   2. Implement tools/gates/lib/check-test-quality.js
--   3. Add gate1.ts to .github/workflows/leo-gates.yml
--   4. Test gate execution with PRD_ID environment variable
--   5. Verify results stored in leo_gate_reviews table
