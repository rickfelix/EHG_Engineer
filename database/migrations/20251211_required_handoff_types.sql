-- ============================================================================
-- Migration: Replace min_handoffs with required_handoff_types
-- Purpose: Semantic handoff validation instead of count-based
-- Root Cause: SD-VISION-TRANSITION-001D6 was blocked because infrastructure SDs
--             required 4 handoffs but PLAN-TO-EXEC validates deliverables that
--             infrastructure SDs don't have (requires_deliverables = false)
-- Date: 2025-12-11
-- ============================================================================

-- OVERVIEW:
-- The current min_handoffs INT approach is semantically wrong:
-- - It says "need N handoffs" but doesn't specify WHICH ones
-- - Infrastructure SDs get blocked for missing PLAN-TO-EXEC even though
--   that handoff validates deliverables they don't have
-- - No enforcement of handoff sequence
--
-- NEW APPROACH: required_handoff_types TEXT[]
-- - Explicitly declares which handoff types are required per SD type
-- - Allows infrastructure SDs to skip PLAN-TO-EXEC
-- - Better error messages: "Missing EXEC-TO-PLAN" vs "Need 3 handoffs"
-- - Enforces semantic intent, not just counts

-- ============================================================================
-- PART 1: ADD required_handoff_types COLUMN
-- ============================================================================

ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS required_handoff_types TEXT[] DEFAULT ARRAY['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'];

COMMENT ON COLUMN sd_type_validation_profiles.required_handoff_types IS
'Explicit list of required handoff types for this SD type. Replaces min_handoffs count with semantic validation.';

-- ============================================================================
-- PART 2: POPULATE required_handoff_types FOR EACH SD TYPE
-- ============================================================================

-- Feature: Full pipeline (4 handoffs)
UPDATE sd_type_validation_profiles
SET required_handoff_types = ARRAY['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD']
WHERE sd_type = 'feature';

