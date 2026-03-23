-- Add autonomy_level column to ventures table
-- This enables the autonomy model to control gate behavior per venture.
-- Default L0 (Manual) means all gates require chairman approval.
-- Values: L0 (Manual), L1 (Guided), L2 (Supervised), L3 (Autonomous), L4 (Full Auto)
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS autonomy_level TEXT DEFAULT 'L0';

-- Add check constraint for valid values
ALTER TABLE ventures ADD CONSTRAINT ventures_autonomy_level_check
  CHECK (autonomy_level IN ('L0', 'L1', 'L2', 'L3', 'L4'));

-- Update autonomy model to query ventures table instead of eva_ventures
COMMENT ON COLUMN ventures.autonomy_level IS 'Venture autonomy level: L0=Manual, L1=Guided, L2=Supervised, L3=Autonomous, L4=Full Auto';
