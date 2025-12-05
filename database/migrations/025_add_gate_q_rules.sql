-- Migration 025: Add Gate Q Support for Quality Gate Reweighting
-- SD-QUALITY-GATE-001: Quality Gate Reweighting (35/25/20/20)
-- Created: 2025-12-04
--
-- Purpose: Add Gate Q validation rules for quality gate scoring:
--   - Test Evidence (35%): Validates testing coverage and evidence
--   - Diff Minimality (25%): Ensures minimal code changes
--   - Rollback Safety (20%): Verifies safe rollback paths
--   - Migration Correctness (20%): Validates database schema changes
--
-- Changes:
--   1. ALTER leo_validation_rules CHECK constraint to include 'Q'
--   2. ALTER leo_gate_reviews CHECK constraint to include 'Q'
--   3. INSERT 4 validation rules for Gate Q (weights sum to 1.0)
--   4. Verify weights sum to 1.0
--
-- Rollback: See rollback script 025_rollback_gate_q_rules.sql

BEGIN;

-- ============================================================================
-- STEP 1: Update leo_validation_rules CHECK constraint
-- ============================================================================

-- Drop existing constraint
ALTER TABLE leo_validation_rules
DROP CONSTRAINT IF EXISTS leo_validation_rules_gate_check;

-- Add updated constraint that includes Gate Q
ALTER TABLE leo_validation_rules
ADD CONSTRAINT leo_validation_rules_gate_check
CHECK (gate = ANY (ARRAY['0'::text, '1'::text, 'Q'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text]));

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

-- Drop existing constraint
ALTER TABLE leo_gate_reviews
DROP CONSTRAINT IF EXISTS leo_gate_reviews_gate_check;

-- Add updated constraint that includes Gate Q
ALTER TABLE leo_gate_reviews
ADD CONSTRAINT leo_gate_reviews_gate_check
CHECK (gate = ANY (ARRAY['0'::text, '1'::text, 'Q'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text]));

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
-- STEP 3: Insert Gate Q validation rules
-- ============================================================================

-- Delete any existing Gate Q rules (for idempotency)
DELETE FROM leo_validation_rules WHERE gate = 'Q';

-- Insert Gate Q rules with weights summing to 1.0 (35 + 25 + 20 + 20 = 100)
INSERT INTO leo_validation_rules (gate, rule_name, weight, criteria, required, active, created_at) VALUES
(
  'Q',
  'hasTestEvidence',
  0.350,
  jsonb_build_object(
    'description', 'Test evidence exists: unit test results, E2E reports, or manual test documentation',
    'command', 'node tools/gates/lib/check-test-evidence.js',
    'evidence_locations', ARRAY[
      'tests/e2e/evidence/',
      'coverage/',
      'test-results/',
      '.vitest/'
    ],
    'successCriteria', 'At least one form of test evidence exists'
  ),
  true,  -- required (blocking)
  true,  -- active
  NOW()
),
(
  'Q',
  'hasDiffMinimality',
  0.250,
  jsonb_build_object(
    'description', 'Code changes are minimal to reduce blast radius',
    'command', 'node tools/gates/lib/check-diff.js',
    'thresholds', jsonb_build_object(
      'max_files', 10,
      'max_lines', 400
    ),
    'successCriteria', 'Files changed <= 10 AND lines changed <= 400'
  ),
  false,  -- not required (advisory)
  true,   -- active
  NOW()
),
(
  'Q',
  'hasRollbackSafety',
  0.200,
  jsonb_build_object(
    'description', 'Database migrations have rollback capability',
    'command', 'node tools/gates/lib/check-rollback.js',
    'migration_paths', ARRAY[
      'database/migrations/',
      'supabase/migrations/'
    ],
    'successCriteria', 'All migrations have corresponding rollback scripts OR no migrations present'
  ),
  false,  -- not required (advisory)
  true,   -- active
  NOW()
),
(
  'Q',
  'hasMigrationCorrectness',
  0.200,
  jsonb_build_object(
    'description', 'Database migrations follow naming conventions and valid SQL',
    'command', 'node tools/gates/lib/check-migration.js',
    'naming_pattern', '^\d{3}_[a-z_]+\.sql$',
    'destructive_operations', ARRAY['DROP TABLE', 'TRUNCATE', 'DELETE FROM', 'ALTER TABLE.*DROP'],
    'successCriteria', 'All migrations follow naming convention and have valid SQL syntax'
  ),
  false,  -- not required (advisory)
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
  -- Calculate sum of weights for gate='Q'
  SELECT SUM(weight) INTO total_weight
  FROM leo_validation_rules
  WHERE gate = 'Q' AND active = true;

  -- Verify weights sum to 1.0 (with tolerance for floating-point precision)
  IF total_weight IS NULL THEN
    RAISE EXCEPTION 'No active rules found for gate=Q';
  END IF;

  IF ABS(total_weight - 1.0) > 0.001 THEN
    RAISE EXCEPTION 'Gate Q weights sum to %, expected 1.0', total_weight;
  END IF;

  RAISE NOTICE 'Gate Q weights verified: % (within tolerance)', total_weight;
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
WHERE gate = 'Q'
ORDER BY weight DESC;

-- Display weight summary
SELECT
  gate,
  COUNT(*) as rule_count,
  SUM(weight) as total_weight,
  SUM(CASE WHEN required THEN 1 ELSE 0 END) as required_count,
  SUM(CASE WHEN active THEN 1 ELSE 0 END) as active_count
FROM leo_validation_rules
WHERE gate = 'Q'
GROUP BY gate;

COMMIT;

-- ============================================================================
-- Post-Migration Notes
-- ============================================================================

-- Migration completed successfully!
-- Next steps:
--   1. Implement tools/gates/gateQ.ts following gate0.ts pattern
--   2. Implement tools/gates/lib/check-test-evidence.js
--   3. Implement tools/gates/lib/check-diff.js
--   4. Implement tools/gates/lib/check-rollback.js
--   5. Implement tools/gates/lib/check-migration.js
--   6. Test gate execution with PRD_ID environment variable
--   7. Verify results stored in leo_gate_reviews table