-- Database: Approval + execution + verification (no PLAN-TO-EXEC deliverable check needed)
UPDATE sd_type_validation_profiles
SET required_handoff_types = ARRAY['LEAD-TO-PLAN', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD']
WHERE sd_type = 'database';

-- Docs: Minimal - just approval and closure
UPDATE sd_type_validation_profiles
SET required_handoff_types = ARRAY['LEAD-TO-PLAN', 'PLAN-TO-LEAD']
WHERE sd_type = 'docs';

-- Infrastructure: Same as database - no deliverables to validate at PLAN-TO-EXEC
-- Chain: LEAD-TO-PLAN → (implicit exec) → EXEC-TO-PLAN → PLAN-TO-LEAD
UPDATE sd_type_validation_profiles
SET required_handoff_types = ARRAY['LEAD-TO-PLAN', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD']
WHERE sd_type = 'infrastructure';

-- Bugfix: Full pipeline but critical path
UPDATE sd_type_validation_profiles
SET required_handoff_types = ARRAY['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD']
WHERE sd_type = 'bugfix';

-- Refactor: Full pipeline with sub-agent review
UPDATE sd_type_validation_profiles
SET required_handoff_types = ARRAY['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD']
WHERE sd_type = 'refactor';

-- Security: Full pipeline - security requires all gates
UPDATE sd_type_validation_profiles
SET required_handoff_types = ARRAY['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD']
WHERE sd_type = 'security';

-- Performance: Full pipeline - performance requires verification
UPDATE sd_type_validation_profiles
SET required_handoff_types = ARRAY['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD']
WHERE sd_type = 'performance';

-- ============================================================================
-- PART 3: UPDATE calculate_sd_progress FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INT AS $$
DECLARE
  sd RECORD;
  profile RECORD;
  progress INT := 0;
  prd_exists BOOLEAN;
  deliverables_count INT;
  e2e_count INT;
  retrospective_exists BOOLEAN;
  sub_agent_count INT;
  completed_handoff_types TEXT[];
  missing_handoffs TEXT[];
  sd_type_val VARCHAR;
BEGIN
  -- Get SD details
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get SD type (default to 'feature' if not specified)
  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- Get validation profile for this SD type
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  -- If no profile found, use feature defaults
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
    -- If still not found, create inline defaults
    IF NOT FOUND THEN
      profile := ROW(
        'feature', 20, 20, 30, 15, 15,
        true, true, true, true, true, 3,
        'Default', NOW(), NOW(),
        false, NULL, NULL,
        ARRAY['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN']
      );
    END IF;
  END IF;

  -- LEAD phase: Always contributes weight if SD exists and is approved
  IF sd.status IN ('active', 'approved', 'in_progress', 'pending_approval', 'completed') THEN
    progress := progress + profile.lead_weight;
  END IF;

  -- PLAN phase: Check for PRD
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE directive_id = sd_id_param
  ) INTO prd_exists;

  IF profile.requires_prd AND prd_exists THEN
    progress := progress + profile.plan_weight;
  ELSIF NOT profile.requires_prd THEN
    progress := progress + profile.plan_weight;
  END IF;

  -- EXEC phase: Check deliverables (if required)
  IF profile.requires_deliverables THEN
    SELECT COUNT(*) INTO deliverables_count
    FROM sd_deliverables
    WHERE sd_id = sd_id_param AND status = 'completed';

    IF deliverables_count > 0 THEN
      progress := progress + profile.exec_weight;
    END IF;
  ELSE
    -- If deliverables not required, check for any accepted handoff past PLAN
    SELECT EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = sd_id_param
      AND status = 'accepted'
      AND handoff_type IN ('EXEC-TO-PLAN', 'PLAN-TO-LEAD')
    ) INTO prd_exists; -- Reusing variable
    IF prd_exists THEN
      progress := progress + profile.exec_weight;
    END IF;
  END IF;

  -- VERIFY phase: Check E2E tests (if required)
  IF profile.requires_e2e_tests THEN
    SELECT COUNT(*) INTO e2e_count
    FROM test_coverage_reports
    WHERE sd_id = sd_id_param AND test_type = 'e2e';

    IF e2e_count > 0 THEN
      progress := progress + profile.verify_weight;
    END IF;
  ELSE
    -- If E2E not required, auto-grant verify weight
    progress := progress + profile.verify_weight;
  END IF;

  -- FINAL phase: Check retrospective AND required handoff types
  SELECT EXISTS (
    SELECT 1 FROM retrospectives
    WHERE sd_id = sd_id_param AND status = 'PUBLISHED'
  ) INTO retrospective_exists;

  -- Get completed handoff types
  SELECT ARRAY_AGG(DISTINCT handoff_type) INTO completed_handoff_types
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  -- Handle NULL array (no handoffs yet)
  IF completed_handoff_types IS NULL THEN
    completed_handoff_types := ARRAY[]::TEXT[];
  END IF;

  -- Check if all required handoff types are present
  -- Using array containment: required_handoff_types <@ completed_handoff_types
  -- means "all elements of required are in completed"
  IF (NOT profile.requires_retrospective OR retrospective_exists) AND
     (profile.required_handoff_types IS NULL OR
      profile.required_handoff_types <@ completed_handoff_types) THEN
    progress := progress + profile.final_weight;
  END IF;

  RETURN progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 4: UPDATE get_progress_breakdown FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  profile RECORD;
  sd_type_val VARCHAR;
  prd_exists BOOLEAN;
  deliverables_count INT;
  e2e_count INT;
  retrospective_exists BOOLEAN;
  completed_handoff_types TEXT[];
  missing_handoffs TEXT[];
