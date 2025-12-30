-- LEO Protocol Enhancement: Shift-Left Prerequisite Validation
-- SD: SD-LEO-RESILIENCE-001
-- Purpose: Prevent SDs from transitioning to phases without required prerequisites
-- Root Cause: SD-STAGE-ARCH-001-P4 was in EXEC with 0 PRDs, 0 user stories, 0 handoffs
-- Date: 2025-12-30

-- ============================================================================
-- HELPER FUNCTION: Check SD Prerequisites Before Phase Transition
-- ============================================================================

CREATE OR REPLACE FUNCTION check_sd_prerequisites(sd_id_param VARCHAR, target_phase_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  v_sd RECORD;
  v_profile RECORD;
  v_result JSONB;
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_present TEXT[] := ARRAY[]::TEXT[];
  v_prd_exists BOOLEAN;
  v_stories_exist BOOLEAN;
  v_handoff_exists BOOLEAN;
BEGIN
  -- Get SD
  SELECT * INTO v_sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found: ' || sd_id_param);
  END IF;

  -- Get profile for this SD type
  SELECT * INTO v_profile FROM sd_type_validation_profiles
  WHERE sd_type = COALESCE(v_sd.sd_type, 'feature');

  IF NOT FOUND THEN
    SELECT * INTO v_profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- =====================================================
  -- CHECK PREREQUISITES FOR EXEC TRANSITION
  -- =====================================================
  IF target_phase_param = 'EXEC' THEN

    -- Check PRD requirement
    IF COALESCE(v_profile.requires_prd, true) THEN
      SELECT EXISTS (
        SELECT 1 FROM product_requirements_v2
        WHERE directive_id = sd_id_param
           OR id = 'PRD-' || sd_id_param
      ) INTO v_prd_exists;

      IF v_prd_exists THEN
        v_present := array_append(v_present, 'PRD in product_requirements_v2');
      ELSE
        v_missing := array_append(v_missing, 'PRD in product_requirements_v2 (directive_id = ' || sd_id_param || ')');
      END IF;
    ELSE
      v_present := array_append(v_present, 'PRD (not required for ' || COALESCE(v_sd.sd_type, 'feature') || ')');
    END IF;

    -- Check user stories requirement (only for types that require E2E)
    IF COALESCE(v_profile.requires_e2e_tests, true) THEN
      SELECT EXISTS (
        SELECT 1 FROM user_stories WHERE sd_id = sd_id_param
      ) INTO v_stories_exist;

      IF v_stories_exist THEN
        v_present := array_append(v_present, 'User stories in user_stories');
      ELSE
        v_missing := array_append(v_missing, 'User stories in user_stories (sd_id = ' || sd_id_param || ')');
      END IF;
    ELSE
      v_present := array_append(v_present, 'User stories (not required for ' || COALESCE(v_sd.sd_type, 'feature') || ')');
    END IF;

    -- Check PLAN-TO-EXEC handoff requirement
    SELECT EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = sd_id_param
      AND handoff_type IN ('PLAN-to-EXEC', 'PLAN-TO-EXEC')
      AND status = 'accepted'
    ) INTO v_handoff_exists;

    IF v_handoff_exists THEN
      v_present := array_append(v_present, 'PLAN-TO-EXEC handoff in sd_phase_handoffs');
    ELSE
      v_missing := array_append(v_missing, 'PLAN-TO-EXEC handoff in sd_phase_handoffs (status = accepted)');
    END IF;
  END IF;

  -- =====================================================
  -- CHECK PREREQUISITES FOR PLAN TRANSITION
  -- =====================================================
  IF target_phase_param = 'PLAN' THEN
    -- Check LEAD-TO-PLAN handoff
    SELECT EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = sd_id_param
      AND handoff_type IN ('LEAD-to-PLAN', 'LEAD-TO-PLAN')
      AND status = 'accepted'
    ) INTO v_handoff_exists;

    IF v_handoff_exists THEN
      v_present := array_append(v_present, 'LEAD-TO-PLAN handoff');
    ELSE
      v_missing := array_append(v_missing, 'LEAD-TO-PLAN handoff in sd_phase_handoffs');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sd_id', sd_id_param,
    'target_phase', target_phase_param,
    'sd_type', COALESCE(v_sd.sd_type, 'feature'),
    'can_transition', array_length(v_missing, 1) IS NULL,
    'present', v_present,
    'missing', v_missing
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_sd_prerequisites IS
'Checks if an SD has all required prerequisites for a phase transition. Returns JSONB with present/missing items.';

