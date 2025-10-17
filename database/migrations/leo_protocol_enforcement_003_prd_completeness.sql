-- LEO Protocol Enhancement #3: PRD Acceptance Criteria Gate
-- Purpose: Prevent empty PRDs from allowing EXEC phase to start
-- Root Cause Fixed: Empty PRD (no acceptance criteria enforced)
-- Date: 2025-10-10
-- Related SD: SD-AGENT-MIGRATION-001 had PRD with objectives='N/A', acceptance_criteria='N/A'

-- ============================================================================
-- FUNCTION: Validate PRD Completeness
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_prd_completeness(prd_id UUID)
RETURNS JSONB AS $$
DECLARE
  prd RECORD;
  issues TEXT[] := ARRAY[]::TEXT[];
  warnings TEXT[] := ARRAY[]::TEXT[];
  score INTEGER := 0;
BEGIN
  -- Get PRD data
  SELECT * INTO prd FROM product_requirements_v2 WHERE id = prd_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'complete', false,
      'score', 0,
      'issues', jsonb_build_array('PRD not found')
    );
  END IF;

  -- ============================================================================
  -- VALIDATION 1: Objectives (25 points)
  -- ============================================================================
  IF prd.objectives IS NULL OR prd.objectives = '' OR prd.objectives = 'N/A' THEN
    issues := array_append(issues, 'Missing objectives - what is this PRD trying to achieve?');
  ELSIF length(prd.objectives) < 50 THEN
    warnings := array_append(warnings, 'Objectives are very brief - consider adding more detail');
    score := score + 15; -- Partial credit
  ELSE
    score := score + 25;
  END IF;

  -- ============================================================================
  -- VALIDATION 2: Acceptance Criteria (30 points)
  -- ============================================================================
  IF prd.acceptance_criteria IS NULL THEN
    issues := array_append(issues, 'Missing acceptance_criteria - how will we know this is complete?');
  ELSIF prd.acceptance_criteria = 'N/A' OR prd.acceptance_criteria::text = '[]' THEN
    issues := array_append(issues, 'Acceptance criteria set to N/A or empty - must define success criteria');
  ELSIF jsonb_typeof(prd.acceptance_criteria) = 'array' AND jsonb_array_length(prd.acceptance_criteria) < 3 THEN
    issues := array_append(issues, format('Only %s acceptance criteria (need at least 3)', jsonb_array_length(prd.acceptance_criteria)));
  ELSIF jsonb_typeof(prd.acceptance_criteria) = 'string' AND length(prd.acceptance_criteria::text) < 50 THEN
    warnings := array_append(warnings, 'Acceptance criteria are too brief');
    score := score + 15; -- Partial credit
  ELSE
    score := score + 30;
  END IF;

  -- ============================================================================
  -- VALIDATION 3: Scope (15 points)
  -- ============================================================================
  IF prd.scope IS NULL OR prd.scope = '' THEN
    issues := array_append(issues, 'Missing scope definition - what is in/out of scope?');
  ELSIF length(prd.scope) < 100 THEN
    warnings := array_append(warnings, 'Scope definition is very brief');
    score := score + 10; -- Partial credit
  ELSE
    score := score + 15;
  END IF;

  -- ============================================================================
  -- VALIDATION 4: Test Plan (15 points)
  -- ============================================================================
  IF prd.test_plan IS NULL OR prd.test_plan = '' THEN
    warnings := array_append(warnings, 'Missing test_plan - consider adding test scenarios');
  ELSIF length(prd.test_plan) < 50 THEN
    warnings := array_append(warnings, 'Test plan is very brief');
    score := score + 10; -- Partial credit
  ELSE
    score := score + 15;
  END IF;

  -- ============================================================================
  -- VALIDATION 5: Technical Requirements (15 points)
  -- ============================================================================
  IF prd.technical_requirements IS NOT NULL AND prd.technical_requirements != '' THEN
    IF length(prd.technical_requirements) >= 100 THEN
      score := score + 15;
    ELSE
      score := score + 10; -- Partial credit
    END IF;
  ELSE
    warnings := array_append(warnings, 'Missing technical_requirements - consider adding technical constraints');
  END IF;

  -- ============================================================================
  -- BONUS: EXEC/PLAN Checklists (+10 points)
  -- ============================================================================
  IF prd.exec_checklist IS NOT NULL AND jsonb_array_length(prd.exec_checklist) >= 5 THEN
    score := score + 5;
  END IF;

  IF prd.plan_checklist IS NOT NULL AND jsonb_array_length(prd.plan_checklist) >= 3 THEN
    score := score + 5;
  END IF;

  RETURN jsonb_build_object(
    'complete', array_length(issues, 1) IS NULL AND score >= 70,
    'score', score,
    'threshold', 70,
    'issues', issues,
    'warnings', warnings,
    'blocking_issues', issues,
    'recommendation', CASE
      WHEN score >= 85 THEN 'PRD meets high quality standards'
      WHEN score >= 70 THEN 'PRD acceptable but could be improved'
      WHEN score >= 50 THEN 'PRD needs significant improvement before EXEC phase'
      ELSE 'PRD is incomplete - cannot proceed to EXEC'
    END
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Check PRD before PLAN->EXEC handoff
-- ============================================================================

CREATE OR REPLACE FUNCTION check_prd_for_exec_handoff(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  prd RECORD;
  validation JSONB;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'can_proceed', false,
      'reason', 'SD not found'
    );
  END IF;

  -- Get PRD for this SD
  SELECT * INTO prd
  FROM product_requirements_v2
  WHERE directive_id = sd_id_param
  OR sd_uuid = sd.uuid_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'can_proceed', false,
      'reason', 'No PRD found for this SD - PLAN must create PRD first',
      'action_required', 'Create PRD using Product Requirements Expert sub-agent'
    );
  END IF;

  -- Validate PRD completeness
  validation := validate_prd_completeness(prd.id);

  IF NOT (validation->>'complete')::boolean THEN
    RETURN jsonb_build_object(
      'can_proceed', false,
      'reason', 'PRD is incomplete',
      'prd_id', prd.id,
      'validation', validation,
      'action_required', 'Complete PRD with all required sections before PLAN->EXEC handoff'
    );
  END IF;

  -- All checks passed
  RETURN jsonb_build_object(
    'can_proceed', true,
    'prd_id', prd.id,
    'prd_score', validation->>'score',
    'validation', validation
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Auto-validate PRD on status change
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_validate_prd_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  validation JSONB;
BEGIN
  -- Only validate when status changes to 'approved' or 'in_progress'
  IF NEW.status IN ('approved', 'in_progress') AND OLD.status != NEW.status THEN
    validation := validate_prd_completeness(NEW.id);

    -- Block if PRD is incomplete
    IF NOT (validation->>'complete')::boolean THEN
      RAISE EXCEPTION 'Cannot change PRD status to %: PRD validation failed. Issues: %',
        NEW.status,
        validation->>'issues';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_prd_status_change
  BEFORE UPDATE OF status
  ON product_requirements_v2
  FOR EACH ROW
  EXECUTE FUNCTION auto_validate_prd_on_status_change();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION validate_prd_completeness IS 'Validates PRD has all required sections (objectives, acceptance_criteria, scope, test_plan) with sufficient detail - returns score 0-100 with threshold 70';
COMMENT ON FUNCTION check_prd_for_exec_handoff IS 'Checks if PRD is complete enough to proceed with PLAN->EXEC handoff - blocks if validation fails';
COMMENT ON FUNCTION auto_validate_prd_on_status_change IS 'Trigger function that validates PRD before allowing status change to approved/in_progress';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'LEO Protocol Enhancement #3 applied successfully';
  RAISE NOTICE 'Function created: validate_prd_completeness(prd_id)';
  RAISE NOTICE 'Function created: check_prd_for_exec_handoff(sd_id)';
  RAISE NOTICE 'Trigger created: validate_prd_status_change (blocks incomplete PRDs)';
  RAISE NOTICE 'Quality threshold: 70/100 required for PLAN->EXEC handoff';
  RAISE NOTICE 'Minimum acceptance criteria: 3 items';
END $$;
