-- Add strategic_directive_id as an alias/computed column for product_requirements_v2
-- This maintains backward compatibility while supporting the LEO orchestrator

-- Option 1: Add as a generated column (alias)
ALTER TABLE product_requirements_v2
ADD COLUMN strategic_directive_id TEXT GENERATED ALWAYS AS (sd_id) STORED;

-- Option 2: Update existing records if sd_id has different format
-- UPDATE product_requirements_v2 SET strategic_directive_id = sd_id WHERE strategic_directive_id IS NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_prd_v2_strategic_directive_id
ON product_requirements_v2(strategic_directive_id);