BEGIN
  -- Get SD details
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- Get profile
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- Check components
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE directive_id = sd_id_param
  ) INTO prd_exists;

  SELECT COUNT(*) INTO deliverables_count
  FROM sd_deliverables
  WHERE sd_id = sd_id_param AND status = 'completed';

  SELECT COUNT(*) INTO e2e_count
  FROM test_coverage_reports
  WHERE sd_id = sd_id_param AND test_type = 'e2e';

  SELECT EXISTS (
    SELECT 1 FROM retrospectives
    WHERE sd_id = sd_id_param AND status = 'PUBLISHED'
  ) INTO retrospective_exists;

  -- Get completed handoff types
  SELECT ARRAY_AGG(DISTINCT handoff_type) INTO completed_handoff_types
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  IF completed_handoff_types IS NULL THEN
    completed_handoff_types := ARRAY[]::TEXT[];
  END IF;

  -- Calculate missing handoffs
  SELECT ARRAY(
    SELECT unnest(profile.required_handoff_types)
    EXCEPT
    SELECT unnest(completed_handoff_types)
  ) INTO missing_handoffs;

  RETURN jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_type_val,
    'profile', jsonb_build_object(
      'name', profile.sd_type,
      'requires_prd', profile.requires_prd,
      'requires_deliverables', profile.requires_deliverables,
      'requires_e2e_tests', profile.requires_e2e_tests,
      'requires_retrospective', profile.requires_retrospective,
      'required_handoff_types', profile.required_handoff_types
    ),
    'phases', jsonb_build_object(
      'LEAD', jsonb_build_object(
        'weight', profile.lead_weight,
        'complete', sd.status IN ('active', 'approved', 'in_progress', 'pending_approval', 'completed')
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', profile.plan_weight,
        'complete', NOT profile.requires_prd OR prd_exists,
        'prd_exists', prd_exists
      ),
      'EXEC_deliverables', jsonb_build_object(
        'weight', profile.exec_weight,
        'complete', NOT profile.requires_deliverables OR deliverables_count > 0,
        'deliverables_count', deliverables_count
      ),
      'VERIFY_e2e', jsonb_build_object(
        'weight', profile.verify_weight,
        'complete', NOT profile.requires_e2e_tests OR e2e_count > 0,
        'e2e_count', e2e_count
      ),
      'FINAL', jsonb_build_object(
        'weight', profile.final_weight,
        'complete', (NOT profile.requires_retrospective OR retrospective_exists) AND
                   (profile.required_handoff_types IS NULL OR
                    profile.required_handoff_types <@ completed_handoff_types),
        'retrospective_exists', retrospective_exists,
        'completed_handoffs', completed_handoff_types,
        'required_handoffs', profile.required_handoff_types,
        'missing_handoffs', missing_handoffs
      )
    ),
    'calculated_progress', calculate_sd_progress(sd_id_param)
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: UPDATE enforce_progress_on_completion TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_progress_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  calculated_progress INT;
  progress_breakdown JSONB;
  sd_type_val VARCHAR;
  missing_handoffs TEXT[];
  profile RECORD;
BEGIN
  -- Only check when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Get SD type
    sd_type_val := COALESCE(NEW.sd_type, 'feature');

    -- Get profile for error message
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

    -- Calculate progress
    calculated_progress := calculate_sd_progress(NEW.id);

    -- Block if progress is NULL
    IF calculated_progress IS NULL THEN
      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nProgress calculation returned NULL for SD type: %\n\nACTION REQUIRED:\n1. Verify sd_type_validation_profiles table has entry for ''%''\n2. Run: SELECT get_progress_breakdown(''%'') to debug',
        sd_type_val, sd_type_val, NEW.id;
    END IF;

    -- Block if progress < 100%
    IF calculated_progress < 100 THEN
      progress_breakdown := get_progress_breakdown(NEW.id);

      -- Extract missing handoffs for clearer error message
      missing_handoffs := ARRAY(
        SELECT jsonb_array_elements_text(progress_breakdown->'phases'->'FINAL'->'missing_handoffs')
      );

      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nSD Type: % (validation profile: %)\nProgress: %%% (need 100%%)\n\nRequired Handoffs: %\nCompleted Handoffs: %\nMissing Handoffs: %\n\nPhase Breakdown:\n%\n\nACTION REQUIRED:\n1. Complete missing handoffs: %\n2. Run: SELECT get_progress_breakdown(''%'') for details\n3. Or update sd_type if miscategorized',
        sd_type_val,
        profile.sd_type,
        calculated_progress,
        array_to_string(profile.required_handoff_types, ', '),
        (progress_breakdown->'phases'->'FINAL'->>'completed_handoffs'),
        array_to_string(missing_handoffs, ', '),
        jsonb_pretty(progress_breakdown->'phases'),
        array_to_string(missing_handoffs, ', '),
        NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 6: VALIDATION
-- ============================================================================

DO $$
DECLARE
  profile_rec RECORD;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Required Handoff Types Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'SD Type Handoff Requirements:';

  FOR profile_rec IN
    SELECT sd_type, required_handoff_types
    FROM sd_type_validation_profiles
    ORDER BY sd_type
  LOOP
    RAISE NOTICE '  %: %', profile_rec.sd_type, array_to_string(profile_rec.required_handoff_types, ' → ');
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'Key Changes:';
  RAISE NOTICE '  - infrastructure: LEAD-TO-PLAN → EXEC-TO-PLAN → PLAN-TO-LEAD';
  RAISE NOTICE '    (skips PLAN-TO-EXEC - no deliverables to validate)';
  RAISE NOTICE '  - database: Same as infrastructure';
  RAISE NOTICE '  - docs: LEAD-TO-PLAN → PLAN-TO-LEAD (minimal)';
  RAISE NOTICE '  - feature/bugfix/security/performance: Full pipeline';
  RAISE NOTICE '';
  RAISE NOTICE 'To debug an SD: SELECT get_progress_breakdown(''SD-XXX'');';
  RAISE NOTICE '============================================================';
END $$;
