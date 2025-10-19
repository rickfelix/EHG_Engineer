-- Migration: Make sequence_rank required in strategic_directives_v2
-- Purpose: Prevent NULL sequence_rank values that break sorting/ordering
-- Date: 2025-10-03

-- Step 1: Set default value for any existing NULL sequence_rank rows
UPDATE strategic_directives_v2
SET sequence_rank = COALESCE(
  (SELECT MAX(sequence_rank) FROM strategic_directives_v2 WHERE sequence_rank IS NOT NULL) + 1,
  1
)
WHERE sequence_rank IS NULL;

-- Step 2: Add NOT NULL constraint
ALTER TABLE strategic_directives_v2
ALTER COLUMN sequence_rank SET NOT NULL;

-- Step 3: Add default value for future inserts (next available rank)
-- Note: PostgreSQL doesn't support dynamic defaults, so we'll use a trigger instead

-- Create function to auto-assign sequence_rank
CREATE OR REPLACE FUNCTION assign_sequence_rank()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sequence_rank IS NULL THEN
    SELECT COALESCE(MAX(sequence_rank), 0) + 1
    INTO NEW.sequence_rank
    FROM strategic_directives_v2;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-assign sequence_rank on insert
DROP TRIGGER IF EXISTS auto_assign_sequence_rank ON strategic_directives_v2;
CREATE TRIGGER auto_assign_sequence_rank
  BEFORE INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION assign_sequence_rank();

-- Verify: Check that no NULL values remain
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM strategic_directives_v2
  WHERE sequence_rank IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % rows still have NULL sequence_rank', null_count;
  ELSE
    RAISE NOTICE 'Migration successful: All sequence_rank values populated';
  END IF;
END $$;
