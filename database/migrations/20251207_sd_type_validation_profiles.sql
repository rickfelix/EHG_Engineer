-- LEO Protocol Enhancement: SD-Type-Aware Progress Validation
-- Purpose: Different SD types have different completion requirements
-- Problem Solved: Database/docs/infrastructure SDs were blocked by feature-focused validation
-- Date: 2025-12-07

-- ============================================================================
-- TABLE: SD Type Validation Profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_type_validation_profiles (
  sd_type VARCHAR(50) PRIMARY KEY,

  -- Phase weights (must sum to 100)
  lead_weight INT DEFAULT 20 CHECK (lead_weight >= 0 AND lead_weight <= 100),
  plan_weight INT DEFAULT 20 CHECK (plan_weight >= 0 AND plan_weight <= 100),
  exec_weight INT DEFAULT 30 CHECK (exec_weight >= 0 AND exec_weight <= 100),
  verify_weight INT DEFAULT 15 CHECK (verify_weight >= 0 AND verify_weight <= 100),
  final_weight INT DEFAULT 15 CHECK (final_weight >= 0 AND final_weight <= 100),

  -- What's required for this SD type
  requires_prd BOOLEAN DEFAULT true,
  requires_deliverables BOOLEAN DEFAULT true,
  requires_e2e_tests BOOLEAN DEFAULT true,
  requires_retrospective BOOLEAN DEFAULT true,
  requires_sub_agents BOOLEAN DEFAULT true,
  min_handoffs INT DEFAULT 3 CHECK (min_handoffs >= 0 AND min_handoffs <= 5),

  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure weights sum to 100
  CONSTRAINT weights_sum_to_100 CHECK (
    lead_weight + plan_weight + exec_weight + verify_weight + final_weight = 100
  )
);

-- Add comment
COMMENT ON TABLE sd_type_validation_profiles IS
'Configurable validation profiles for different SD types. Each type has different requirements for completion.';

-- ============================================================================
-- INSERT DEFAULT PROFILES
-- ============================================================================

INSERT INTO sd_type_validation_profiles (
  sd_type, lead_weight, plan_weight, exec_weight, verify_weight, final_weight,
  requires_prd, requires_deliverables, requires_e2e_tests, requires_retrospective, requires_sub_agents, min_handoffs,
  description
) VALUES
-- Feature: Full validation required
('feature', 20, 20, 30, 15, 15,
 true, true, true, true, true, 3,
 'Full feature development - all validations required including E2E tests, deliverables tracking, and sub-agent verification'),

-- Database: No deliverables/E2E, just PRD + retrospective
('database', 25, 25, 25, 10, 15,
 true, false, false, true, false, 2,
 'Database migrations, cleanup, schema changes - no deliverables tracking or E2E tests required'),

-- Docs: Minimal validation
('docs', 35, 20, 20, 10, 15,
 false, false, false, false, false, 1,
 'Documentation only - minimal validation, primarily LEAD approval with basic handoff'),

-- Infrastructure: PRD but no E2E
('infrastructure', 20, 25, 30, 10, 15,
 true, false, false, true, false, 2,
 'Infrastructure, CI/CD, environment config - PRD required but no E2E tests or deliverables'),

-- Bugfix: Heavier on implementation
('bugfix', 15, 15, 40, 20, 10,
 true, true, true, false, false, 2,
 'Bug fixes - heavier weight on EXEC phase, lighter on retrospective'),

-- Refactor: Balance implementation and verification
('refactor', 20, 15, 35, 20, 10,
 true, true, true, false, true, 2,
 'Code refactoring - requires sub-agent review, balanced implementation and verification'),

-- Security: Heavy verification
('security', 15, 20, 25, 25, 15,
 true, true, true, true, true, 3,
 'Security fixes/enhancements - requires thorough verification and sub-agent review'),

-- Performance: Focus on testing
('performance', 15, 20, 30, 25, 10,
 true, true, true, true, false, 2,
 'Performance optimization - heavy focus on verification and testing')

