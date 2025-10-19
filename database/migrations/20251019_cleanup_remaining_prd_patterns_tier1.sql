-- ============================================================================
-- Cleanup Remaining PRD sd_uuid NULL Values - Tier 1 (Quick Wins)
-- Issue: 24 non-PRD-SD-* PRDs have NULL sd_uuid
-- Strategy: Fix 4 clear SD matches + delete 2 malformed test PRDs
-- Date: 2025-10-19
-- Related: SD-PRE-EXEC-ANALYSIS-001 Issue #1 (continued)
-- ============================================================================

DO $$
DECLARE
  fixed_count INTEGER := 0;
  deleted_count INTEGER := 0;
  sd_uuid_val UUID;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔧 TIER 1 CLEANUP: Clear SD Matches & Malformed PRDs';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 1: Fix BOARD pattern (1 PRD)
  -- ========================================================================

  RAISE NOTICE 'Step 1: Fixing BOARD pattern PRDs...';

  -- PRD-BOARD-VISUAL-BUILDER-003 → SD-BOARD-VISUAL-BUILDER-003
  SELECT uuid_id INTO sd_uuid_val
  FROM strategic_directives_v2
  WHERE id = 'SD-BOARD-VISUAL-BUILDER-003';

  IF sd_uuid_val IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET sd_uuid = sd_uuid_val
    WHERE id = 'PRD-BOARD-VISUAL-BUILDER-003';

    IF FOUND THEN
      fixed_count := fixed_count + 1;
      RAISE NOTICE '✅ Fixed: PRD-BOARD-VISUAL-BUILDER-003 → SD-BOARD-VISUAL-BUILDER-003 (UUID: %)', sd_uuid_val;
    END IF;
  ELSE
    RAISE WARNING '⚠️  SD-BOARD-VISUAL-BUILDER-003 not found in database';
  END IF;

  sd_uuid_val := NULL;
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 2: Fix RECONNECT pattern (1 PRD)
  -- ========================================================================

  RAISE NOTICE 'Step 2: Fixing RECONNECT pattern PRDs...';

  -- PRD-RECONNECT-006 → SD-RECONNECT-006
  SELECT uuid_id INTO sd_uuid_val
  FROM strategic_directives_v2
  WHERE id = 'SD-RECONNECT-006';

  IF sd_uuid_val IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET sd_uuid = sd_uuid_val
    WHERE id = 'PRD-RECONNECT-006';

    IF FOUND THEN
      fixed_count := fixed_count + 1;
      RAISE NOTICE '✅ Fixed: PRD-RECONNECT-006 → SD-RECONNECT-006 (UUID: %)', sd_uuid_val;
    END IF;
  ELSE
    RAISE WARNING '⚠️  SD-RECONNECT-006 not found in database';
  END IF;

  sd_uuid_val := NULL;
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 3: Fix FILE-PATH pattern (2 PRDs)
  -- ========================================================================

  RAISE NOTICE 'Step 3: Fixing FILE-PATH pattern PRDs...';

  -- PRD-prds/PRD-SD-016.md → SD-016
  SELECT uuid_id INTO sd_uuid_val
  FROM strategic_directives_v2
  WHERE id = 'SD-016';

  IF sd_uuid_val IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET sd_uuid = sd_uuid_val
    WHERE id = 'PRD-prds/PRD-SD-016.md';

    IF FOUND THEN
      fixed_count := fixed_count + 1;
      RAISE NOTICE '✅ Fixed: PRD-prds/PRD-SD-016.md → SD-016 (UUID: %)', sd_uuid_val;
    END IF;
  ELSE
    RAISE WARNING '⚠️  SD-016 not found in database';
  END IF;

  sd_uuid_val := NULL;

  -- PRD-prds/PRD-SD-022.md → SD-022
  SELECT uuid_id INTO sd_uuid_val
  FROM strategic_directives_v2
  WHERE id = 'SD-022';

  IF sd_uuid_val IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET sd_uuid = sd_uuid_val
    WHERE id = 'PRD-prds/PRD-SD-022.md';

    IF FOUND THEN
      fixed_count := fixed_count + 1;
      RAISE NOTICE '✅ Fixed: PRD-prds/PRD-SD-022.md → SD-022 (UUID: %)', sd_uuid_val;
    END IF;
  ELSE
    RAISE WARNING '⚠️  SD-022 not found in database';
  END IF;

  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 4: Delete MALFORMED test PRDs (2 PRDs)
  -- ========================================================================

  RAISE NOTICE 'Step 4: Deleting MALFORMED test PRDs...';

  -- Delete PRD---help
  DELETE FROM product_requirements_v2
  WHERE id = 'PRD---help';

  IF FOUND THEN
    deleted_count := deleted_count + 1;
    RAISE NOTICE '🗑️  Deleted: PRD---help (malformed test data)';
  END IF;

  -- Delete PRD---sd-id
  DELETE FROM product_requirements_v2
  WHERE id = 'PRD---sd-id';

  IF FOUND THEN
    deleted_count := deleted_count + 1;
    RAISE NOTICE '🗑️  Deleted: PRD---sd-id (malformed test data)';
  END IF;

  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 5: Summary Report
  -- ========================================================================

  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '📊 TIER 1 CLEANUP SUMMARY';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '  Fixed PRDs (sd_uuid populated): %', fixed_count;
  RAISE NOTICE '  Deleted PRDs (malformed): %', deleted_count;
  RAISE NOTICE '  Total processed: %', (fixed_count + deleted_count);
  RAISE NOTICE '';

  -- Check remaining NULL count
  DECLARE
    remaining_nulls INTEGER;
  BEGIN
    SELECT COUNT(*) INTO remaining_nulls
    FROM product_requirements_v2
    WHERE sd_uuid IS NULL;

    RAISE NOTICE '  PRDs with NULL sd_uuid remaining: %', remaining_nulls;
    RAISE NOTICE '';

    IF remaining_nulls = 0 THEN
      RAISE NOTICE '🎉 ALL PRDs FIXED! Ready to add NOT NULL constraint.';
    ELSIF remaining_nulls <= 18 THEN
      RAISE NOTICE '✅ Tier 1 complete. % PRDs remain for Tier 2 investigation.', remaining_nulls;
    ELSE
      RAISE WARNING '⚠️  More PRDs than expected remain. Expected ≤18, got %', remaining_nulls;
    END IF;
  END;

  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';

END $$;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to check results)
-- ============================================================================

-- Check Tier 1 PRDs were fixed
-- SELECT
--   p.id,
--   p.sd_uuid,
--   s.id as sd_id,
--   s.title as sd_title
-- FROM product_requirements_v2 p
-- LEFT JOIN strategic_directives_v2 s ON p.sd_uuid = s.uuid_id
-- WHERE p.id IN (
--   'PRD-BOARD-VISUAL-BUILDER-003',
--   'PRD-RECONNECT-006',
--   'PRD-prds/PRD-SD-016.md',
--   'PRD-prds/PRD-SD-022.md'
-- );

-- Check malformed PRDs were deleted
-- SELECT id FROM product_requirements_v2 WHERE id IN ('PRD---help', 'PRD---sd-id');
-- (should return 0 rows)

-- Check remaining NULL sd_uuid PRDs
-- SELECT id, title, status, created_at
-- FROM product_requirements_v2
-- WHERE sd_uuid IS NULL
-- ORDER BY created_at DESC;