-- ============================================================================
-- MAIN VALIDATION FUNCTION: Validate Prerequisites Before Phase Transition
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_sd_phase_prerequisites()
RETURNS TRIGGER AS $$
DECLARE
  v_sd_type VARCHAR;
  v_profile RECORD;
  v_prd_exists BOOLEAN;
  v_stories_exist BOOLEAN;
  v_handoff_exists BOOLEAN;
  v_missing_prereqs TEXT[] := ARRAY[]::TEXT[];
  v_error_message TEXT;
BEGIN
  -- Only validate on phase change
  IF NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase THEN
    RETURN NEW;
  END IF;

  -- Get SD type and validation profile
  v_sd_type := COALESCE(NEW.sd_type, 'feature');
  SELECT * INTO v_profile FROM sd_type_validation_profiles WHERE sd_type = v_sd_type;
  IF NOT FOUND THEN
    SELECT * INTO v_profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- =====================================================
  -- TRANSITION TO EXEC: Require PRD, Stories, Handoff
  -- =====================================================
  IF NEW.current_phase = 'EXEC' AND OLD.current_phase IN ('PLAN', 'LEAD', 'LEAD_APPROVAL') THEN

    -- Check PRD requirement
    IF COALESCE(v_profile.requires_prd, true) THEN
      SELECT EXISTS (
        SELECT 1 FROM product_requirements_v2
        WHERE directive_id = NEW.id
           OR id = 'PRD-' || NEW.id
      ) INTO v_prd_exists;

      IF NOT v_prd_exists THEN
        v_missing_prereqs := array_append(v_missing_prereqs,
          'PRD in product_requirements_v2 (directive_id = ' || NEW.id || ')');
      END IF;
    END IF;

    -- Check user stories requirement (only for types that require E2E)
    IF COALESCE(v_profile.requires_e2e_tests, true) THEN
      SELECT EXISTS (
        SELECT 1 FROM user_stories WHERE sd_id = NEW.id
      ) INTO v_stories_exist;

      IF NOT v_stories_exist THEN
        v_missing_prereqs := array_append(v_missing_prereqs,
          'User stories in user_stories table (sd_id = ' || NEW.id || ')');
      END IF;
    END IF;

    -- Check PLAN-TO-EXEC handoff requirement
    SELECT EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = NEW.id
      AND handoff_type IN ('PLAN-to-EXEC', 'PLAN-TO-EXEC')
      AND status = 'accepted'
    ) INTO v_handoff_exists;

    IF NOT v_handoff_exists THEN
      v_missing_prereqs := array_append(v_missing_prereqs,
        'PLAN-TO-EXEC handoff in sd_phase_handoffs (status = accepted)');
    END IF;
  END IF;

  -- =====================================================
  -- BUILD ERROR MESSAGE IF PREREQUISITES MISSING
  -- =====================================================
  IF array_length(v_missing_prereqs, 1) > 0 THEN
    v_error_message := format(
      E'LEO Protocol Violation: Shift-Left Prerequisite Check Failed\n\n'
      'SD: %s\n'
      'SD Type: %s\n'
      'Transition: %s -> %s\n\n'
      'MISSING PREREQUISITES:\n  - %s\n\n'
      'ACTION REQUIRED:\n'
      '1. Create missing prerequisites in their canonical database tables\n'
      '2. Use LEO Protocol scripts:\n'
      '   - PRD: node scripts/add-prd-to-database.js\n'
      '   - Handoff: node scripts/handoff.js execute PLAN-TO-EXEC %s\n'
      '3. Then retry phase transition',
      NEW.id,
      v_sd_type,
      COALESCE(OLD.current_phase, 'NULL'),
      NEW.current_phase,
      array_to_string(v_missing_prereqs, E'\n  - '),
      NEW.id
    );

    RAISE EXCEPTION '%', v_error_message
    USING HINT = 'Prerequisites must exist in database before phase transition';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_sd_phase_prerequisites IS
'Trigger function that validates prerequisites exist before SD phase transitions. Implements shift-left validation.';

-- ============================================================================
-- CREATE TRIGGER (Initially with warning, change to EXCEPTION for enforcement)
-- ============================================================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS enforce_sd_phase_prerequisites ON strategic_directives_v2;

