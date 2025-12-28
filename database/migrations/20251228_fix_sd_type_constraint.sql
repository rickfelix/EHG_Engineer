-- Fix sd_type constraint to include all existing and new types
-- Needed because existing rows have values not in the original constraint

-- Drop existing constraint
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS strategic_directives_v2_sd_type_check;

-- Add updated constraint with all known types
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT strategic_directives_v2_sd_type_check
CHECK (sd_type IS NULL OR sd_type IN (
  -- Existing types (from database)
  'bugfix', 'database', 'docs', 'documentation', 'feature',
  'infrastructure', 'orchestrator', 'qa', 'refactor', 'security',
  'implementation',
  -- New types from triangulation
  'strategic_observation', 'architectural_review',
  'discovery_spike', 'ux_debt', 'product_decision'
));
