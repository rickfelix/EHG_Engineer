-- Migration: Fix risk_assessments phase check constraint
-- Issue: BL-INF-2337B - risk_assessments phase check constraint violation
-- RCA: Constraint allows only 4 specific phase names (LEAD_PRE_APPROVAL, PLAN_PRD, etc.)
--      but code may pass standard LEO phases (LEAD, PLAN, EXEC, VERIFY)
-- Solution: Expand constraint to accept both detailed and standard phase names

-- Step 1: Drop the existing constraint
ALTER TABLE risk_assessments
DROP CONSTRAINT IF EXISTS risk_assessments_phase_check;

-- Step 2: Add updated constraint accepting both formats
ALTER TABLE risk_assessments
ADD CONSTRAINT risk_assessments_phase_check
CHECK (phase IN (
  -- Detailed phase names (original)
  'LEAD_PRE_APPROVAL',
  'PLAN_PRD',
  'EXEC_IMPL',
  'PLAN_VERIFY',
  -- Standard LEO phase names (added)
  'LEAD',
  'LEAD_APPROVAL',
  'PLAN',
  'EXEC',
  'VERIFY',
  'PLAN_VERIFICATION'
));

-- Add comment documenting the change
COMMENT ON CONSTRAINT risk_assessments_phase_check ON risk_assessments IS
'Valid phase values for risk assessments. Accepts both detailed (LEAD_PRE_APPROVAL) and standard (LEAD) phase names. Updated 2026-01-30 per RCA BL-INF-2337B';

-- Verification query (run after migration to confirm)
-- SELECT DISTINCT phase FROM risk_assessments;