-- Create trigger - validates prerequisites before phase transition
CREATE TRIGGER enforce_sd_phase_prerequisites
  BEFORE UPDATE OF current_phase
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_sd_phase_prerequisites();

-- ============================================================================
-- AUDIT QUERY: Find Non-Compliant SDs (Run before enabling strict enforcement)
-- ============================================================================

-- This is a query to run, not a function. Save output before enabling trigger.
--
-- SELECT
--   sd.id,
--   sd.title,
--   sd.current_phase,
--   sd.sd_type,
--   sd.status,
--   CASE WHEN prd.id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_prd,
--   CASE WHEN stories.story_count > 0 THEN 'YES (' || stories.story_count || ')' ELSE 'NO' END as has_stories,
--   CASE WHEN handoff.id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_exec_handoff
-- FROM strategic_directives_v2 sd
-- LEFT JOIN product_requirements_v2 prd ON prd.directive_id = sd.id OR prd.id = 'PRD-' || sd.id
-- LEFT JOIN (SELECT sd_id, COUNT(*) as story_count FROM user_stories GROUP BY sd_id) stories ON stories.sd_id = sd.id
-- LEFT JOIN sd_phase_handoffs handoff ON handoff.sd_id = sd.id AND handoff.handoff_type ILIKE 'PLAN-TO-EXEC' AND handoff.status = 'accepted'
-- WHERE sd.current_phase = 'EXEC'
-- AND sd.is_active = true
-- AND (prd.id IS NULL OR stories.story_count IS NULL OR stories.story_count = 0 OR handoff.id IS NULL)
-- ORDER BY sd.created_at DESC;

-- ============================================================================
-- VERIFICATION: Test the functions
-- ============================================================================

DO $$
DECLARE
  v_result JSONB;
BEGIN
  -- Test check_sd_prerequisites function
  v_result := check_sd_prerequisites('SD-LEO-RESILIENCE-001', 'EXEC');

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SHIFT-LEFT PREREQUISITE VALIDATION MIGRATION COMPLETE';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created Functions:';
  RAISE NOTICE '  - check_sd_prerequisites(sd_id, target_phase) -> JSONB';
  RAISE NOTICE '  - validate_sd_phase_prerequisites() -> TRIGGER FUNCTION';
  RAISE NOTICE '';
  RAISE NOTICE 'Created Trigger:';
  RAISE NOTICE '  - enforce_sd_phase_prerequisites ON strategic_directives_v2';
  RAISE NOTICE '  - Fires: BEFORE UPDATE OF current_phase';
  RAISE NOTICE '';
  RAISE NOTICE 'Validation Rules:';
  RAISE NOTICE '  - EXEC transition requires:';
  RAISE NOTICE '    * PRD in product_requirements_v2 (if requires_prd=true)';
  RAISE NOTICE '    * User stories in user_stories (if requires_e2e_tests=true)';
  RAISE NOTICE '    * PLAN-TO-EXEC handoff in sd_phase_handoffs';
  RAISE NOTICE '';
  RAISE NOTICE 'SD Type Bypass:';
  RAISE NOTICE '  - docs: PRD optional (requires_prd=false)';
  RAISE NOTICE '  - infrastructure: User stories optional (requires_e2e_tests=false)';
  RAISE NOTICE '  - database: User stories optional (requires_e2e_tests=false)';
  RAISE NOTICE '';
  RAISE NOTICE 'Test Result for SD-LEO-RESILIENCE-001 -> EXEC:';
  RAISE NOTICE '  %', v_result;
  RAISE NOTICE '============================================================';
END $$;

-- ============================================================================
-- LOG THE MIGRATION
-- ============================================================================

INSERT INTO leo_protocol_changes (
  protocol_id,
  change_type,
  description,
  changed_fields,
  change_reason,
  changed_by
) VALUES (
  'leo-v4-3-3-ui-parity',
  'enforcement_trigger',
  'Shift-Left Prerequisite Validation Trigger',
  '{"trigger": "enforce_sd_phase_prerequisites", "function": "validate_sd_phase_prerequisites", "helper": "check_sd_prerequisites"}'::jsonb,
  'Prevent SDs from transitioning to phases without required prerequisites. Root cause: SD-STAGE-ARCH-001-P4 was in EXEC with 0 PRDs, 0 user stories, 0 handoffs.',
  'SD-LEO-RESILIENCE-001'
) ON CONFLICT DO NOTHING;
