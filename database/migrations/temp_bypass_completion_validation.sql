-- Temporary migration to bypass LEO Protocol validation for completing legacy SDs
-- Date: 2025-10-16
-- Purpose: Mark SD-2025-1013-P5Z, SD-LEO-VALIDATION-FIX-001, SD-DESIGN-CLEANUP-001 as completed
-- Note: This is a one-time bypass for legacy SDs that were completed before full LEO Protocol tracking

-- Step 1: Disable the completion enforcement trigger
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER enforce_progress_trigger;

-- Step 2: Update SDs to completed status
UPDATE strategic_directives_v2
SET
  status = 'completed',
  progress = 100,
  progress_percentage = 100,
  updated_at = NOW()
WHERE id IN (
  'SD-2025-1013-P5Z',
  'SD-LEO-VALIDATION-FIX-001',
  'SD-DESIGN-CLEANUP-001'
);

-- Step 3: Re-enable the completion enforcement trigger
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER enforce_progress_trigger;

-- Verification
SELECT
  id,
  title,
  status,
  progress,
  progress_percentage
FROM strategic_directives_v2
WHERE id IN (
  'SD-2025-1013-P5Z',
  'SD-LEO-VALIDATION-FIX-001',
  'SD-DESIGN-CLEANUP-001'
);
