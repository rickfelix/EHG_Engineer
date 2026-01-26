-- ============================================================================
-- FIX: Ensure parent SDs have metadata.is_parent set correctly
-- ============================================================================
-- SD-LEO-FIX-PARENT-BLOCK-001
--
-- Problem: When child SDs are created, the parent SD's sd_type is set to
-- 'orchestrator' but metadata.is_parent is NOT set. Database functions like
-- get_progress_breakdown() check metadata.is_parent, not sd_type.
--
-- Solution: Update the trigger to also set metadata.is_parent = true when
-- a child SD is created.
-- ============================================================================

-- Drop existing trigger first
DROP TRIGGER IF EXISTS trigger_auto_set_parent_orchestrator ON strategic_directives_v2;

-- Updated function that sets BOTH sd_type and metadata.is_parent
CREATE OR REPLACE FUNCTION auto_set_parent_orchestrator_type()
RETURNS TRIGGER AS $$
DECLARE
  current_parent_id VARCHAR;
  current_metadata JSONB;
BEGIN
  -- When a child SD is inserted with a parent_sd_id
  IF NEW.parent_sd_id IS NOT NULL THEN
    current_parent_id := NEW.parent_sd_id;

    -- Recursively update all ancestors
    WHILE current_parent_id IS NOT NULL LOOP
      -- Get current metadata
      SELECT COALESCE(metadata, '{}'::jsonb) INTO current_metadata
      FROM strategic_directives_v2
      WHERE id = current_parent_id;

      -- Update the parent's sd_type AND metadata.is_parent
      UPDATE strategic_directives_v2
      SET
        sd_type = 'orchestrator',
        metadata = current_metadata || jsonb_build_object('is_parent', true)
      WHERE id = current_parent_id
        AND (
          sd_type IS NULL
          OR sd_type != 'orchestrator'
          OR COALESCE((metadata->>'is_parent')::boolean, false) = false
        );

      -- Move up to the next parent in the hierarchy
      SELECT parent_sd_id INTO current_parent_id
      FROM strategic_directives_v2
      WHERE id = current_parent_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger for INSERT and UPDATE (when parent_sd_id changes)
CREATE TRIGGER trigger_auto_set_parent_orchestrator
  AFTER INSERT OR UPDATE OF parent_sd_id
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_parent_orchestrator_type();

-- Add comment explaining the trigger
COMMENT ON FUNCTION auto_set_parent_orchestrator_type() IS
  'Auto-sets parent SD sd_type to orchestrator AND metadata.is_parent=true when a child SD is created. Recursively updates all ancestors in multi-level hierarchies. Fixed by SD-LEO-FIX-PARENT-BLOCK-001.';

-- ============================================================================
-- BACKFILL: Fix existing parent SDs that are missing metadata.is_parent
-- ============================================================================

-- Update all SDs that have children but don't have metadata.is_parent = true
UPDATE strategic_directives_v2 parent_sd
SET
  metadata = COALESCE(parent_sd.metadata, '{}'::jsonb) || jsonb_build_object('is_parent', true)
WHERE EXISTS (
  SELECT 1 FROM strategic_directives_v2 child
  WHERE child.parent_sd_id = parent_sd.id
)
AND (
  parent_sd.metadata IS NULL
  OR COALESCE((parent_sd.metadata->>'is_parent')::boolean, false) = false
);

-- Verify the fix
SELECT
  id,
  sd_type,
  metadata->>'is_parent' as is_parent_flag,
  (SELECT COUNT(*) FROM strategic_directives_v2 child WHERE child.parent_sd_id = parent_sd.id) as child_count
FROM strategic_directives_v2 parent_sd
WHERE EXISTS (
  SELECT 1 FROM strategic_directives_v2 child
  WHERE child.parent_sd_id = parent_sd.id
)
ORDER BY id;
