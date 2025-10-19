-- ============================================================================
-- Cleanup Orphaned PRD sd_uuid Values
-- Issue: 17 PRDs created with NULL sd_uuid due to timestamp-suffixed IDs
-- Root Cause: PRD IDs like PRD-SD-023-1758985645577 don't match SD-023
-- Fix: Map timestamp-suffixed PRD IDs to base SD IDs
-- Date: 2025-10-19
-- Related: SD-PRE-EXEC-ANALYSIS-001 Issue #1
-- ============================================================================

DO $$
DECLARE
  fixed_count INTEGER := 0;
  orphaned_count INTEGER := 0;
  prd_record RECORD;
  sd_uuid_val UUID;
  base_sd_id TEXT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔧 CLEANUP: Orphaned PRD sd_uuid Values';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 1: Fix timestamp-suffixed PRDs (16 cases)
  -- ========================================================================

  RAISE NOTICE 'Step 1: Fixing timestamp-suffixed PRD IDs...';
  RAISE NOTICE '';

  FOR prd_record IN
    SELECT
      id,
      title,
      REPLACE(id, 'PRD-', '') as sd_id_extracted
    FROM product_requirements_v2
    WHERE sd_uuid IS NULL
      AND id LIKE 'PRD-SD-%'
      AND id != 'PRD-SD-TEST-DESIGN'  -- Handle separately
    ORDER BY id
  LOOP
    -- Extract base SD ID by removing timestamp suffix
    base_sd_id := REGEXP_REPLACE(prd_record.sd_id_extracted, '-\d{13}$', '');

    -- Look up SD UUID using base ID
    SELECT uuid_id INTO sd_uuid_val
    FROM strategic_directives_v2
    WHERE id = base_sd_id;

    IF sd_uuid_val IS NOT NULL THEN
      -- Update PRD with correct sd_uuid
      UPDATE product_requirements_v2
      SET sd_uuid = sd_uuid_val
      WHERE id = prd_record.id;

      fixed_count := fixed_count + 1;
      RAISE NOTICE '✅ Fixed: % → SD % (UUID: %)',
        prd_record.id, base_sd_id, sd_uuid_val;
    ELSE
      RAISE WARNING '⚠️  Cannot fix %: Base SD % not found',
        prd_record.id, base_sd_id;
      orphaned_count := orphaned_count + 1;
    END IF;

    -- Reset for next iteration
    sd_uuid_val := NULL;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Results:';
  RAISE NOTICE '  - Fixed: % PRDs', fixed_count;
  RAISE NOTICE '  - Still orphaned: % PRDs', orphaned_count;
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 2: Report on PRD-SD-TEST-DESIGN
  -- ========================================================================

  RAISE NOTICE 'Step 2: Checking PRD-SD-TEST-DESIGN...';
  RAISE NOTICE '';

  SELECT COUNT(*) INTO orphaned_count
  FROM product_requirements_v2
  WHERE id = 'PRD-SD-TEST-DESIGN' AND sd_uuid IS NULL;

  IF orphaned_count > 0 THEN
    RAISE WARNING '⚠️  PRD-SD-TEST-DESIGN still orphaned (no matching SD exists)';
    RAISE WARNING '   Options:';
    RAISE WARNING '   1. DELETE FROM product_requirements_v2 WHERE id = ''PRD-SD-TEST-DESIGN'';';
    RAISE WARNING '   2. Create SD-TEST-DESIGN manually';
    RAISE WARNING '   3. Map to different SD via: UPDATE product_requirements_v2 SET sd_uuid = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = ''SD-XXX'') WHERE id = ''PRD-SD-TEST-DESIGN'';';
    RAISE NOTICE '';
  END IF;

  -- ========================================================================
  -- STEP 3: Final verification
  -- ========================================================================

  RAISE NOTICE 'Step 3: Final verification...';
  RAISE NOTICE '';

  SELECT COUNT(*) INTO orphaned_count
  FROM product_requirements_v2
  WHERE sd_uuid IS NULL AND id LIKE 'PRD-SD-%';

  RAISE NOTICE 'Total PRDs with NULL sd_uuid: %', orphaned_count;

  IF orphaned_count = 0 THEN
    RAISE NOTICE '✅ All PRDs fixed! Ready to add NOT NULL constraint.';
    RAISE NOTICE '';
    RAISE NOTICE 'Next step: Run this to enforce constraint:';
    RAISE NOTICE '  ALTER TABLE product_requirements_v2 ALTER COLUMN sd_uuid SET NOT NULL;';
  ELSIF orphaned_count = 1 THEN
    SELECT id INTO prd_record FROM product_requirements_v2
    WHERE sd_uuid IS NULL AND id LIKE 'PRD-SD-%' LIMIT 1;

    RAISE WARNING '⚠️  1 PRD remaining: %', prd_record;
    RAISE WARNING '   Fix manually before adding NOT NULL constraint.';
  ELSE
    RAISE WARNING '⚠️  % PRDs still orphaned. Review warnings above.', orphaned_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '🎉 CLEANUP COMPLETE';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '';

