-- Migration 022: Add Gate 0 Support for Static Analysis Verification
-- SD-VERIFY-LADDER-001: Gate 0 Static Analysis Verification
-- Created: 2025-12-04
--
-- Purpose: Update CHECK constraints on leo_validation_rules and leo_gate_reviews
--          to allow gate='0' for static analysis validation rules.
--
-- Changes:
--   1. ALTER leo_validation_rules CHECK constraint to include '0'
--   2. ALTER leo_gate_reviews CHECK constraint to include '0'
--   3. INSERT 3 validation rules for Gate 0 (ESLint, TypeScript, Imports)
--   4. Verify weights sum to 1.0
--
-- Rollback: See rollback script 022_rollback_gate0_support.sql

BEGIN;

-- ============================================================================
-- STEP 1: Update leo_validation_rules CHECK constraint
-- ============================================================================

-- Drop existing constraint that only allows gates 2A-3
ALTER TABLE leo_validation_rules
DROP CONSTRAINT IF EXISTS leo_validation_rules_gate_check;

-- Add updated constraint that includes Gate 0
ALTER TABLE leo_validation_rules
ADD CONSTRAINT leo_validation_rules_gate_check
CHECK (gate = ANY (ARRAY['0'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text]));

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

-- Drop existing constraint that only allows gates 2A-3
ALTER TABLE leo_gate_reviews
DROP CONSTRAINT IF EXISTS leo_gate_reviews_gate_check;

-- Add updated constraint that includes Gate 0
ALTER TABLE leo_gate_reviews
ADD CONSTRAINT leo_gate_reviews_gate_check
CHECK (gate = ANY (ARRAY['0'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text]));

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
-- STEP 3: Insert Gate 0 validation rules
-- ============================================================================

-- Delete any existing Gate 0 rules (for idempotency)
DELETE FROM leo_validation_rules WHERE gate = '0';

-- Insert Gate 0 rules with weights summing to 1.0
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, created_at) VALUES
(
  '0',
  'hasESLintPass',
  0.400,
  jsonb_build_object(
    'description', 'ESLint validation with zero errors',
    'command', 'npx eslint .',
    'expectZeroErrors', true,
    'errorPattern', '\d+ error',
    'successCriteria', 'All files pass ESLint validation'
  ),
  true,  -- required (blocking)
  true,  -- active
  NOW()
),
(
  '0',
  'hasTypeScriptPass',
  0.400,
  jsonb_build_object(
    'description', 'TypeScript compilation with zero type errors',
    'command', 'npx tsc --noEmit',
    'expectZeroErrors', true,
    'errorPattern', 'error TS\d+',
    'successCriteria', 'TypeScript compilation succeeds without errors'
  ),
  true,  -- required (blocking)
  true,  -- active
  NOW()
),
(
  '0',
  'hasImportsPass',
  0.200,
  jsonb_build_object(
    'description', 'Import resolution check for missing dependencies',
    'command', 'node tools/gates/lib/check-imports.js',
    'expectZeroErrors', false,
    'errorPattern', 'Cannot find module',
    'successCriteria', 'All imports resolve successfully'
  ),
  false,  -- not required (non-blocking)
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
  -- Calculate sum of weights for gate='0'
  SELECT SUM(weight) INTO total_weight
  FROM leo_validation_rules
  WHERE gate = '0' AND active = true;

  -- Verify weights sum to 1.0 (with tolerance for floating-point precision)
  IF total_weight IS NULL THEN
    RAISE EXCEPTION 'No active rules found for gate=0';
  END IF;

  IF ABS(total_weight - 1.0) > 0.001 THEN
    RAISE EXCEPTION 'Gate 0 weights sum to %, expected 1.0', total_weight;
  END IF;

  RAISE NOTICE 'Gate 0 weights verified: % (within tolerance)', total_weight;
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
WHERE gate = '0'
ORDER BY weight DESC;

-- Display weight summary
SELECT
  gate,
  COUNT(*) as rule_count,
  SUM(weight) as total_weight,
  SUM(CASE WHEN required THEN 1 ELSE 0 END) as required_count,
  SUM(CASE WHEN active THEN 1 ELSE 0 END) as active_count
FROM leo_validation_rules
WHERE gate = '0'
GROUP BY gate;

COMMIT;

-- ============================================================================
-- Post-Migration Notes
-- ============================================================================

-- Migration completed successfully!
-- Next steps:
--   1. Implement tools/gates/gate0.ts following gate2a.ts pattern
--   2. Implement tools/gates/lib/check-imports.js for import resolution
--   3. Add gate0.ts to .github/workflows/leo-gates.yml
--   4. Test gate execution with PRD_ID environment variable
--   5. Verify results stored in leo_gate_reviews table
