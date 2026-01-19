-- Fix retrospectives table constraint to allow handoff-related retro_type values
--
-- Root Cause: Handoff executors in scripts/modules/handoff/executors/ use retro_type
-- values like 'LEAD_TO_PLAN' but the database constraint only allowed
-- 'ARCHITECTURE_DECISION', 'INCIDENT', 'SD_COMPLETION'
--
-- Impact: Handoff creation fails with constraint violation errors
--
-- Solution: Drop existing constraint and add new one with all valid handoff types
--
-- Execute this in Supabase SQL Editor with elevated privileges

-- Step 1: Drop the existing restrictive constraint
ALTER TABLE retrospectives
DROP CONSTRAINT IF EXISTS retrospectives_retro_type_check;

-- Step 2: Add new constraint with all valid handoff types
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_retro_type_check
CHECK (retro_type IN (
  -- Original values
  'ARCHITECTURE_DECISION',
  'INCIDENT',
  'SD_COMPLETION',
  -- Handoff-related values (NEW)
  'LEAD_TO_PLAN',
  'PLAN_TO_EXEC',
  'EXEC_TO_PLAN',
  'PLAN_TO_LEAD',
  'LEAD_FINAL_APPROVAL',
  'HANDOFF',
  -- Additional retrospective types
  'SPRINT',
  'MILESTONE',
  'WEEKLY',
  'MONTHLY',
  'RELEASE',
  'AUDIT'
));

-- Verification query (run after migration)
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'retrospectives_retro_type_check';
