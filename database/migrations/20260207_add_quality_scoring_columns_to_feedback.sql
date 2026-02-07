-- Migration: Add quality scoring columns to feedback table
-- SD: SD-FDBK-ENH-ADD-QUALITY-SCORING-001
-- Purpose: Add rubric_score and quality_assessment columns for efficient
--          quality-based querying, filtering, and display in /leo inbox

-- Step 1: Add rubric_score column (INT 0-100, nullable for backwards compat)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS rubric_score INTEGER;

-- Step 2: Add quality_assessment column (JSONB for 5-dimension breakdown)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS quality_assessment JSONB;

-- Step 3: Add CHECK constraint for score range
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_rubric_score_range'
  ) THEN
    ALTER TABLE feedback ADD CONSTRAINT feedback_rubric_score_range
      CHECK (rubric_score IS NULL OR (rubric_score >= 0 AND rubric_score <= 100));
  END IF;
END $$;

-- Step 4: Add index for quality-based queries (filter + sort)
CREATE INDEX IF NOT EXISTS idx_feedback_rubric_score
  ON feedback (rubric_score DESC NULLS LAST)
  WHERE rubric_score IS NOT NULL;

-- Step 5: Add composite index for common query pattern (status + quality)
CREATE INDEX IF NOT EXISTS idx_feedback_status_rubric_score
  ON feedback (status, rubric_score DESC NULLS LAST)
  WHERE rubric_score IS NOT NULL;

-- Step 6: Add comment for documentation
COMMENT ON COLUMN feedback.rubric_score IS 'Quality score 0-100 from quality-scorer.js 5-dimension assessment (clarity, actionability, specificity, relevance, completeness)';
COMMENT ON COLUMN feedback.quality_assessment IS 'JSONB with dimension scores: {score, tier, dimensions: {clarity, actionability, specificity, relevance, completeness}, suggestions}';
