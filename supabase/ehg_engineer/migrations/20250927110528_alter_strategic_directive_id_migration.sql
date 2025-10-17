
-- Add strategic_directive_id column to product_requirements_v2
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS strategic_directive_id TEXT;

-- Copy data from sd_id to strategic_directive_id
UPDATE product_requirements_v2
SET strategic_directive_id = sd_id
WHERE sd_id IS NOT NULL AND strategic_directive_id IS NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_prd_v2_strategic_directive_id
ON product_requirements_v2(strategic_directive_id);
