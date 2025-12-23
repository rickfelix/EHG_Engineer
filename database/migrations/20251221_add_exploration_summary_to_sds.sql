-- Migration: Add exploration_summary column to strategic_directives_v2
-- Purpose: Track exploration phase findings for parent SDs
-- Date: 2025-12-21
-- SD: SD-E2E-REMEDIATION-ORCHESTRATOR

-- Add exploration_summary column
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS exploration_summary JSONB DEFAULT NULL;

COMMENT ON COLUMN strategic_directives_v2.exploration_summary IS
'EXPLORATION SUMMARY: JSONB object containing exploration phase findings for orchestrator SDs. Structure: {files_explored: [], key_findings: [], patterns_identified: [], gaps_identified: [], exploration_date: "YYYY-MM-DD", explored_by: "Agent name"}. NULL for non-orchestrator SDs or pre-exploration phase.';

-- Update SD-E2E-REMEDIATION-ORCHESTRATOR with exploration findings
UPDATE strategic_directives_v2
SET
  exploration_summary = '{
    "files_explored": [
      "playwright.config.js",
      "playwright-uat.config.js",
      "tests/e2e/venture-lifecycle/full-journey.spec.ts",
      "tests/helpers/test-utils.js",
      "tests/fixtures/workflow-review-mocks.js",
      "lib/reporters/leo-playwright-reporter.js",
      "tests/uat/setup/global-auth.js",
      "tests/uat/accessibility.spec.js",
      "tests/uat/performance.spec.js"
    ],
    "key_findings": [
      "37 E2E test files with 12k+ LOC - mature infrastructure",
      "5 Playwright configs for different scenarios (e2e, uat, diagnostic)",
      "Mandatory user story mapping (US-XXX prefix) enforced by QA Director",
      "Extensive data-testid usage but no page object model",
      "Accessibility tests exist but axe-core not integrated",
      "Performance tests scaffolded but metrics not captured",
      "Custom LEO Playwright reporter for evidence packs",
      "Authentication via global setup with state persistence"
    ],
    "patterns_identified": [
      "beforeAll/afterAll for database setup/cleanup",
      "Supabase client for test data management",
      "User story to acceptance criteria mapping",
      "Extensive test utilities in tests/helpers/test-utils.js"
    ],
    "gaps_identified": [
      "No page object model - selectors inline",
      "Axe-core available but not integrated",
      "Performance metrics defined but not captured",
      "Auth fixture not extracted for reuse"
    ],
    "exploration_date": "2025-12-21",
    "explored_by": "Claude Opus 4.5"
  }'::jsonb,
  metadata = CASE
    WHEN metadata IS NULL THEN '{}'::jsonb
    ELSE metadata
  END || '{
    "exploration_completed": true,
    "exploration_timestamp": "2025-12-21T00:00:00Z",
    "total_test_files": 37,
    "total_test_loc": 12000,
    "playwright_configs": 5
  }'::jsonb,
  updated_at = CURRENT_TIMESTAMP,
  updated_by = 'database-agent'
WHERE id = 'SD-E2E-REMEDIATION-ORCHESTRATOR';

-- Create index for exploration_summary queries
CREATE INDEX IF NOT EXISTS idx_sd_v2_exploration_summary
ON strategic_directives_v2 USING gin(exploration_summary)
WHERE exploration_summary IS NOT NULL;

-- Verification query
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM strategic_directives_v2
  WHERE id = 'SD-E2E-REMEDIATION-ORCHESTRATOR'
    AND exploration_summary IS NOT NULL;

  IF v_count = 1 THEN
    RAISE NOTICE 'SUCCESS: exploration_summary added to SD-E2E-REMEDIATION-ORCHESTRATOR';
  ELSE
    RAISE WARNING 'FAILED: exploration_summary not found for SD-E2E-REMEDIATION-ORCHESTRATOR';
  END IF;
END $$;
