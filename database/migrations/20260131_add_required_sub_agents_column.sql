-- Migration: Add required_sub_agents column to sd_type_validation_profiles
-- SD: SD-LEO-INFRA-SUBAGENT-ORCHESTRATION-001
-- US-001: Extend sd_type_validation_profiles table with sub-agent requirement metadata

-- Add the new column for phase-keyed sub-agent requirements
ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS required_sub_agents JSONB DEFAULT '{}'::jsonb;

-- Add column comment
COMMENT ON COLUMN sd_type_validation_profiles.required_sub_agents IS
'Phase-keyed sub-agent requirements. Format: {"PLAN": ["STORIES", "DESIGN"], "EXEC": ["TESTING"]}';

-- Populate required_sub_agents for each SD type based on CLAUDE_CORE.md definitions
-- Feature: Full sub-agent support
UPDATE sd_type_validation_profiles
SET required_sub_agents = '{
  "LEAD": ["RISK", "VALIDATION"],
  "PLAN": ["STORIES", "DESIGN", "DATABASE"],
  "EXEC": ["TESTING", "GITHUB"]
}'::jsonb
WHERE sd_type = 'feature';

-- Infrastructure: Reduced sub-agent set (no DESIGN, TESTING, GITHUB)
UPDATE sd_type_validation_profiles
SET required_sub_agents = '{
  "LEAD": ["RISK"],
  "PLAN": [],
  "EXEC": ["DOCMON"]
}'::jsonb
WHERE sd_type = 'infrastructure';

-- Enhancement: Moderate sub-agent set
UPDATE sd_type_validation_profiles
SET required_sub_agents = '{
  "LEAD": ["VALIDATION"],
  "PLAN": ["STORIES"],
  "EXEC": ["TESTING"]
}'::jsonb
WHERE sd_type = 'enhancement';

-- Fix: Minimal sub-agent set
UPDATE sd_type_validation_profiles
SET required_sub_agents = '{
  "LEAD": [],
  "PLAN": [],
  "EXEC": ["TESTING", "REGRESSION"]
}'::jsonb
WHERE sd_type = 'fix';

-- Documentation: Doc-focused sub-agents
UPDATE sd_type_validation_profiles
SET required_sub_agents = '{
  "LEAD": [],
  "PLAN": [],
  "EXEC": ["DOCMON"]
}'::jsonb
WHERE sd_type = 'documentation';

-- Security: Security-focused sub-agents
UPDATE sd_type_validation_profiles
SET required_sub_agents = '{
  "LEAD": ["RISK", "SECURITY"],
  "PLAN": ["SECURITY"],
  "EXEC": ["SECURITY", "TESTING"]
}'::jsonb
WHERE sd_type = 'security';

-- Refactor: Regression-focused sub-agents
UPDATE sd_type_validation_profiles
SET required_sub_agents = '{
  "LEAD": ["RISK"],
  "PLAN": ["REGRESSION"],
  "EXEC": ["REGRESSION", "TESTING"]
}'::jsonb
WHERE sd_type = 'refactor';

-- Verify the updates
SELECT sd_type, required_sub_agents
FROM sd_type_validation_profiles
ORDER BY sd_type;
