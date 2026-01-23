-- Add smoke_test_steps field to strategic_directives table
-- This field stores a JSONB array of 5-step smoke test instructions that demonstrate SD delivery
-- Migration for SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001

ALTER TABLE strategic_directives
ADD COLUMN IF NOT EXISTS smoke_test_steps JSONB DEFAULT '[]'::jsonb;

-- Comment on the new column for documentation
COMMENT ON COLUMN strategic_directives.smoke_test_steps IS
'JSONB array of smoke test steps (max 5 steps). Each step has: step_number (int), instruction (string), expected_outcome (string). These steps serve as the "30-second demo" proving the SD delivered value.';

-- Create index for efficient querying of SDs with smoke tests
CREATE INDEX IF NOT EXISTS idx_sd_has_smoke_tests
ON strategic_directives
USING gin(smoke_test_steps)
WHERE smoke_test_steps != ''::jsonb AND smoke_test_steps IS NOT NULL;
