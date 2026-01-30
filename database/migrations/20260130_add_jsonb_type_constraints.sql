-- Migration: Add JSONB type validation constraints
-- Purpose: Ensure JSONB columns contain proper arrays, not stringified JSON
-- Root Cause: Scripts like create-security-sds.js were calling JSON.stringify() before insert
-- Pattern: PAT-JSONB-STRING-TYPE

-- ============================================================
-- 1. JSONB Type Validation Constraints
-- ============================================================
-- These ensure that JSONB columns contain arrays, not strings

-- success_criteria must be an array (not a string)
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT success_criteria_is_array
CHECK (
  success_criteria IS NULL
  OR jsonb_typeof(success_criteria) = 'array'
) NOT VALID;

COMMENT ON CONSTRAINT success_criteria_is_array ON strategic_directives_v2 IS
'Ensures success_criteria is a proper JSONB array, not a stringified JSON. Prevents JSON.stringify() bugs.';

-- success_metrics must be an array (not a string)
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT success_metrics_is_array
CHECK (
  success_metrics IS NULL
  OR jsonb_typeof(success_metrics) = 'array'
) NOT VALID;

COMMENT ON CONSTRAINT success_metrics_is_array ON strategic_directives_v2 IS
'Ensures success_metrics is a proper JSONB array, not a stringified JSON.';

-- key_principles must be an array (not a string)
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT key_principles_is_array
CHECK (
  key_principles IS NULL
  OR jsonb_typeof(key_principles) = 'array'
) NOT VALID;

COMMENT ON CONSTRAINT key_principles_is_array ON strategic_directives_v2 IS
'Ensures key_principles is a proper JSONB array, not a stringified JSON.';

-- key_changes must be an array (not a string)
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT key_changes_is_array
CHECK (
  key_changes IS NULL
  OR jsonb_typeof(key_changes) = 'array'
) NOT VALID;

COMMENT ON CONSTRAINT key_changes_is_array ON strategic_directives_v2 IS
'Ensures key_changes is a proper JSONB array, not a stringified JSON.';

-- ============================================================
-- 2. Non-Empty Constraints (for required fields)
-- ============================================================

-- key_principles should have at least 1 entry when set
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT key_principles_not_empty
CHECK (
  key_principles IS NULL
  OR jsonb_array_length(key_principles) >= 1
) NOT VALID;

COMMENT ON CONSTRAINT key_principles_not_empty ON strategic_directives_v2 IS
'Prevents empty key_principles arrays. SDs should have guiding principles defined.';

-- ============================================================
-- VALIDATION (Run after data cleanup)
-- ============================================================
-- After fixing all existing data, validate constraints:
--
-- ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT success_criteria_is_array;
-- ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT success_metrics_is_array;
-- ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT key_principles_is_array;
-- ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT key_changes_is_array;
-- ALTER TABLE strategic_directives_v2 VALIDATE CONSTRAINT key_principles_not_empty;
