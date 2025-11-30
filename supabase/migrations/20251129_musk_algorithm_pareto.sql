-- Migration: Musk 5-Step Algorithm Integration (Pareto: Q8 + Deletion Audit)
-- Date: 2025-11-29
-- Purpose: Add deletion tracking to operationalize Musk's "delete first" philosophy
-- NOTE: Uses strategic_directives_v2 (the actual table name in EHG_Engineer database)

-- 1. Track scope reduction at SD approval (Q8: "What was removed?")
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS scope_reduction_percentage INTEGER DEFAULT 0;

-- Add check constraint separately for IF NOT EXISTS support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'strategic_directives_v2_scope_reduction_check'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD CONSTRAINT strategic_directives_v2_scope_reduction_check
    CHECK (scope_reduction_percentage >= 0 AND scope_reduction_percentage <= 100);
  END IF;
END $$;

COMMENT ON COLUMN strategic_directives_v2.scope_reduction_percentage IS
'Percentage of original scope that was eliminated during LEAD review. Target: >10%. Inspired by Musk Step 2.';

-- 2. Track deletion opportunities in retrospectives (Deletion Audit)
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS unnecessary_work_identified JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN retrospectives.unnecessary_work_identified IS
'Array of items that could have been deleted but were not. Used to improve future Q8 decisions.';

-- Add index for querying deletion patterns
CREATE INDEX IF NOT EXISTS idx_retrospectives_deletion_audit
ON retrospectives USING gin (unnecessary_work_identified);