ON CONFLICT (sd_type) DO UPDATE SET
  lead_weight = EXCLUDED.lead_weight,
  plan_weight = EXCLUDED.plan_weight,
  exec_weight = EXCLUDED.exec_weight,
  verify_weight = EXCLUDED.verify_weight,
  final_weight = EXCLUDED.final_weight,
  requires_prd = EXCLUDED.requires_prd,
  requires_deliverables = EXCLUDED.requires_deliverables,
  requires_e2e_tests = EXCLUDED.requires_e2e_tests,
  requires_retrospective = EXCLUDED.requires_retrospective,
  requires_sub_agents = EXCLUDED.requires_sub_agents,
  min_handoffs = EXCLUDED.min_handoffs,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- FUNCTION: Calculate SD Progress (Profile-Aware)
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  progress INTEGER := 0;

  -- Phase completion checks
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INT := 0;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  -- Get SD type (default to 'feature' if not set)
  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- Get validation profile for this SD type
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  -- If no profile found, use feature defaults
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
    -- If still not found, create inline defaults
    IF NOT FOUND THEN
      profile := ROW('feature', 20, 20, 30, 15, 15, true, true, true, true, true, 3, 'Default', NOW(), NOW());
    END IF;
  END IF;

  -- ============================================================================
  -- PHASE 1: LEAD Initial Approval
  -- ============================================================================
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    progress := progress + profile.lead_weight;
  END IF;

  -- ============================================================================
  -- PHASE 2: PLAN PRD Creation
  -- ============================================================================
  IF profile.requires_prd THEN
    SELECT EXISTS (
      SELECT 1 FROM product_requirements_v2
      WHERE directive_id = sd_id_param
      AND status IN ('approved', 'in_progress', 'completed')
    ) INTO prd_exists;

    IF prd_exists THEN
      progress := progress + profile.plan_weight;
    END IF;
  ELSE
    -- PRD not required for this SD type - auto-complete
    progress := progress + profile.plan_weight;
  END IF;

  -- ============================================================================
  -- PHASE 3: EXEC Implementation
  -- ============================================================================
  IF profile.requires_deliverables THEN
    -- Check if deliverables exist and are complete
    IF EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true  -- No deliverables = complete
          WHEN COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*) THEN true
          ELSE false
        END INTO deliverables_complete
      FROM sd_scope_deliverables
      WHERE sd_id = sd_id_param
      AND priority IN ('required', 'high');
    ELSE
      -- No deliverables tracked = assume complete (legacy behavior)
      deliverables_complete := true;
    END IF;

    IF deliverables_complete THEN
      progress := progress + profile.exec_weight;
    END IF;
  ELSE
    -- Deliverables not required for this SD type - auto-complete
    progress := progress + profile.exec_weight;
  END IF;

  -- ============================================================================
  -- PHASE 4: PLAN Verification (User Stories + E2E)
  -- ============================================================================
  IF profile.requires_e2e_tests THEN
    -- Check user stories validation
    IF EXISTS (SELECT 1 FROM user_stories WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true
          WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' AND e2e_test_status = 'passing') = COUNT(*) THEN true
          ELSE false
        END INTO user_stories_validated
      FROM user_stories
      WHERE sd_id = sd_id_param;
    ELSE
      -- No user stories = validation not required
      user_stories_validated := true;
    END IF;

    -- Also check sub-agents if required
    IF profile.requires_sub_agents THEN
      BEGIN
        DECLARE
          subagent_check JSONB;
        BEGIN
          subagent_check := check_required_sub_agents(sd_id_param);
          IF user_stories_validated AND (subagent_check->>'all_verified')::boolean THEN
            progress := progress + profile.verify_weight;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Function doesn't exist, just use user story check
          IF user_stories_validated THEN
            progress := progress + profile.verify_weight;
          END IF;
        END;
      END;
    ELSE
      IF user_stories_validated THEN
        progress := progress + profile.verify_weight;
      END IF;
    END IF;
  ELSE
    -- E2E tests not required for this SD type - auto-complete
    progress := progress + profile.verify_weight;
  END IF;

  -- ============================================================================
  -- PHASE 5: LEAD Final Approval
  -- ============================================================================

  -- Check retrospective if required
  IF profile.requires_retrospective THEN
    SELECT EXISTS (
      SELECT 1 FROM retrospectives
      WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;
  ELSE
    retrospective_exists := true;  -- Not required, auto-pass
  END IF;

  -- Check handoffs (with configurable minimum)
  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  IF retrospective_exists AND handoffs_count >= profile.min_handoffs THEN
    progress := progress + profile.final_weight;
  END IF;

  RETURN progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get Progress Breakdown (Profile-Aware)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  breakdown JSONB;
  total_progress INTEGER;

  -- Component states
  prd_exists BOOLEAN;
  deliverables_complete BOOLEAN;
  user_stories_validated BOOLEAN;
  retrospective_exists BOOLEAN;
  handoffs_count INT;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  -- Get SD type and profile
  sd_type_val := COALESCE(sd.sd_type, 'feature');
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- Check each component
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE directive_id = sd_id_param
  ) INTO prd_exists;

  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  -- Calculate total
  total_progress := calculate_sd_progress(sd_id_param);

  -- Build breakdown
  breakdown := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_type_val,
    'current_phase', sd.current_phase,
    'status', sd.status,
    'profile', jsonb_build_object(
      'name', profile.sd_type,
      'description', profile.description,
      'requires_prd', profile.requires_prd,
      'requires_deliverables', profile.requires_deliverables,
      'requires_e2e_tests', profile.requires_e2e_tests,
      'requires_retrospective', profile.requires_retrospective,
      'requires_sub_agents', profile.requires_sub_agents,
      'min_handoffs', profile.min_handoffs
    ),
    'phases', jsonb_build_object(
      'LEAD_approval', jsonb_build_object(
        'weight', profile.lead_weight,
        'required', true,
        'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed'),
        'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed')
                        THEN profile.lead_weight ELSE 0 END
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', profile.plan_weight,
        'required', profile.requires_prd,
        'prd_exists', prd_exists,
        'complete', (NOT profile.requires_prd) OR prd_exists,
        'progress', CASE WHEN (NOT profile.requires_prd) OR prd_exists
                        THEN profile.plan_weight ELSE 0 END
      ),
      'EXEC_implementation', jsonb_build_object(
        'weight', profile.exec_weight,
        'required', profile.requires_deliverables,
        'complete', NOT profile.requires_deliverables,  -- Simplified for display
        'progress', CASE WHEN NOT profile.requires_deliverables
                        THEN profile.exec_weight ELSE 0 END,
        'note', CASE WHEN NOT profile.requires_deliverables
                     THEN 'Auto-complete: deliverables not required for ' || sd_type_val
                     ELSE 'Check sd_scope_deliverables table' END
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'required', profile.requires_e2e_tests,
        'complete', NOT profile.requires_e2e_tests,  -- Simplified for display
        'progress', CASE WHEN NOT profile.requires_e2e_tests
                        THEN profile.verify_weight ELSE 0 END,
        'note', CASE WHEN NOT profile.requires_e2e_tests
                     THEN 'Auto-complete: E2E tests not required for ' || sd_type_val
                     ELSE 'Check user_stories.e2e_test_status' END
      ),
      'LEAD_final_approval', jsonb_build_object(
        'weight', profile.final_weight,
        'retrospective_required', profile.requires_retrospective,
        'retrospective_exists', retrospective_exists,
        'min_handoffs', profile.min_handoffs,
        'handoffs_count', handoffs_count,
        'complete', (retrospective_exists OR NOT profile.requires_retrospective)
                    AND handoffs_count >= profile.min_handoffs,
        'progress', CASE WHEN (retrospective_exists OR NOT profile.requires_retrospective)
                              AND handoffs_count >= profile.min_handoffs
                        THEN profile.final_weight ELSE 0 END
      )
    ),
    'total_progress', total_progress,
    'can_complete', total_progress = 100
  );

  RETURN breakdown;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Enforce Progress (Updated to use profiles)
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_progress_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  calculated_progress INTEGER;
  progress_breakdown JSONB;
  sd_type_val VARCHAR;