END $$;

-- ============================================================================
-- POST-MIGRATION MANUAL FIXES APPLIED
-- ============================================================================

-- After running this migration, the following manual fixes were applied:
--
-- 1. Fixed PRD-SD-018-VENTURE-EXIT (descriptive suffix, not timestamp):
--    UPDATE product_requirements_v2
--    SET sd_uuid = (SELECT uuid_id FROM strategic_directives_v2 WHERE id = 'SD-018')
--    WHERE id = 'PRD-SD-018-VENTURE-EXIT';
--
-- 2. Deleted orphaned test PRD (no matching SD exists):
--    DELETE FROM product_requirements_v2 WHERE id = 'PRD-SD-TEST-DESIGN';
--
-- Final result: 0 PRDs with pattern PRD-SD-* have NULL sd_uuid

-- ============================================================================
-- REMAINING WORK: Non-PRD-SD-* Patterns (24 PRDs)
-- ============================================================================

-- The following PRD naming patterns still have NULL sd_uuid and require manual cleanup:
-- - PRD-RECONNECT-* (e.g., PRD-RECONNECT-006)
-- - PRD-BOARD-VISUAL-BUILDER-* (e.g., PRD-BOARD-VISUAL-BUILDER-003)
-- - UUID-based PRDs (e.g., PRD-2bb6a529-14b5-4d57-a404-8d249aa935e5)
-- - Malformed PRDs (e.g., PRD---help, PRD---sd-id)
--
-- These PRDs do NOT benefit from the auto-population trigger because they
-- don't follow the PRD-SD-* naming convention.
--
-- Recommended approach:
-- 1. Create separate cleanup migration for each pattern
-- 2. Map PRD-RECONNECT-* to SD-RECONNECT-* SDs
-- 3. Map PRD-BOARD-* to appropriate SDs
-- 4. Delete malformed PRDs (test data)
-- 5. Add NOT NULL constraint after all cleanup complete

-- ============================================================================
-- VERIFICATION QUERY (run manually to check results)
-- ============================================================================

-- Check PRD-SD-* pattern PRDs (should all have sd_uuid now)
-- SELECT
--   p.id as prd_id,
--   p.title,
--   p.sd_uuid,
--   s.id as sd_id,
--   s.title as sd_title
-- FROM product_requirements_v2 p
-- LEFT JOIN strategic_directives_v2 s ON p.sd_uuid = s.uuid_id
-- WHERE p.id LIKE 'PRD-SD-%'
-- ORDER BY p.created_at DESC;

-- Check all PRDs with NULL sd_uuid (other patterns)
-- SELECT
--   id,
--   title,
--   status,
--   created_at,
--   CASE
--     WHEN id LIKE 'PRD-RECONNECT-%' THEN 'RECONNECT pattern'
--     WHEN id LIKE 'PRD-BOARD-%' THEN 'BOARD pattern'
--     WHEN id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'UUID pattern'
--     WHEN id LIKE 'PRD---' THEN 'Malformed'
--     ELSE 'Other'
--   END as pattern_type
-- FROM product_requirements_v2
-- WHERE sd_uuid IS NULL
-- ORDER BY pattern_type, created_at DESC;
