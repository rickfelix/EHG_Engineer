-- Migration: Enforce Child SD Creation Timing
-- Date: 2026-01-01
-- Purpose: Prevent child SD creation before parent reaches PLAN phase
-- Layer 1 of Layered Defense (Database Enforcement)
--
-- LEO Protocol Rule: Children are CREATED during parent's PLAN phase, not before.
-- This trigger enforces the workflow: Parent LEAD → Parent PLAN (creates children) → Child LEAD

-- Drop existing trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS trg_enforce_child_creation_timing ON strategic_directives_v2;
DROP FUNCTION IF EXISTS enforce_child_creation_timing();

-- Create the enforcement function
CREATE OR REPLACE FUNCTION enforce_child_creation_timing()
RETURNS TRIGGER AS $$
DECLARE
  parent_phase TEXT;
  parent_status TEXT;
  parent_title TEXT;
BEGIN
  -- Only check for child SDs (has parent_sd_id)
  IF NEW.parent_sd_id IS NOT NULL AND NEW.relationship_type = 'child' THEN
    -- Get parent's current phase and status
    SELECT current_phase, status, title
    INTO parent_phase, parent_status, parent_title
    FROM strategic_directives_v2
    WHERE id = NEW.parent_sd_id;

    -- If parent not found, allow (might be a data migration)
    IF parent_phase IS NULL THEN
      RETURN NEW;
    END IF;

    -- Parent must be in PLAN or later phase for children to be created
    -- Valid parent phases: PLAN, EXEC (not LEAD or NULL)
    IF parent_phase NOT IN ('PLAN', 'EXEC') THEN
      RAISE EXCEPTION
        'LEO Protocol Violation: Child SD cannot be created until parent SD is in PLAN phase. ' ||
        'Parent "%" is currently in % phase. ' ||
        'Workflow: Parent must complete LEAD → enter PLAN → then create children.',
        COALESCE(parent_title, NEW.parent_sd_id::TEXT),
        COALESCE(parent_phase, 'NULL');
    END IF;

    -- Log successful child creation
    RAISE NOTICE 'Child SD created: % under parent % (phase: %)',
      NEW.title, parent_title, parent_phase;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT only (child creation)
CREATE TRIGGER trg_enforce_child_creation_timing
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_child_creation_timing();

-- Add helpful comment
COMMENT ON FUNCTION enforce_child_creation_timing() IS
  'LEO Protocol Layer 1: Enforces that child SDs can only be created when parent is in PLAN or EXEC phase. ' ||
  'Prevents premature child creation before parent completes LEAD approval.';

-- Verification query (can be run after migration)
-- SELECT
--   c.id as child_id,
--   c.title as child_title,
--   c.parent_sd_id,
--   p.title as parent_title,
--   p.current_phase as parent_phase,
--   p.status as parent_status
-- FROM strategic_directives_v2 c
-- JOIN strategic_directives_v2 p ON c.parent_sd_id = p.id
-- WHERE c.relationship_type = 'child';
