-- Migration: Auto-complete prior stages trigger
-- Purpose: When a venture_stage_work row is updated to stage_status = 'in_progress',
--          automatically set all rows for the same venture_id with a LOWER lifecycle_stage
--          that still have stage_status = 'in_progress' to stage_status = 'completed'.
-- This prevents the impossible state where two stages are both 'in_progress' simultaneously.
-- Date: 2026-03-16

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION fn_auto_complete_prior_stages()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stage_status = 'in_progress' AND (OLD.stage_status IS DISTINCT FROM 'in_progress') THEN
    UPDATE venture_stage_work
    SET stage_status = 'completed',
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE venture_id = NEW.venture_id
      AND lifecycle_stage < NEW.lifecycle_stage
      AND stage_status = 'in_progress';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS trg_auto_complete_prior_stages ON venture_stage_work;

-- Create the trigger
CREATE TRIGGER trg_auto_complete_prior_stages
  BEFORE UPDATE ON venture_stage_work
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_complete_prior_stages();

-- Rollback SQL (for reference):
-- DROP TRIGGER IF EXISTS trg_auto_complete_prior_stages ON venture_stage_work;
-- DROP FUNCTION IF EXISTS fn_auto_complete_prior_stages();
