-- Enhance sd_testing_status table for granular test metrics
-- Adds support for separate unit and E2E test tracking

-- Add new columns for granular test metrics
ALTER TABLE sd_testing_status
ADD COLUMN IF NOT EXISTS unit_test_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit_tests_passed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS unit_tests_failed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS e2e_test_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS e2e_tests_passed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS e2e_tests_failed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS coverage_percentage NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS test_output_log_path TEXT;

-- Add check constraints
ALTER TABLE sd_testing_status
ADD CONSTRAINT check_unit_tests_sum
  CHECK (unit_tests_passed + unit_tests_failed <= unit_test_count),
ADD CONSTRAINT check_e2e_tests_sum
  CHECK (e2e_tests_passed + e2e_tests_failed <= e2e_test_count),
ADD CONSTRAINT check_coverage_range
  CHECK (coverage_percentage IS NULL OR (coverage_percentage >= 0 AND coverage_percentage <= 100));

-- Add comment
COMMENT ON COLUMN sd_testing_status.unit_test_count IS 'Total Vitest unit tests executed';
COMMENT ON COLUMN sd_testing_status.e2e_test_count IS 'Total Playwright E2E tests executed';
COMMENT ON COLUMN sd_testing_status.coverage_percentage IS 'Code coverage percentage from unit tests';
COMMENT ON COLUMN sd_testing_status.test_output_log_path IS 'Path to full test output log file';

-- Create index for coverage queries
CREATE INDEX IF NOT EXISTS idx_sd_testing_status_coverage
  ON sd_testing_status(coverage_percentage)
  WHERE coverage_percentage IS NOT NULL;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON sd_testing_status TO anon, authenticated;
