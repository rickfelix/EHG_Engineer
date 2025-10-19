-- Fix retrospectives_quality_score_check constraint logic
-- Issue: Current constraint prevents UPDATEs when quality_score is NULL
-- Root Cause: Logic (quality_score IS NOT NULL) AND (score >= 70) fails for NULL values
-- Fix: Allow NULL OR validate range only when NOT NULL
--
-- Current (BROKEN):
--   CHECK ((quality_score IS NOT NULL) AND (quality_score >= 70) AND (quality_score <= 100))
--   This REQUIRES quality_score to be NOT NULL, which is wrong.
--
-- Fixed (CORRECT):
--   CHECK (quality_score IS NULL OR (quality_score >= 70 AND quality_score <= 100))
--   This allows NULL OR validates range when present.

BEGIN;

-- Drop the broken constraint
ALTER TABLE retrospectives
DROP CONSTRAINT IF EXISTS retrospectives_quality_score_check;

-- Add the corrected constraint
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_quality_score_check
CHECK (
  quality_score IS NULL
  OR (quality_score >= 70 AND quality_score <= 100)
);

COMMENT ON CONSTRAINT retrospectives_quality_score_check ON retrospectives
IS 'Quality score must be NULL or between 70-100 (inclusive)';

-- Verify the fix
DO $$
DECLARE
  constraint_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO constraint_def
  FROM pg_constraint
  WHERE conname = 'retrospectives_quality_score_check'
    AND conrelid = 'retrospectives'::regclass;

  IF constraint_def NOT LIKE '%IS NULL%OR%' THEN
    RAISE EXCEPTION 'Constraint fix verification failed: %', constraint_def;
  END IF;

  RAISE NOTICE 'Constraint fix verified: %', constraint_def;
END $$;

COMMIT;

-- Verification: Try an UPDATE (should succeed now)
-- UPDATE retrospectives SET target_application = 'test' WHERE id = (SELECT id FROM retrospectives LIMIT 1);
-- Note: Commented out as this is part of the next migration
