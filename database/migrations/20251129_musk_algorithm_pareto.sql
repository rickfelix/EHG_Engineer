-- Migration: Musk 5-Step Algorithm Integration (Pareto: Q8 + Deletion Audit)
-- Date: 2025-11-29
-- Purpose: Add deletion tracking to operationalize Musk's "delete first" philosophy

-- 1. Track scope reduction at SD approval (Q8: "What was removed?")
ALTER TABLE strategic_directives
ADD COLUMN IF NOT EXISTS scope_reduction_percentage INTEGER DEFAULT 0
CHECK (scope_reduction_percentage >= 0 AND scope_reduction_percentage <= 100);

COMMENT ON COLUMN strategic_directives.scope_reduction_percentage IS
'Percentage of original scope that was eliminated during LEAD review. Target: >10%. Inspired by Musk Step 2: "If not adding 10% back later, you didnt delete enough"';

-- 2. Track deletion opportunities in retrospectives (Deletion Audit)
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS unnecessary_work_identified JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN retrospectives.unnecessary_work_identified IS
'Array of items that could have been deleted but werent. Used to improve future Q8 decisions. Inspired by Musk "add 10% back" test.';

-- Add index for querying deletion patterns
CREATE INDEX IF NOT EXISTS idx_retrospectives_deletion_audit
ON retrospectives USING gin (unnecessary_work_identified);
