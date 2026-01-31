-- Migration: Add CHECK constraint to prevent invalid/hallucinated phases
-- Date: 2026-01-31
-- Issue: RCA identified that current_phase column has no constraint, allowing arbitrary values
-- Pattern: PAT-WORKFLOW-001

-- =============================================================================
-- STEP 1: Normalize existing data (fix case inconsistencies)
-- =============================================================================

-- Normalize 'completed' (lowercase) to 'COMPLETED'
UPDATE strategic_directives_v2
SET current_phase = 'COMPLETED'
WHERE current_phase = 'completed';

-- Normalize 'COMPLETE' to 'COMPLETED' for consistency
UPDATE strategic_directives_v2
SET current_phase = 'COMPLETED'
WHERE current_phase = 'COMPLETE';

-- =============================================================================
-- STEP 2: Define canonical phases based on LEO Protocol workflow
-- =============================================================================
--
-- The LEO Protocol workflow is:
--
--   LEAD → PLAN → EXEC → PLAN (verify) → LEAD (final) → COMPLETED
--
--   Handoffs:
--   1. LEAD-TO-PLAN
--   2. PLAN-TO-EXEC
--   3. EXEC-TO-PLAN
--   4. PLAN-TO-LEAD
--   5. LEAD-FINAL-APPROVAL
--
-- Valid phases:
--   LEAD phases:       LEAD, LEAD_APPROVAL, LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL
--   PLAN phases:       PLAN_PRD, PLAN_VERIFICATION
--   EXEC phases:       EXEC, EXEC_COMPLETE
--   Terminal phases:   COMPLETED, CANCELLED
--
-- =============================================================================

-- =============================================================================
-- STEP 3: Add CHECK constraint
-- =============================================================================

-- Drop constraint if it exists (idempotent)
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS strategic_directives_v2_current_phase_check;

-- Add the CHECK constraint with all valid phases
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT strategic_directives_v2_current_phase_check
CHECK (current_phase IN (
  -- LEAD phases
  'LEAD',
  'LEAD_APPROVAL',
  'LEAD_COMPLETE',
  'LEAD_FINAL',
  'LEAD_FINAL_APPROVAL',

  -- PLAN phases
  'PLAN_PRD',
  'PLAN_VERIFICATION',

  -- EXEC phases
  'EXEC',
  'EXEC_COMPLETE',

  -- Terminal phases
  'COMPLETED',
  'CANCELLED'
));

-- =============================================================================
-- STEP 4: Add comment documenting the constraint
-- =============================================================================

COMMENT ON COLUMN strategic_directives_v2.current_phase IS
'Current workflow phase. Valid values enforced by CHECK constraint:
LEAD phases: LEAD, LEAD_APPROVAL, LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL
PLAN phases: PLAN_PRD, PLAN_VERIFICATION
EXEC phases: EXEC, EXEC_COMPLETE
Terminal: COMPLETED, CANCELLED

Workflow: LEAD → PLAN → EXEC → PLAN(verify) → LEAD(final) → COMPLETED
See: docs/reference/leo-protocol-phases.md';

-- =============================================================================
-- STEP 5: Verify the constraint works
-- =============================================================================

-- This should succeed (valid phase)
-- UPDATE strategic_directives_v2 SET current_phase = 'EXEC' WHERE id = 'test' LIMIT 0;

-- This would fail (invalid phase) - commented out as it would error
-- UPDATE strategic_directives_v2 SET current_phase = 'FAKE_PHASE' WHERE id = 'test';

-- =============================================================================
-- Rollback (if needed):
-- ALTER TABLE strategic_directives_v2 DROP CONSTRAINT strategic_directives_v2_current_phase_check;
-- =============================================================================
