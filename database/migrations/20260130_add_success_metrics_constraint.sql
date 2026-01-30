-- Migration: Add check constraint to prevent empty success_metrics
-- Root Cause: AUTO-PROCEED stopped because SDs were created with empty success_metrics
-- Pattern: PAT-AUTOPROCEED-EMPTY-ARRAY
--
-- This constraint ensures:
-- 1. success_metrics cannot be an empty array for NEW inserts/updates
-- 2. success_metrics must have at least one valid entry
-- 3. NOT VALID: Existing rows are NOT validated (194 historical SDs have empty arrays)
-- 4. Historical data can be backfilled gradually or left as-is for completed/cancelled SDs

-- First, let's see how many SDs have empty success_metrics (for awareness)
-- SELECT COUNT(*) as empty_metrics_count
-- FROM strategic_directives_v2
-- WHERE success_metrics IS NULL OR success_metrics = '[]'::jsonb;

-- Add the check constraint
-- Note: We use jsonb_array_length which returns NULL for non-arrays, so we handle that case
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT success_metrics_not_empty
CHECK (
  -- Allow NULL (will be populated by triggers/defaults)
  success_metrics IS NULL
  OR
  -- If array, must have at least 1 element
  jsonb_array_length(success_metrics) >= 1
) NOT VALID;  -- Skip validation of existing rows

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT success_metrics_not_empty ON strategic_directives_v2 IS
'Prevents empty success_metrics arrays. Root cause fix for AUTO-PROCEED stopping on validation failure. SDs must have measurable success criteria.';

-- Also add constraint for success_criteria (same issue)
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT success_criteria_not_empty
CHECK (
  success_criteria IS NULL
  OR
  jsonb_array_length(success_criteria) >= 1
) NOT VALID;  -- Skip validation of existing rows

COMMENT ON CONSTRAINT success_criteria_not_empty ON strategic_directives_v2 IS
'Prevents empty success_criteria arrays. Each SD must have acceptance criteria defined.';

-- ============================================================
-- OPTIONAL: Validate existing data after backfill
-- ============================================================
-- After running data healing on historical SDs, you can validate the constraints:
--
-- ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT success_metrics_not_empty;
-- ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT success_criteria_not_empty;
--
-- Note: VALIDATE will fail if any existing rows violate the constraint.
-- First run the healing script for completed/cancelled SDs if validation is desired.