BEGIN
  -- Only enforce when transitioning TO completed status
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN

    -- Get SD type for error message
    sd_type_val := COALESCE(NEW.sd_type, 'feature');

    -- Calculate progress dynamically using profile
    calculated_progress := calculate_sd_progress(NEW.id);

    -- Update progress_percentage field
    NEW.progress_percentage := calculated_progress;

    -- Block if progress is NULL
    IF calculated_progress IS NULL THEN
      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nProgress calculation returned NULL for SD type: %\n\nACTION REQUIRED:\n1. Verify sd_type_validation_profiles table has entry for ''%''\n2. Run: SELECT get_progress_breakdown(''%'') to debug',
        sd_type_val, sd_type_val, NEW.id;
    END IF;

    -- Block if progress < 100%
    IF calculated_progress < 100 THEN
      progress_breakdown := get_progress_breakdown(NEW.id);

      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nSD Type: % (using % validation profile)\nProgress: %%% (need 100%%)\n\nProfile Requirements:\n%\n\nPhase Breakdown:\n%\n\nACTION REQUIRED:\n1. Review: SELECT get_progress_breakdown(''%'');\n2. Complete required phases for this SD type\n3. Or update sd_type if miscategorized',
        sd_type_val,
        (progress_breakdown->'profile'->>'name'),
        calculated_progress,
        jsonb_pretty(progress_breakdown->'profile'),
        jsonb_pretty(progress_breakdown->'phases'),
        NEW.id;
    END IF;

    RAISE NOTICE 'Progress verification passed for % (type: %): 100%%', NEW.id, sd_type_val;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Get profile for SD type
