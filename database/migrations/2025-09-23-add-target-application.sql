-- Migration: Add target_application field to strategic_directives_v2
-- Purpose: Differentiate between EHG_Engineer (development platform) and EHG (business application) SDs
-- Date: 2025-09-23

-- Add target_application column with EHG as default (since ~90% of SDs are for EHG)
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS target_application VARCHAR(20) DEFAULT 'EHG';

-- Add comment for documentation
COMMENT ON COLUMN strategic_directives_v2.target_application IS
'Target application: EHG_ENGINEER (development platform with LEO Protocol) or EHG (business application)';

-- Update the few EHG_Engineer SDs (LEO Protocol development workflow)
UPDATE strategic_directives_v2
SET target_application = 'EHG_ENGINEER'
WHERE
  -- Known EHG_Engineer SDs
  key IN (
    'SD-002',                  -- AI Navigation for EHG_Engineer interface
    'SD-2025-0903-SDIP',      -- Strategic Directive Initiation Protocol
    'SD-2025-09-EMB',         -- Message Bus for LEO Agent Handoffs
    'SD-GOVERNANCE-UI-001',   -- Governance UI for SD/PRD management
    'SD-MONITORING-001',      -- Observability for LEO Protocol
    'SD-VISION-ALIGN-001'     -- Vision Alignment for EHG_Engineering
  )
  -- Pattern matching for LEO Protocol features (excluding business dashboards)
  OR (title ILIKE '%LEO Protocol%' AND title NOT ILIKE '%Dashboard%')
  OR title ILIKE '%SD Management%'
  OR title ILIKE '%PRD Management%'
  OR title ILIKE '%Handoff Management%'
  OR (title ILIKE '%Governance UI%' AND description ILIKE '%strategic directive%');

-- Create index for filtering performance
CREATE INDEX IF NOT EXISTS idx_strategic_directives_target_app
ON strategic_directives_v2(target_application);

-- Add check constraint to ensure valid values
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT check_target_application
CHECK (target_application IN ('EHG', 'EHG_ENGINEER'));

-- Log the classification results
DO $$
DECLARE
  ehg_count INTEGER;
  eng_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ehg_count
  FROM strategic_directives_v2
  WHERE target_application = 'EHG';

  SELECT COUNT(*) INTO eng_count
  FROM strategic_directives_v2
  WHERE target_application = 'EHG_ENGINEER';

  RAISE NOTICE 'Classification Complete:';
  RAISE NOTICE '  EHG SDs (Business Application): %', ehg_count;
  RAISE NOTICE '  EHG_ENGINEER SDs (Development Platform): %', eng_count;
  RAISE NOTICE '  Total SDs: %', ehg_count + eng_count;
END $$;