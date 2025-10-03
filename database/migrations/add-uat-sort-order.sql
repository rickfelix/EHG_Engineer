-- Add sort_order field to uat_cases table for logical test ordering
-- This allows tests to be displayed in a logical user-journey sequence

-- Add the column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uat_cases'
    AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE uat_cases
    ADD COLUMN sort_order INTEGER DEFAULT 0;

    RAISE NOTICE 'Added sort_order column to uat_cases table';
  ELSE
    RAISE NOTICE 'sort_order column already exists';
  END IF;
END $$;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS idx_uat_cases_sort_order
ON uat_cases(sort_order);

COMMENT ON COLUMN uat_cases.sort_order IS 'Defines the logical order for test execution/assessment. Lower numbers appear first.';
