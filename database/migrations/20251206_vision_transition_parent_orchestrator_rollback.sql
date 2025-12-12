-- Rollback Migration: SD-VISION-TRANSITION-001 Parent Orchestrator Structure
-- SD: SD-VISION-TRANSITION-001D
-- Date: 2025-12-09
-- Purpose: Reverse the vision_transition_parent_orchestrator migration
--
-- USAGE: Execute this script ONLY if Migration Phase A needs to be reversed.
-- WARNING: This will DELETE all SD-VISION-TRANSITION-001 related SDs and restore
--          the original single SD (if backup exists).
--
-- ============================================================================
-- ROLLBACK SEQUENCE
-- ============================================================================

-- 1. Delete grandchildren first (D1-D6) - they depend on D
DELETE FROM strategic_directives_v2
WHERE id IN (
  'SD-VISION-TRANSITION-001D1',
  'SD-VISION-TRANSITION-001D2',
  'SD-VISION-TRANSITION-001D3',
  'SD-VISION-TRANSITION-001D4',
  'SD-VISION-TRANSITION-001D5',
  'SD-VISION-TRANSITION-001D6'
);

-- 2. Delete children (A-E) - they depend on parent
DELETE FROM strategic_directives_v2
WHERE id IN (
  'SD-VISION-TRANSITION-001A',
  'SD-VISION-TRANSITION-001B',
  'SD-VISION-TRANSITION-001C',
  'SD-VISION-TRANSITION-001D',
  'SD-VISION-TRANSITION-001E'
);

-- 3. Reset parent SD to non-orchestrator state (if it exists)
-- This restores the original metadata without child references
UPDATE strategic_directives_v2
SET
  metadata = jsonb_build_object(
    'original_scope', 'Full Vision v2.0 to v2.5 transition',
    'rollback_date', NOW()::TEXT,
    'rollback_reason', 'Migration Phase A reversed'
  ),
  status = 'deferred',
  updated_at = NOW()
WHERE id = 'SD-VISION-TRANSITION-001';

-- Alternatively, if full deletion is desired, uncomment below:
-- DELETE FROM strategic_directives_v2 WHERE id = 'SD-VISION-TRANSITION-001';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After rollback, verify with:
--
-- Check no children exist:
-- SELECT id FROM strategic_directives_v2 WHERE id LIKE 'SD-VISION-TRANSITION-001%';
-- Expected: Only 'SD-VISION-TRANSITION-001' (the parent) if UPDATE was used
--           OR no results if DELETE ALL was used
--
-- Check parent_sd_id references:
-- SELECT id FROM strategic_directives_v2 WHERE parent_sd_id = 'SD-VISION-TRANSITION-001';
-- Expected: 0 rows
--
-- SELECT id FROM strategic_directives_v2 WHERE parent_sd_id = 'SD-VISION-TRANSITION-001D';
-- Expected: 0 rows

-- ============================================================================
-- NOTES
-- ============================================================================
-- This rollback removes the hierarchical SD structure.
-- To restore the full hierarchy, re-run 20251206_vision_transition_parent_orchestrator.sql.
--
-- The parent SD (SD-VISION-TRANSITION-001) is preserved but reset to 'deferred' status.
-- This allows re-planning if needed without losing the original SD reference.
