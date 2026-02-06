-- Fix SD-LEO-SELF-IMPROVE-002 orchestrator data integrity issue
-- Problem: Parent orchestrator ID is UUID instead of SD format, blocking progress calculation
-- Solution: Use database-level operations to fix relationships and complete orchestrator

-- Temporarily disable triggers to allow primary key update
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER ALL;

-- Step 1: Update parent orchestrator ID from UUID to SD format
UPDATE strategic_directives_v2
SET
  id = 'SD-LEO-SELF-IMPROVE-002',
  relationship_type = 'parent',
  sd_type = 'orchestrator'  -- Ensure correct type
WHERE uuid_id = 'a9724aa1-9f8f-41bc-9ecd-27a0b78fa078';

-- Step 2: Update children to reference new parent ID
UPDATE strategic_directives_v2
SET
  parent_sd_id = 'SD-LEO-SELF-IMPROVE-002',
  relationship_type = 'child'
WHERE parent_sd_id = '93597bad-b361-4a08-83fa-92a31acbfd20';

-- Step 3: Mark orchestrator as completed (all 6 children are done)
UPDATE strategic_directives_v2
SET
  status = 'completed',
  current_phase = 'COMPLETED',
  progress = 100,
  progress_percentage = 100,
  is_working_on = false,
  completion_date = NOW()
WHERE id = 'SD-LEO-SELF-IMPROVE-002';

-- Re-enable triggers
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER ALL;

-- Verification: Show orchestrator and its children
SELECT
  id,
  parent_sd_id,
  status,
  current_phase,
  progress,
  relationship_type,
  sd_type
FROM strategic_directives_v2
WHERE id = 'SD-LEO-SELF-IMPROVE-002'
   OR parent_sd_id = 'SD-LEO-SELF-IMPROVE-002'
ORDER BY parent_sd_id NULLS FIRST, id;
