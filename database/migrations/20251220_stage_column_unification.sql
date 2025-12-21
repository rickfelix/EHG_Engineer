-- Migration: Stage Column Unification (One Column Law)
-- Date: 2025-12-20
-- Purpose: Deprecate redundant stage columns in ventures table
--
-- PROBLEM: Schema pollution with 4 stage columns (stage, current_workflow_stage,
--          current_stage, current_lifecycle_stage)
--
-- SOLUTION: Enforce One Column Law - only current_lifecycle_stage is canonical
--           Rename others with DEPRECATED_ prefix to preserve data
--
-- CANONICAL COLUMN: current_lifecycle_stage
--   - Single source of truth for venture stage
--   - Valid values: discovery, validation, growth, scale, exit
--   - DO NOT use the DEPRECATED_ columns in new code

BEGIN;

-- Rename redundant stage columns (preserve data, mark as deprecated)
ALTER TABLE ventures
  RENAME COLUMN stage TO DEPRECATED_stage;

ALTER TABLE ventures
  RENAME COLUMN current_workflow_stage TO DEPRECATED_current_workflow_stage;

ALTER TABLE ventures
  RENAME COLUMN current_stage TO DEPRECATED_current_stage;

-- Add comment documenting the canonical column
COMMENT ON COLUMN ventures.current_lifecycle_stage IS
  'CANONICAL stage column (One Column Law). Valid values: discovery, validation, growth, scale, exit. DO NOT use DEPRECATED_* stage columns.';

-- Add comments to deprecated columns
COMMENT ON COLUMN ventures.DEPRECATED_stage IS
  'DEPRECATED: Use current_lifecycle_stage instead. Preserved for data recovery only.';

COMMENT ON COLUMN ventures.DEPRECATED_current_workflow_stage IS
  'DEPRECATED: Use current_lifecycle_stage instead. Preserved for data recovery only.';

COMMENT ON COLUMN ventures.DEPRECATED_current_stage IS
  'DEPRECATED: Use current_lifecycle_stage instead. Preserved for data recovery only.';

COMMIT;

-- Verification query (run after migration)
-- This should show current_lifecycle_stage and the 3 DEPRECATED_* columns
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default,
  col_description('ventures'::regclass, ordinal_position) as description
FROM information_schema.columns
WHERE table_name = 'ventures'
  AND column_name LIKE '%stage%'
ORDER BY
  CASE
    WHEN column_name = 'current_lifecycle_stage' THEN 1
    ELSE 2
  END,
  column_name;
