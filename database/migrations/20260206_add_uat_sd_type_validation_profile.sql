-- Migration: Add UAT SD Type Validation Profile
-- Date: 2026-02-06
-- Purpose: Register 'uat' SD type with minimal validation requirements
--
-- Context: UAT (User Acceptance Testing) SDs are lightweight and don't require
-- the same validation overhead as feature SDs. This prevents the completion
-- trigger from falling back to the 'feature' profile which requires PRD,
-- 4 handoffs, E2E tests, and retrospectives.

INSERT INTO sd_type_validation_profiles (
  sd_type,
  name,
  description,
  min_handoffs,
  requires_prd,
  requires_e2e_tests,
  requires_sub_agents,
  requires_deliverables,
  requires_retrospective
)
VALUES (
  'uat',
  'UAT Testing',
  'User acceptance testing - minimal validation requirements',
  0,      -- No required handoffs
  false,  -- No PRD required
  false,  -- No E2E tests required
  false,  -- No sub-agents required
  false,  -- No deliverables required
  false   -- No retrospective required
)
ON CONFLICT (sd_type) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  min_handoffs = EXCLUDED.min_handoffs,
  requires_prd = EXCLUDED.requires_prd,
  requires_e2e_tests = EXCLUDED.requires_e2e_tests,
  requires_sub_agents = EXCLUDED.requires_sub_agents,
  requires_deliverables = EXCLUDED.requires_deliverables,
  requires_retrospective = EXCLUDED.requires_retrospective;

-- Verification query
SELECT sd_type, name, min_handoffs, requires_prd, requires_e2e_tests, requires_retrospective
FROM sd_type_validation_profiles
WHERE sd_type = 'uat';
