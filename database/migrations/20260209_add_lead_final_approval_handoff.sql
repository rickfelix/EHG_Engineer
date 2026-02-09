-- Migration: Add LEAD-FINAL-APPROVAL to handoff_type constraint
-- Date: 2026-02-09
-- Reason: Workflow templates reference LEAD-FINAL-APPROVAL but constraint blocks it
-- Impact: Allows final approval handoff for completion

BEGIN;

-- Drop the old constraint
ALTER TABLE sd_phase_handoffs 
  DROP CONSTRAINT IF EXISTS sd_phase_handoffs_handoff_type_check;

-- Add new constraint with LEAD-FINAL-APPROVAL
ALTER TABLE sd_phase_handoffs
  ADD CONSTRAINT sd_phase_handoffs_handoff_type_check
  CHECK (handoff_type IN (
    'LEAD-TO-PLAN',
    'PLAN-TO-EXEC',
    'EXEC-TO-PLAN',
    'PLAN-TO-LEAD',
    'LEAD-FINAL-APPROVAL'
  ));

-- Update from_phase constraint to allow LEAD for LEAD-FINAL-APPROVAL
-- (LEAD-FINAL-APPROVAL has from_phase=LEAD, to_phase=LEAD)
-- The existing constraint already allows LEAD, so no change needed

COMMENT ON CONSTRAINT sd_phase_handoffs_handoff_type_check ON sd_phase_handoffs IS
'Valid handoff types including LEAD-FINAL-APPROVAL for SD completion';

COMMIT;
