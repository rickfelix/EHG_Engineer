-- Migration: Enforce orchestrator type for parent SDs
-- Date: 2025-12-27
-- Purpose: Auto-set sd_type='orchestrator' when an SD becomes a parent (has children)
--
-- Governance Gap Identified:
--   16 out of 32 parent SDs were incorrectly typed (feature, infrastructure, etc.)
--   Parent SDs should always be orchestrator type because their completion
--   depends on children completing, not on implementation phases.

-- ============================================================================
-- PART 1: Fix existing mistyped parent SDs
-- ============================================================================

-- Update all SDs that have children to be orchestrator type
UPDATE strategic_directives_v2
SET
  sd_type = 'orchestrator',
  updated_at = NOW()
WHERE id IN (
  SELECT DISTINCT parent_sd_id
  FROM strategic_directives_v2
  WHERE parent_sd_id IS NOT NULL
)
AND sd_type != 'orchestrator';

-- ============================================================================
-- PART 2: Create trigger to auto-enforce orchestrator type
-- ============================================================================

-- Trigger function: When a child SD is created/updated with parent_sd_id,
-- ensure the parent SD is set to orchestrator type
CREATE OR REPLACE FUNCTION enforce_parent_orchestrator_type()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if parent_sd_id is set
  IF NEW.parent_sd_id IS NOT NULL THEN
    -- Update parent to orchestrator type if not already
    UPDATE strategic_directives_v2
    SET
      sd_type = 'orchestrator',
      updated_at = NOW()
    WHERE id = NEW.parent_sd_id
    AND sd_type != 'orchestrator';

    -- Log the automatic type change
    IF FOUND THEN
      RAISE NOTICE 'LEO Protocol: Auto-set sd_type=orchestrator for parent SD % (child: %)',
        NEW.parent_sd_id, NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_enforce_parent_orchestrator_type ON strategic_directives_v2;

-- Create trigger on INSERT and UPDATE
CREATE TRIGGER trg_enforce_parent_orchestrator_type
  AFTER INSERT OR UPDATE OF parent_sd_id
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_parent_orchestrator_type();

-- ============================================================================
-- PART 3: Add comment for documentation
-- ============================================================================

COMMENT ON FUNCTION enforce_parent_orchestrator_type() IS
'LEO Protocol Governance: Automatically sets sd_type=orchestrator for any SD
that becomes a parent (when another SD references it via parent_sd_id).

Rationale:
- Parent SDs completion depends on children completing
- Parent SDs should not be subject to feature/bugfix validation gates
- Progress for parent SDs is calculated from child completion percentage

Created: 2025-12-27 as fix for governance gap where 16/32 parent SDs were mistyped.';
