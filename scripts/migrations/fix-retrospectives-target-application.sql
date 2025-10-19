-- ============================================================================
-- MIGRATION: Fix retrospectives.target_application Constraint
-- ============================================================================
-- Purpose: Allow both 'EHG' and 'EHG_Engineer' as valid target applications
-- Issue: Constraint only allows 'EHG', blocking documentation/tooling retrospectives
--        Also fixes case mismatch ('EHG_engineer' -> 'EHG_Engineer')
--
-- Impact: Enables retrospective generation for EHG_Engineer SDs
-- Rollback: See rollback section at bottom
-- ============================================================================

-- ============================================================================
-- PHASE 1: DROP EXISTING CONSTRAINT (Must be first!)
-- ============================================================================

DO $$
BEGIN
  ALTER TABLE retrospectives
  DROP CONSTRAINT IF EXISTS check_target_application;

  RAISE NOTICE '✅ Dropped existing constraint on retrospectives';
END $$;

-- ============================================================================
-- PHASE 2: FIX EXISTING DATA (Case mismatch)
-- ============================================================================

-- Fix case mismatch: 'EHG_engineer' → 'EHG_Engineer'
UPDATE retrospectives
SET target_application = 'EHG_Engineer'
WHERE target_application = 'EHG_engineer';

-- Verify data fix
DO $$
DECLARE
  old_casing_count INTEGER;
  new_casing_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO old_casing_count
  FROM retrospectives
  WHERE target_application = 'EHG_engineer';

  SELECT COUNT(*) INTO new_casing_count
  FROM retrospectives
  WHERE target_application = 'EHG_Engineer';

  SELECT COUNT(*) INTO total_count
  FROM retrospectives;

  RAISE NOTICE 'Total retrospectives: %', total_count;
  RAISE NOTICE 'Rows with EHG_engineer (old): %', old_casing_count;
  RAISE NOTICE 'Rows with EHG_Engineer (new): %', new_casing_count;

  IF old_casing_count > 0 THEN
    RAISE WARNING '⚠️ Still have % rows with old casing', old_casing_count;
  ELSE
    RAISE NOTICE '✅ All rows updated to correct casing';
  END IF;
END $$;

-- ============================================================================
-- PHASE 3: ADD NEW CONSTRAINT
-- ============================================================================

DO $$
BEGIN
  ALTER TABLE retrospectives
  ADD CONSTRAINT check_target_application
  CHECK (target_application IN ('EHG', 'EHG_Engineer'));

  RAISE NOTICE '✅ Added new constraint with both values';
END $$;

-- Verify constraint was updated
DO $$
DECLARE
  constraint_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO constraint_def
  FROM pg_constraint
  WHERE conname = 'check_target_application'
    AND conrelid = 'retrospectives'::regclass;

  IF constraint_def IS NOT NULL THEN
    RAISE NOTICE '✅ Constraint updated successfully';
    RAISE NOTICE 'Definition: %', constraint_def;
  ELSE
    RAISE WARNING '⚠️ Constraint not found';
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show current value distribution
DO $$
DECLARE
  ehg_count INTEGER;
  ehg_engineer_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ehg_count
  FROM retrospectives
  WHERE target_application = 'EHG';

  SELECT COUNT(*) INTO ehg_engineer_count
  FROM retrospectives
  WHERE target_application = 'EHG_Engineer';

  RAISE NOTICE '';
  RAISE NOTICE '=== VALUE DISTRIBUTION ===';
  RAISE NOTICE 'EHG: % retrospectives', ehg_count;
  RAISE NOTICE 'EHG_Engineer: % retrospectives', ehg_engineer_count;
  RAISE NOTICE '';
END $$;

-- ============================================================================
-- TEST CASES
-- ============================================================================

/*
-- Test 1: EHG should work (existing value)
INSERT INTO retrospectives (
  sd_id, target_application, quality_score, lessons_learned
) VALUES (
  'TEST-SD', 'EHG', 100, '[]'::jsonb
);
-- Expected: SUCCESS
-- Cleanup: DELETE FROM retrospectives WHERE sd_id = 'TEST-SD';

-- Test 2: EHG_Engineer should work (new value)
INSERT INTO retrospectives (
  sd_id, target_application, quality_score, lessons_learned
) VALUES (
  'TEST-SD-2', 'EHG_Engineer', 100, '[]'::jsonb
);
-- Expected: SUCCESS
-- Cleanup: DELETE FROM retrospectives WHERE sd_id = 'TEST-SD-2';

-- Test 3: Invalid value should fail
INSERT INTO retrospectives (
  sd_id, target_application, quality_score, lessons_learned
) VALUES (
  'TEST-SD-3', 'INVALID', 100, '[]'::jsonb
);
-- Expected: ERROR - violates check constraint
*/

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================

/*
-- To rollback to original constraint:

ALTER TABLE retrospectives
DROP CONSTRAINT IF EXISTS check_target_application;

ALTER TABLE retrospectives
ADD CONSTRAINT check_target_application
CHECK (target_application IN ('EHG'));
*/

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. Case Mismatch Issue (FIXED):
--    - Some existing rows may have 'EHG_engineer' (lowercase 'e')
--    - Constraint requires 'EHG_Engineer' (capital 'E')
--    - Migration updates these rows first, then adds constraint
--
-- 2. Two Applications in Ecosystem:
--    - EHG: Customer-facing business application
--    - EHG_Engineer: Management dashboard & tooling
--
-- 3. Retrospective Targeting:
--    - Customer feature SDs → target_application = 'EHG'
--    - Documentation/process SDs → target_application = 'EHG_Engineer'
--
-- 4. Related Migration:
--    - fix-target-application-constraint.sql (for strategic_directives_v2)
--    - Both tables need same fix for consistency

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
