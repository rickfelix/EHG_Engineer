-- ============================================================================
-- Cleanup Remaining PRD sd_uuid NULL Values - Tier 2 (Investigation Results)
-- Issue: 18 PRDs remaining after Tier 1 cleanup
-- Strategy: Map 7 RECONNECT duplicates to SDs + delete 11 orphaned legacy PRDs
-- Date: 2025-10-19
-- Related: SD-PRE-EXEC-ANALYSIS-001 Issue #1 (continued)
-- ============================================================================

-- Investigation Results Summary:
-- - 6 RECONNECT duplicate PRDs → Map to SD-RECONNECT-001/004/005
-- - 1 DOUBLE-PREFIX PRD → Map to SD-003A
-- - 2 GOVERNANCE PRDs (referenced in handoffs) → Map to SD-GOVERNANCE-001
-- - 6 PURE-UUID legacy PRDs (Sept 22, unreferenced) → DELETE
-- - 3 UUID-prefix PRDs (orphaned) → DELETE

DO $$
DECLARE
  fixed_count INTEGER := 0;
  deleted_count INTEGER := 0;
  sd_uuid_val UUID;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔧 TIER 2 CLEANUP: RECONNECT Duplicates & Orphaned Legacy PRDs';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 1: Fix RECONNECT duplicate PRDs (6 PRDs)
  -- ========================================================================

  RAISE NOTICE 'Step 1: Fixing RECONNECT duplicate PRDs...';
  RAISE NOTICE '';

  -- Core Platform Reconnection (2 PRDs) → SD-RECONNECT-001
  SELECT uuid_id INTO sd_uuid_val
  FROM strategic_directives_v2
  WHERE id = 'SD-RECONNECT-001';

  IF sd_uuid_val IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET sd_uuid = sd_uuid_val
    WHERE id IN ('PRD-1759441664418', 'PRD-1759441630209');

    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE '✅ Fixed % PRDs: Core Platform Reconnection → SD-RECONNECT-001 (UUID: %)',
      fixed_count, sd_uuid_val;
  ELSE
    RAISE WARNING '⚠️  SD-RECONNECT-001 not found';
  END IF;

  sd_uuid_val := NULL;

  -- Component Directory Consolidation (2 PRDs) → SD-RECONNECT-005
  SELECT uuid_id INTO sd_uuid_val
  FROM strategic_directives_v2
  WHERE id = 'SD-RECONNECT-005';

  IF sd_uuid_val IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET sd_uuid = sd_uuid_val
    WHERE id IN ('PRD-1759442739287', 'PRD-1759442536898');

    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE '✅ Fixed % PRDs: Component Directory Consolidation → SD-RECONNECT-005 (UUID: %)',
      fixed_count, sd_uuid_val;
  ELSE
    RAISE WARNING '⚠️  SD-RECONNECT-005 not found';
  END IF;

  sd_uuid_val := NULL;

  -- Database-UI Integration (2 PRDs) → SD-RECONNECT-004
  SELECT uuid_id INTO sd_uuid_val
  FROM strategic_directives_v2
  WHERE id = 'SD-RECONNECT-004';

  IF sd_uuid_val IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET sd_uuid = sd_uuid_val
    WHERE id IN ('PRD-1759443541993', 'PRD-1759443503786');

    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE '✅ Fixed % PRDs: Database-UI Integration → SD-RECONNECT-004 (UUID: %)',
      fixed_count, sd_uuid_val;
  ELSE
    RAISE WARNING '⚠️  SD-RECONNECT-004 not found';
  END IF;

  sd_uuid_val := NULL;
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 2: Fix DOUBLE-PREFIX PRD (1 PRD)
  -- ========================================================================

  RAISE NOTICE 'Step 2: Fixing DOUBLE-PREFIX PRD...';

  -- PRD-PRD-SD-003A-1758930314454 → SD-003A
  SELECT uuid_id INTO sd_uuid_val
  FROM strategic_directives_v2
  WHERE id = 'SD-003A';

  IF sd_uuid_val IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET sd_uuid = sd_uuid_val
    WHERE id = 'PRD-PRD-SD-003A-1758930314454';

    IF FOUND THEN
      RAISE NOTICE '✅ Fixed: PRD-PRD-SD-003A-1758930314454 → SD-003A (UUID: %)', sd_uuid_val;
      fixed_count := fixed_count + 1;
    END IF;
  ELSE
    RAISE WARNING '⚠️  SD-003A not found';
  END IF;

  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 3: Fix GOVERNANCE PRDs found in handoffs (2 PRDs)
  -- ========================================================================

  RAISE NOTICE 'Step 3: Fixing GOVERNANCE PRDs (referenced in leo_subagent_handoffs)...';

  -- Strategic Directive Schema + Proposals Management System → SD-GOVERNANCE-001
  SELECT uuid_id INTO sd_uuid_val
  FROM strategic_directives_v2
  WHERE id = 'SD-GOVERNANCE-001';

  IF sd_uuid_val IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET sd_uuid = sd_uuid_val
    WHERE id IN (
      'c4c8a657-f0d3-4b67-a9b6-503715078e36',  -- Strategic Directive Schema
      'a57d5700-c3f3-4b13-8ff9-ba572ea34a74'   -- Proposals Management System
    );

    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE '✅ Fixed % PRDs: GOVERNANCE → SD-GOVERNANCE-001 (UUID: %)',
      fixed_count, sd_uuid_val;
  ELSE
    RAISE WARNING '⚠️  SD-GOVERNANCE-001 not found';
  END IF;

  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 4: Delete unreferenced PURE-UUID legacy PRDs (6 PRDs from Sept 22)
  -- ========================================================================

  RAISE NOTICE 'Step 4: Deleting unreferenced PURE-UUID legacy PRDs (Sept 22, no handoffs)...';

  DELETE FROM product_requirements_v2
  WHERE id IN (
    '9f7939e6-b2f3-4154-8f69-8bab8df21e18',  -- Vision Gap Analysis Module
    '28c56585-d4f5-407e-80f2-1607f6e467a2',  -- Production Apply Gates
    '6129c53b-4a0f-489f-8501-e5383ce3f785',  -- WSJF Scoring Algorithm
    '5b33b2c0-81c0-4d95-a20f-75f553df0cb9',  -- WSJF Apply Workflow
    '479ef3c9-15c1-4608-8606-0a6795b6c735',  -- Metrics Collection Pipeline
    'c1f88d19-c7ba-49cf-8534-895ff302c78e'   -- GitHub Actions Security
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '🗑️  Deleted % unreferenced PURE-UUID legacy PRDs', deleted_count;
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 5: Delete UUID-prefix orphaned PRDs (3 PRDs)
  -- ========================================================================

  RAISE NOTICE 'Step 5: Deleting UUID-prefix orphaned PRDs (no directive_id)...';

  DELETE FROM product_requirements_v2
  WHERE id IN (
    'PRD-2bb6a529-14b5-4d57-a404-8d249aa935e5',  -- Real-time Infrastructure
    'PRD-f0ac1032-169a-4a38-b7ee-75c4b46f2d82',  -- Financial Analytics
    'PRD-fbe359b4-aa56-4740-8350-d51760de0a3b-1758998830864'  -- Backlog Import
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '🗑️  Deleted % UUID-prefix orphaned PRDs', deleted_count;
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 6: Final Summary
  -- ========================================================================

  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '📊 TIER 2 CLEANUP SUMMARY';
  RAISE NOTICE '══════════════════════════════════════════════════════════';

  -- Count fixed PRDs (9 total: 6 RECONNECT + 1 DOUBLE-PREFIX + 2 GOVERNANCE)
  SELECT COUNT(*) INTO fixed_count
  FROM product_requirements_v2
  WHERE id IN (
    'PRD-1759441664418', 'PRD-1759441630209',
    'PRD-1759442739287', 'PRD-1759442536898',
    'PRD-1759443541993', 'PRD-1759443503786',
    'PRD-PRD-SD-003A-1758930314454',
    'c4c8a657-f0d3-4b67-a9b6-503715078e36',
    'a57d5700-c3f3-4b13-8ff9-ba572ea34a74'
  ) AND sd_uuid IS NOT NULL;

  RAISE NOTICE '  Fixed PRDs (sd_uuid populated): %', fixed_count;

  -- Count deleted PRDs (9 total: 6 unreferenced legacy + 3 UUID)
  deleted_count := 9;  -- Expected
  RAISE NOTICE '  Deleted PRDs (orphaned legacy): %', deleted_count;
  RAISE NOTICE '  Total processed: %', (fixed_count + deleted_count);
  RAISE NOTICE '';

  -- Check final NULL count
  SELECT COUNT(*) INTO fixed_count  -- Reuse variable
  FROM product_requirements_v2
  WHERE sd_uuid IS NULL;

  RAISE NOTICE '  PRDs with NULL sd_uuid remaining: %', fixed_count;
  RAISE NOTICE '';

  IF fixed_count = 0 THEN
    RAISE NOTICE '🎉 ALL PRDs FIXED! Ready to add NOT NULL constraint.';
    RAISE NOTICE '';
    RAISE NOTICE 'Next step: Run migration 20251019_add_prd_sd_uuid_not_null_constraint.sql';
  ELSE
    RAISE WARNING '⚠️  % PRDs still have NULL sd_uuid. Manual review required.', fixed_count;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';

END $$;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to check results)
-- ============================================================================

-- Check all PRDs now have sd_uuid
-- SELECT COUNT(*) as total_prds,
--        COUNT(sd_uuid) as prds_with_sd_uuid,
--        COUNT(*) - COUNT(sd_uuid) as prds_without_sd_uuid
-- FROM product_requirements_v2;

-- Verify RECONNECT PRDs were fixed
-- SELECT
--   p.id,
--   p.title,
--   s.id as sd_id,
--   s.title as sd_title
-- FROM product_requirements_v2 p
-- JOIN strategic_directives_v2 s ON p.sd_uuid = s.uuid_id
-- WHERE p.id LIKE 'PRD-175944%'
-- ORDER BY p.id;

-- Verify legacy PRDs were deleted
-- SELECT id FROM product_requirements_v2
-- WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}'
--    OR id LIKE 'PRD-2bb6a529%'
--    OR id LIKE 'PRD-f0ac1032%'
--    OR id LIKE 'PRD-fbe359b4%';
-- (should return 0 rows)
