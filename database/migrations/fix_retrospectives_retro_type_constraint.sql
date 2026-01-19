-- Fix retrospectives_retro_type_check constraint to include handoff types
-- Root cause: Handoff executors use 'LEAD_TO_PLAN', 'PLAN_TO_EXEC', etc. as retro_type
-- but the constraint only allowed: ARCHITECTURE_DECISION, INCIDENT, SD_COMPLETION

-- Drop the existing constraint
ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS retrospectives_retro_type_check;

-- Add new constraint with all valid handoff types
ALTER TABLE retrospectives ADD CONSTRAINT retrospectives_retro_type_check
CHECK (retro_type IN (
  -- Original types
  'ARCHITECTURE_DECISION',
  'INCIDENT',
  'SD_COMPLETION',
  -- Handoff types (added)
  'LEAD_TO_PLAN',
  'PLAN_TO_EXEC',
  'EXEC_TO_PLAN',
  'PLAN_TO_LEAD',
  'LEAD_FINAL_APPROVAL',
  'HANDOFF'
));

-- Verify the constraint was created
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'retrospectives'::regclass;
