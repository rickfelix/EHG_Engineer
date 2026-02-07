-- Migration: Add given_when_then column to user_stories table
-- Purpose: Support structured BDD scenarios for quality validation
-- Related: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001

-- Add given_when_then column
ALTER TABLE user_stories
ADD COLUMN IF NOT EXISTS given_when_then JSONB DEFAULT '[]'::jsonb;

-- Add comment
COMMENT ON COLUMN user_stories.given_when_then IS 'Structured BDD scenarios extracted from acceptance criteria. Array of {given, when, then} objects.';

-- Create index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_user_stories_given_when_then
ON user_stories USING gin(given_when_then);

-- Validation: Verify column was added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_stories' AND column_name = 'given_when_then'
  ) THEN
    RAISE EXCEPTION 'Migration failed: given_when_then column not added';
  END IF;

  RAISE NOTICE 'Migration successful: given_when_then column added to user_stories';
END $$;
