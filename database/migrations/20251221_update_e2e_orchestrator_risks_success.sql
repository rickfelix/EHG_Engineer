-- Migration: Update SD-E2E-REMEDIATION-ORCHESTRATOR with risks and success_criteria
-- Author: Database Agent (claude-sonnet-4-5-20250929)
-- Date: 2025-12-21
-- SD: SD-E2E-REMEDIATION-ORCHESTRATOR
-- Purpose: Add structured risks and success criteria to orchestrator SD

-- Verify the SD exists before updating
DO $$
DECLARE
  sd_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM strategic_directives_v2
    WHERE id = 'SD-E2E-REMEDIATION-ORCHESTRATOR'
  ) INTO sd_exists;

  IF NOT sd_exists THEN
    RAISE EXCEPTION 'SD-E2E-REMEDIATION-ORCHESTRATOR not found in strategic_directives_v2';
  END IF;
END $$;

-- Update risks array
UPDATE strategic_directives_v2
SET
  risks = '[
    {
      "risk": "Child SD dependency chains may cause blocking",
      "impact": "medium",
      "mitigation": "Prioritize independent children first, parallelize where possible"
    },
    {
      "risk": "Scope creep during remediation work",
      "impact": "high",
      "mitigation": "Strict adherence to child SD scopes, defer new discoveries to separate SDs"
    },
    {
      "risk": "Test infrastructure changes may break existing tests",
      "impact": "high",
      "mitigation": "Run full test suite after each child SD completion"
    }
  ]'::jsonb,
  success_criteria = '[
    "All 12 child SDs completed with status=''completed''",
    "No regression in existing E2E test pass rate",
    "All identified infrastructure gaps addressed per exploration findings",
    "Page object pattern implemented for admin components",
    "Accessibility tests integrated with axe-core",
    "Performance metrics capture implemented"
  ]'::jsonb,
  updated_at = CURRENT_TIMESTAMP,
  updated_by = 'database-agent:claude-sonnet-4-5'
WHERE id = 'SD-E2E-REMEDIATION-ORCHESTRATOR';

-- Verify the update succeeded
DO $$
DECLARE
  risks_count INTEGER;
  success_count INTEGER;
BEGIN
  SELECT
    jsonb_array_length(risks),
    jsonb_array_length(success_criteria)
  INTO risks_count, success_count
  FROM strategic_directives_v2
  WHERE id = 'SD-E2E-REMEDIATION-ORCHESTRATOR';

  IF risks_count != 3 THEN
    RAISE EXCEPTION 'Expected 3 risks, found %', risks_count;
  END IF;

  IF success_count != 6 THEN
    RAISE EXCEPTION 'Expected 6 success criteria, found %', success_count;
  END IF;

  RAISE NOTICE 'Successfully updated SD-E2E-REMEDIATION-ORCHESTRATOR';
  RAISE NOTICE '  - Risks: % items', risks_count;
  RAISE NOTICE '  - Success Criteria: % items', success_count;
END $$;
