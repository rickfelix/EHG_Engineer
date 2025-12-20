-- Migration: Auto-set parent SD type to orchestrator when child is added
-- Purpose: Prevents misclassification of parent SDs (e.g., SD-HARDENING-V2-004 was typed as 'docs' instead of 'orchestrator')
-- Root Cause Fix: Ensures any SD that has children is automatically typed as 'orchestrator'
-- Multi-level: Recursively updates all ancestors in the hierarchy

-- Function to auto-set parent SD type to orchestrator when child is added
-- Handles multi-level hierarchies (children, grandchildren, etc.)
CREATE OR REPLACE FUNCTION auto_set_parent_orchestrator_type()
RETURNS TRIGGER AS $$
DECLARE
  current_parent_id VARCHAR;
BEGIN
  -- When a child SD is inserted with a parent_sd_id
  IF NEW.parent_sd_id IS NOT NULL THEN
    current_parent_id := NEW.parent_sd_id;

    -- Recursively update all ancestors to orchestrator type
    WHILE current_parent_id IS NOT NULL LOOP
      -- Update the parent's sd_type to orchestrator if not already
      UPDATE strategic_directives_v2
      SET sd_type = 'orchestrator'
      WHERE id = current_parent_id
        AND (sd_type IS NULL OR sd_type != 'orchestrator');

      -- Move up to the next parent in the hierarchy
      SELECT parent_sd_id INTO current_parent_id
      FROM strategic_directives_v2
      WHERE id = current_parent_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_set_parent_orchestrator ON strategic_directives_v2;

-- Create trigger for INSERT and UPDATE (when parent_sd_id changes)
CREATE TRIGGER trigger_auto_set_parent_orchestrator
  AFTER INSERT OR UPDATE OF parent_sd_id
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_parent_orchestrator_type();

-- Add comment explaining the trigger
COMMENT ON FUNCTION auto_set_parent_orchestrator_type() IS
  'Auto-sets parent SD sd_type to orchestrator when a child SD is created. Recursively updates all ancestors in multi-level hierarchies.';
