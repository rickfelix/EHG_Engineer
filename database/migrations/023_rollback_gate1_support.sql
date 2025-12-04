-- Rollback Migration 023: Remove Gate 1 Support
-- SD-VERIFY-LADDER-002: Gate 1 Unit Test Integration
-- Created: 2025-12-04
--
-- Purpose: Rollback changes from migration 023, removing Gate 1 support
--
-- Changes Reverted:
--   1. Remove '1' from leo_validation_rules CHECK constraint
--   2. Remove '1' from leo_gate_reviews CHECK constraint
--   3. DELETE all Gate 1 validation rules
--   4. DELETE all Gate 1 gate reviews
--
-- WARNING: This will delete all Gate 1 review data. It can be regenerated.

BEGIN;

-- ============================================================================
-- STEP 1: Delete Gate 1 validation rules
-- ============================================================================

DELETE FROM leo_validation_rules WHERE gate = '1';

-- ============================================================================
-- STEP 2: Delete any Gate 1 reviews
-- ============================================================================

DELETE FROM leo_gate_reviews WHERE gate = '1';

-- ============================================================================
-- STEP 3: Restore leo_validation_rules CHECK constraint (without '1')
-- ============================================================================

-- Drop constraint that includes Gate 1
ALTER TABLE leo_validation_rules
DROP CONSTRAINT IF EXISTS leo_validation_rules_gate_check;

-- Add constraint that excludes Gate 1 (back to gates 0, 2A-3)
ALTER TABLE leo_validation_rules
ADD CONSTRAINT leo_validation_rules_gate_check
CHECK (gate = ANY (ARRAY['0'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text]));

-- ============================================================================
-- STEP 4: Restore leo_gate_reviews CHECK constraint (without '1')
-- ============================================================================

-- Drop constraint that includes Gate 1
ALTER TABLE leo_gate_reviews
DROP CONSTRAINT IF EXISTS leo_gate_reviews_gate_check;

-- Add constraint that excludes Gate 1 (back to gates 0, 2A-3)
ALTER TABLE leo_gate_reviews
ADD CONSTRAINT leo_gate_reviews_gate_check
CHECK (gate = ANY (ARRAY['0'::text, '2A'::text, '2B'::text, '2C'::text, '2D'::text, '3'::text]));

-- ============================================================================
-- STEP 5: Verify rollback
-- ============================================================================

DO $$
BEGIN
  -- Verify no Gate 1 rules remain
  IF EXISTS (
    SELECT 1 FROM leo_validation_rules WHERE gate = '1'
  ) THEN
    RAISE EXCEPTION 'Failed to delete Gate 1 validation rules';
  END IF;

  -- Verify no Gate 1 reviews remain
  IF EXISTS (
    SELECT 1 FROM leo_gate_reviews WHERE gate = '1'
  ) THEN
    RAISE EXCEPTION 'Failed to delete Gate 1 gate reviews';
  END IF;

  RAISE NOTICE 'Rollback completed successfully';
END $$;

-- Display final state
SELECT
  gate,
  COUNT(*) as rule_count
FROM leo_validation_rules
GROUP BY gate
ORDER BY gate;

COMMIT;

-- ============================================================================
-- Post-Rollback Notes
-- ============================================================================

-- Rollback completed successfully!
-- Gate 1 support has been removed.
-- The database is back to supporting gates: 0, 2A, 2B, 2C, 2D, 3