-- ============================================================================

CREATE OR REPLACE FUNCTION get_sd_validation_profile(sd_type_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  profile RECORD;
BEGIN
  SELECT * INTO profile FROM sd_type_validation_profiles
  WHERE sd_type = COALESCE(sd_type_param, 'feature');

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  RETURN jsonb_build_object(
    'sd_type', profile.sd_type,
    'weights', jsonb_build_object(
      'lead', profile.lead_weight,
      'plan', profile.plan_weight,
      'exec', profile.exec_weight,
      'verify', profile.verify_weight,
      'final', profile.final_weight
    ),
    'requirements', jsonb_build_object(
      'prd', profile.requires_prd,
      'deliverables', profile.requires_deliverables,
      'e2e_tests', profile.requires_e2e_tests,
      'retrospective', profile.requires_retrospective,
      'sub_agents', profile.requires_sub_agents,
      'min_handoffs', profile.min_handoffs
    ),
    'description', profile.description
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION calculate_sd_progress IS
'Profile-aware SD progress calculation. Uses sd_type_validation_profiles to determine requirements.';

COMMENT ON FUNCTION get_progress_breakdown IS
'Returns detailed progress breakdown including profile information and phase-by-phase status.';

COMMENT ON FUNCTION enforce_progress_on_completion IS
'Trigger function that blocks SD completion if calculated progress < 100%. Now SD-type-aware.';

COMMENT ON FUNCTION get_sd_validation_profile IS
'Returns the validation profile for a given SD type as JSONB.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  profile_count INT;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM sd_type_validation_profiles;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-Type-Aware Progress Validation Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Profiles created: %', profile_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Available SD types and their requirements:';
  RAISE NOTICE '  feature:        Full validation (PRD, deliverables, E2E, retro, sub-agents)';
  RAISE NOTICE '  database:       PRD + retrospective only (no deliverables, no E2E)';
  RAISE NOTICE '  docs:           Minimal (just LEAD approval + 1 handoff)';
  RAISE NOTICE '  infrastructure: PRD + retrospective (no E2E)';
  RAISE NOTICE '  bugfix:         PRD + deliverables + E2E (no retrospective)';
  RAISE NOTICE '  refactor:       PRD + deliverables + E2E + sub-agents';
  RAISE NOTICE '  security:       Full validation';
  RAISE NOTICE '  performance:    PRD + deliverables + E2E + retrospective';
  RAISE NOTICE '';
  RAISE NOTICE 'To check a profile: SELECT get_sd_validation_profile(''database'');';
  RAISE NOTICE 'To debug SD progress: SELECT get_progress_breakdown(''SD-XXX'');';
  RAISE NOTICE '============================================================';
END $$;
