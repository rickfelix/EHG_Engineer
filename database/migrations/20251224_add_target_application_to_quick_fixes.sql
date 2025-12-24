-- Migration: Add target_application to quick_fixes table
-- Purpose: Enable quick-fix workflow to run tests in the correct repository
-- Created: 2025-12-24
-- Related: QF-20251223-800 - discovered issue when fix was in EHG but tests ran in EHG_Engineer

-- Add target_application column
ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS target_application TEXT
CHECK (target_application IN ('EHG', 'EHG_Engineer'));

-- Set default for existing records based on common patterns
-- Most quick fixes target the main app
UPDATE quick_fixes
SET target_application = 'EHG'
WHERE target_application IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN quick_fixes.target_application IS
  'Target repository for the quick-fix: EHG (main app) or EHG_Engineer (infrastructure).
   Used by complete-quick-fix.js to determine which directory to run tests in.';

-- Create index for filtering by application
CREATE INDEX IF NOT EXISTS idx_quick_fixes_target_application
ON quick_fixes(target_application);
