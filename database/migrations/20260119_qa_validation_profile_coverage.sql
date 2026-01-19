-- SD-LEARN-011: FR-4/FR-5 - QA SD Type and Constraint Synchronization
-- Purpose: Ensure QA validation profile requires coverage metrics
--          Ensure sd_type_check constraint includes all validation profile types
-- Date: 2026-01-19

-- ============================================================================
-- FR-4: UPDATE QA VALIDATION PROFILE
-- Add requirement for coverage metrics in retrospectives
-- ============================================================================

-- Note: The QA profile already exists with good defaults.
-- This update ensures it documents the coverage metric requirement.
UPDATE sd_type_validation_profiles
SET
  description = 'Test review, cleanup, and QA tasks - PRD for documentation, retrospective with coverage metrics required. For sd_type=qa, retrospectives must include coverage_pre_percent, coverage_post_percent, and coverage_delta_percent.',
  requires_retrospective = true,
  updated_at = NOW()
WHERE sd_type = 'qa';

-- Also update 'testing' profile with same requirement
UPDATE sd_type_validation_profiles
SET
  description = 'Testing and test infrastructure work - retrospective with coverage metrics required. For sd_type=testing, retrospectives must include coverage_pre_percent, coverage_post_percent, and coverage_delta_percent.',
  requires_retrospective = true,
  updated_at = NOW()
WHERE sd_type = 'testing';

-- Insert testing profile if it doesn't exist (for completeness)
INSERT INTO sd_type_validation_profiles (
  sd_type, lead_weight, plan_weight, exec_weight, verify_weight, final_weight,
  requires_prd, requires_deliverables, requires_e2e_tests, requires_retrospective, requires_sub_agents, min_handoffs,
  description
) VALUES (
  'testing', 25, 20, 30, 10, 15,
  true, false, false, true, false, 2,
  'Testing and test infrastructure work - retrospective with coverage metrics required. For sd_type=testing, retrospectives must include coverage_pre_percent, coverage_post_percent, and coverage_delta_percent.'
) ON CONFLICT (sd_type) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- FR-5: ENSURE SD_TYPE_CHECK CONSTRAINT INCLUDES ALL VALIDATION PROFILE TYPES
-- ============================================================================

-- Get all sd_types from validation profiles and ensure they're in the constraint
-- This is a dynamic approach that keeps constraint and profiles in sync

-- First, drop the existing constraint if it exists (we'll recreate it)
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS sd_type_check;

-- Create new constraint that includes all types from validation profiles plus known types
-- The constraint is defined explicitly to ensure all types are covered
ALTER TABLE strategic_directives_v2
ADD CONSTRAINT sd_type_check CHECK (
  sd_type IS NULL OR sd_type IN (
    -- Core types (from validation profiles)
    'feature',
    'infrastructure',
    'database',
    'security',
    'bugfix',
    'refactor',
    'performance',
    'documentation',
    'docs',  -- alias for documentation
    'orchestrator',
    -- Testing/QA types (FR-4)
    'testing',
    'qa',
    -- Enhancement type (LEO v4.4.1)
    'enhancement',
    -- Frontend/UX types
    'frontend',
    'ux_debt',
    -- API/Backend types
    'api',
    'backend',
    -- Process type
    'process'
  )
);

-- Add comment documenting the constraint
COMMENT ON CONSTRAINT sd_type_check ON strategic_directives_v2 IS
'SD-LEARN-011: Ensures sd_type is one of the supported validation profile types. New types must be added here AND to sd_type_validation_profiles table.';

-- ============================================================================
-- FUNCTION: Verify Registry-Constraint Synchronization
-- This function checks if validation profiles and constraint are in sync
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_sd_type_sync()
RETURNS TABLE (
  profile_type VARCHAR,
  in_profiles BOOLEAN,
  in_constraint BOOLEAN,
  status TEXT
) AS $$
DECLARE
  constraint_types TEXT[];
  profile_types TEXT[];
  all_types TEXT[];
  t TEXT;
BEGIN
  -- Get types from validation profiles
  SELECT ARRAY_AGG(DISTINCT sd_type ORDER BY sd_type) INTO profile_types
  FROM sd_type_validation_profiles;

  -- Known constraint types (must match the CHECK constraint above)
  constraint_types := ARRAY[
    'feature', 'infrastructure', 'database', 'security', 'bugfix',
    'refactor', 'performance', 'documentation', 'docs', 'orchestrator',
    'testing', 'qa', 'enhancement', 'frontend', 'ux_debt', 'api', 'backend', 'process'
  ];

  -- Combine all types
  SELECT ARRAY_AGG(DISTINCT x ORDER BY x) INTO all_types
  FROM (
    SELECT unnest(profile_types) AS x
    UNION
    SELECT unnest(constraint_types) AS x
  ) t;

  -- Return comparison
  FOREACH t IN ARRAY all_types LOOP
    profile_type := t;
    in_profiles := t = ANY(profile_types);
    in_constraint := t = ANY(constraint_types);

    IF in_profiles AND in_constraint THEN
      status := '✅ SYNCED';
    ELSIF in_profiles AND NOT in_constraint THEN
      status := '❌ MISSING FROM CONSTRAINT';
    ELSIF NOT in_profiles AND in_constraint THEN
      status := '⚠️ MISSING FROM PROFILES';
    ELSE
      status := '❓ UNKNOWN';
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  profile_count INT;
  missing_count INT;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM sd_type_validation_profiles;

  -- Check for any missing types
  SELECT COUNT(*) INTO missing_count
  FROM verify_sd_type_sync()
  WHERE status LIKE '%MISSING%';

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-LEARN-011 FR-4/FR-5: QA Profile & Constraint Sync Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Validation profiles: %', profile_count;
  RAISE NOTICE 'Missing types: %', missing_count;
  RAISE NOTICE '';
  RAISE NOTICE 'QA/Testing profiles updated to require coverage metrics';
  RAISE NOTICE '';
  RAISE NOTICE 'To verify sync status:';
  RAISE NOTICE '  SELECT * FROM verify_sd_type_sync();';
  RAISE NOTICE '';
  IF missing_count > 0 THEN
    RAISE WARNING 'There are % types not synchronized!', missing_count;
  ELSE
    RAISE NOTICE '✅ All types are synchronized between profiles and constraint';
  END IF;
  RAISE NOTICE '============================================================';
END $$;

-- Show sync status
SELECT * FROM verify_sd_type_sync() ORDER BY profile_type;
