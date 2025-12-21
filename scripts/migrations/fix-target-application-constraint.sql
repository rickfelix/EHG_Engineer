-- ============================================================================
-- MIGRATION: Fix target_application Constraint
-- ============================================================================
-- Purpose: Allow both 'EHG' and 'EHG_Engineer' as valid target applications
-- Issue: Constraint only allowed 'EHG', blocking documentation/tooling SDs
--
-- Impact: Enables proper application targeting for:
--   - EHG: Customer-facing features (most SDs)
--   - EHG_Engineer: Dashboard, tooling, documentation, process improvements
--
-- Rollback: See rollback section at bottom
-- ============================================================================

-- ============================================================================
-- PHASE 1: DROP EXISTING CONSTRAINT (Must be first!)
-- ============================================================================

-- Drop existing constraint BEFORE updating data
-- (existing constraint only allows 'EHG', blocking updates to 'EHG_Engineer')
DO $$
BEGIN
  ALTER TABLE strategic_directives_v2
  DROP CONSTRAINT IF EXISTS check_target_application;

  RAISE NOTICE '✅ Dropped existing constraint';
END $$;

-- ============================================================================
-- PHASE 2: FIX EXISTING DATA (Case mismatch)
-- ============================================================================

-- Fix case mismatch: 'EHG_engineer' → 'EHG_Engineer'
-- Found 8 rows with lowercase 'engineer'
UPDATE strategic_directives_v2
SET target_application = 'EHG_Engineer'
WHERE target_application = 'EHG_engineer';

-- Verify data fix
DO $$
DECLARE
  old_casing_count INTEGER;
  new_casing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO old_casing_count
  FROM strategic_directives_v2
  WHERE target_application = 'EHG_engineer';

  SELECT COUNT(*) INTO new_casing_count
  FROM strategic_directives_v2
  WHERE target_application = 'EHG_Engineer';

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

-- Add new constraint with both values (correct casing)
DO $$
BEGIN
  ALTER TABLE strategic_directives_v2
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
    AND conrelid = 'strategic_directives_v2'::regclass;

  IF constraint_def IS NOT NULL THEN
    RAISE NOTICE '✅ Constraint updated successfully';
    RAISE NOTICE 'Definition: %', constraint_def;
  ELSE
    RAISE WARNING '⚠️ Constraint not found';
  END IF;
END $$;

-- ============================================================================
-- TEST CASES
-- ============================================================================

/*
-- Test 1: EHG should work (existing value)
UPDATE strategic_directives_v2
SET target_application = 'EHG'
WHERE id = 'SD-PROOF-DRIVEN-1758340937844';
-- Expected: SUCCESS

-- Test 2: EHG_Engineer should work (new value)
UPDATE strategic_directives_v2
SET target_application = 'EHG_Engineer'
WHERE id = 'SD-PROOF-DRIVEN-1758340937844';
-- Expected: SUCCESS

-- Test 3: Invalid value should fail
UPDATE strategic_directives_v2
SET target_application = 'INVALID'
WHERE id = 'SD-PROOF-DRIVEN-1758340937844';
-- Expected: ERROR - violates check constraint
*/

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================

/*
-- To rollback to original constraint:

ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS check_target_application;

ALTER TABLE strategic_directives_v2
ADD CONSTRAINT check_target_application
CHECK (target_application IN ('EHG'));
*/

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. Case Mismatch Issue (FIXED):
--    - 8 existing rows had 'EHG_engineer' (lowercase 'e')
--    - Constraint requires 'EHG_Engineer' (capital 'E')
--    - Migration updates these rows first, then adds constraint
--
-- 2. Two Applications in Ecosystem:
--    - EHG: Customer-facing business application (/mnt/c/_EHG/EHG/)
--    - EHG_Engineer: Management dashboard & tooling (/mnt/c/_EHG/EHG_Engineer/)
--
-- 3. SD Targeting Rules:
--    - Customer features → target_application = 'EHG'
--    - Documentation, process, dashboard → target_application = 'EHG_Engineer'
--
-- 4. Git Verification Impact:
--    - Correct targeting enables proper repository verification
--    - EHG → checks /mnt/c/_EHG/EHG/ commits
--    - EHG_Engineer → checks /mnt/c/_EHG/EHG_Engineer/ commits
--
-- 5. Value Distribution Before Migration:
--    - 'EHG': 200 rows
--    - 'EHG_engineer': 8 rows (needs fixing)
--    After migration: 'EHG': 200, 'EHG_Engineer': 8

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
