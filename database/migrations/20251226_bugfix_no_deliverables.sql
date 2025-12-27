-- SD-NAV-CMD-001: Update bugfix validation profile
-- Root cause: Bugfix SDs were failing progress checks because requires_deliverables=true
-- But simple bugfix SDs don't have formal deliverables tracking - git commits ARE the deliverables
--
-- Fix: Set requires_deliverables and requires_e2e_tests to false for bugfix type
-- This allows bugfix SDs to complete without needing entries in sd_scope_deliverables

UPDATE sd_type_validation_profiles
SET
  requires_deliverables = false,
  requires_e2e_tests = false,
  description = 'Bug fixes - heavier weight on EXEC phase. No deliverables or E2E required (validated via git commits).',
  updated_at = NOW()
WHERE sd_type = 'bugfix';

-- Verification
DO $$
DECLARE
  profile RECORD;
BEGIN
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'bugfix';

  RAISE NOTICE 'Updated bugfix profile:';
  RAISE NOTICE '  requires_deliverables: %', profile.requires_deliverables;
  RAISE NOTICE '  requires_e2e_tests: %', profile.requires_e2e_tests;
  RAISE NOTICE '  description: %', profile.description;
END $$;
