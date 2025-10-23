-- ============================================================================
-- Update sd_phase_handoffs.handoff_type CHECK Constraint to All-Uppercase
--
-- Purpose: Support case-insensitive handoff type input in unified-handoff-system.js
-- Context: Script normalizes all input to uppercase (e.g., "exec-to-plan" → "EXEC-TO-PLAN")
--          but database constraint only allowed mixed-case ("EXEC-to-PLAN")
--
-- Changes:
-- 1. Disable protection trigger temporarily
-- 2. Drop old CHECK constraint
-- 3. Update existing records from mixed-case to all-uppercase
-- 4. Add new CHECK constraint with all-uppercase values
-- 5. Re-enable protection trigger
--
-- Backward Compatibility: Maintains same 4 handoff types, just uppercase format
-- Risk: LOW - Constraint change only, no data loss
-- ============================================================================

-- Step 1: Disable the trigger_protect_migrated trigger temporarily
ALTER TABLE sd_phase_handoffs DISABLE TRIGGER trigger_protect_migrated;

-- Step 2: Drop old CHECK constraint
ALTER TABLE sd_phase_handoffs
DROP CONSTRAINT IF EXISTS sd_phase_handoffs_handoff_type_check;

-- Step 3: Update existing records to all-uppercase format
UPDATE sd_phase_handoffs
SET handoff_type = UPPER(REPLACE(handoff_type, '-to-', '-TO-'))
WHERE handoff_type IN ('LEAD-to-PLAN', 'PLAN-to-EXEC', 'EXEC-to-PLAN', 'PLAN-to-LEAD');

-- Step 4: Add new CHECK constraint with all-uppercase values
ALTER TABLE sd_phase_handoffs
ADD CONSTRAINT sd_phase_handoffs_handoff_type_check
CHECK (handoff_type IN ('LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'));

-- Step 5: Re-enable the protection trigger
ALTER TABLE sd_phase_handoffs ENABLE TRIGGER trigger_protect_migrated;

-- Verification query (optional, for manual testing)
-- SELECT handoff_type, COUNT(*)
-- FROM sd_phase_handoffs
-- GROUP BY handoff_type;

COMMENT ON CONSTRAINT sd_phase_handoffs_handoff_type_check ON sd_phase_handoffs IS
  'Validates handoff types are all-uppercase format. unified-handoff-system.js auto-normalizes any case input to uppercase.';
