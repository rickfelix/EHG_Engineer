-- Fix SD-LEO-SELF-IMPROVE-002 orchestrator ID and complete it
-- Issue: Parent orchestrator has UUID as id instead of SD-XXX format
-- All 6 children are completed and reference the UUID correctly via FK

-- Step 1: Update the parent orchestrator ID from UUID to SD format
-- This will cascade to children via FK constraint
UPDATE strategic_directives_v2
SET
  id = 'SD-LEO-SELF-IMPROVE-002',
  relationship_type = 'parent'  -- Fix relationship type to parent
WHERE uuid_id = 'a9724aa1-9f8f-41bc-9ecd-27a0b78fa078';

-- Step 2: Update children's parent_sd_id to reference new ID
-- This is necessary because FK constraint references id column
UPDATE strategic_directives_v2
SET
  parent_sd_id = 'SD-LEO-SELF-IMPROVE-002',
  relationship_type = 'child'  -- Fix relationship type to child
WHERE parent_sd_id = '93597bad-b361-4a08-83fa-92a31acbfd20';

-- Step 3: Mark orchestrator as completed since all children are done
UPDATE strategic_directives_v2
SET
  status = 'completed',
  current_phase = 'COMPLETED',
  progress = 100,
  is_working_on = false,
  completion_date = NOW()
WHERE id = 'SD-LEO-SELF-IMPROVE-002';

-- Verification queries (informational only)
-- SELECT id, parent_sd_id, status, current_phase, relationship_type
-- FROM strategic_directives_v2
-- WHERE id = 'SD-LEO-SELF-IMPROVE-002' OR parent_sd_id = 'SD-LEO-SELF-IMPROVE-002';
