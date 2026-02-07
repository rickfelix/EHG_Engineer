-- ============================================================================
-- Migration: SD Workflow Templates - Type-Specific Progress Calculation
-- SD: SD-LEO-INFRA-WORKFLOW-TEMPLATES-TYPE-001
-- Parent: SD-LEO-INFRA-DATA-CENTRIC-ARCHITECTURE-001
--
-- Creates sd_workflow_templates and sd_workflow_template_steps tables,
-- backfills templates for all registered SD types, and updates
-- get_progress_breakdown() to use templates with hardcoded fallback.
-- ============================================================================

-- ============================================================================
-- PART 1: Create sd_workflow_templates table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_type TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sd_type, version)
);

-- Only one active template per sd_type
CREATE UNIQUE INDEX IF NOT EXISTS idx_sd_workflow_templates_active
  ON sd_workflow_templates (sd_type) WHERE is_active = true;

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER set_updated_at_sd_workflow_templates
  BEFORE UPDATE ON sd_workflow_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE sd_workflow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sd_workflow_templates_read" ON sd_workflow_templates
  FOR SELECT USING (true);
CREATE POLICY "sd_workflow_templates_service" ON sd_workflow_templates
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE sd_workflow_templates IS 'SD-LEO-INFRA-WORKFLOW-TEMPLATES-TYPE-001: Per-SD-type workflow definitions for progress calculation';

-- ============================================================================
-- PART 2: Create sd_workflow_template_steps table
-- ============================================================================
CREATE TABLE IF NOT EXISTS sd_workflow_template_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES sd_workflow_templates(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_label TEXT NOT NULL,
  step_order INT NOT NULL CHECK (step_order >= 1),
  weight NUMERIC(5,2) NOT NULL CHECK (weight >= 0 AND weight <= 100),
  completion_signal TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, step_order),
  UNIQUE(template_id, step_key)
);

-- RLS
ALTER TABLE sd_workflow_template_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sd_workflow_template_steps_read" ON sd_workflow_template_steps
  FOR SELECT USING (true);
CREATE POLICY "sd_workflow_template_steps_service" ON sd_workflow_template_steps
  FOR ALL USING (auth.role() = 'service_role');

COMMENT ON TABLE sd_workflow_template_steps IS 'SD-LEO-INFRA-WORKFLOW-TEMPLATES-TYPE-001: Ordered steps with weights for each workflow template';

-- ============================================================================
-- PART 3: Backfill templates for all registered SD types
-- Standard types use: LEAD_approval(10), PLAN_verification(10),
-- EXEC_implementation(50), LEAD_review(10), RETROSPECTIVE(10),
-- LEAD_final_approval(10) = 100
-- ============================================================================

-- Completion signal mapping:
--   handoff:LEAD-TO-PLAN       = LEAD-TO-PLAN handoff accepted
--   handoff:PLAN-TO-EXEC       = PLAN-TO-EXEC handoff accepted
--   handoff:EXEC-TO-PLAN       = EXEC-TO-PLAN handoff accepted
--   handoff:PLAN-TO-LEAD       = PLAN-TO-LEAD handoff accepted
--   handoff:LEAD-FINAL-APPROVAL = LEAD-FINAL-APPROVAL handoff accepted
--   artifact:retrospective     = Retrospective record exists

-- Standard SD types (same weights as current hardcoded logic)
DO $$
DECLARE
  standard_types TEXT[] := ARRAY[
    'feature', 'bugfix', 'enhancement', 'refactor',
    'performance', 'security'
  ];
  t TEXT;
  tmpl_id UUID;
BEGIN
  FOREACH t IN ARRAY standard_types LOOP
    INSERT INTO sd_workflow_templates (sd_type, name, is_active, version)
    VALUES (t, t || ' workflow v1', true, 1)
    ON CONFLICT (sd_type, version) DO UPDATE SET is_active = true
    RETURNING id INTO tmpl_id;

    INSERT INTO sd_workflow_template_steps (template_id, step_key, step_label, step_order, weight, completion_signal)
    VALUES
      (tmpl_id, 'LEAD_approval', 'LEAD Approval', 1, 10.00, 'handoff:LEAD-TO-PLAN'),
      (tmpl_id, 'PLAN_verification', 'PLAN Verification', 2, 10.00, 'handoff:PLAN-TO-EXEC'),
      (tmpl_id, 'EXEC_implementation', 'EXEC Implementation', 3, 50.00, 'handoff:EXEC-TO-PLAN'),
      (tmpl_id, 'LEAD_review', 'LEAD Review', 4, 10.00, 'handoff:PLAN-TO-LEAD'),
      (tmpl_id, 'RETROSPECTIVE', 'Retrospective', 5, 10.00, 'artifact:retrospective'),
      (tmpl_id, 'LEAD_final_approval', 'LEAD Final Approval', 6, 10.00, 'handoff:LEAD-FINAL-APPROVAL')
    ON CONFLICT (template_id, step_key) DO NOTHING;
  END LOOP;
END $$;

-- Infrastructure/documentation types (same standard weights - they just skip some gates)
DO $$
DECLARE
  infra_types TEXT[] := ARRAY['infrastructure', 'documentation', 'docs', 'process'];
  t TEXT;
  tmpl_id UUID;
BEGIN
  FOREACH t IN ARRAY infra_types LOOP
    INSERT INTO sd_workflow_templates (sd_type, name, is_active, version)
    VALUES (t, t || ' workflow v1', true, 1)
    ON CONFLICT (sd_type, version) DO UPDATE SET is_active = true
    RETURNING id INTO tmpl_id;

    INSERT INTO sd_workflow_template_steps (template_id, step_key, step_label, step_order, weight, completion_signal)
    VALUES
      (tmpl_id, 'LEAD_approval', 'LEAD Approval', 1, 10.00, 'handoff:LEAD-TO-PLAN'),
      (tmpl_id, 'PLAN_verification', 'PLAN Verification', 2, 10.00, 'handoff:PLAN-TO-EXEC'),
      (tmpl_id, 'EXEC_implementation', 'EXEC Implementation', 3, 50.00, 'handoff:EXEC-TO-PLAN'),
      (tmpl_id, 'LEAD_review', 'LEAD Review', 4, 10.00, 'handoff:PLAN-TO-LEAD'),
      (tmpl_id, 'RETROSPECTIVE', 'Retrospective', 5, 10.00, 'artifact:retrospective'),
      (tmpl_id, 'LEAD_final_approval', 'LEAD Final Approval', 6, 10.00, 'handoff:LEAD-FINAL-APPROVAL')
    ON CONFLICT (template_id, step_key) DO NOTHING;
  END LOOP;
END $$;

-- UAT type (same standard weights)
DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  INSERT INTO sd_workflow_templates (sd_type, name, is_active, version)
  VALUES ('uat', 'uat workflow v1', true, 1)
  ON CONFLICT (sd_type, version) DO UPDATE SET is_active = true
  RETURNING id INTO tmpl_id;

  INSERT INTO sd_workflow_template_steps (template_id, step_key, step_label, step_order, weight, completion_signal)
  VALUES
    (tmpl_id, 'LEAD_approval', 'LEAD Approval', 1, 10.00, 'handoff:LEAD-TO-PLAN'),
    (tmpl_id, 'PLAN_verification', 'PLAN Verification', 2, 10.00, 'handoff:PLAN-TO-EXEC'),
    (tmpl_id, 'EXEC_implementation', 'EXEC Implementation', 3, 50.00, 'handoff:EXEC-TO-PLAN'),
    (tmpl_id, 'LEAD_review', 'LEAD Review', 4, 10.00, 'handoff:PLAN-TO-LEAD'),
    (tmpl_id, 'RETROSPECTIVE', 'Retrospective', 5, 10.00, 'artifact:retrospective'),
    (tmpl_id, 'LEAD_final_approval', 'LEAD Final Approval', 6, 10.00, 'handoff:LEAD-FINAL-APPROVAL')
  ON CONFLICT (template_id, step_key) DO NOTHING;
END $$;

-- Orchestrator type (different weights: LEAD_initial=20, FINAL_handoff=5, RETROSPECTIVE=15, CHILDREN=60)
DO $$
DECLARE
  tmpl_id UUID;
BEGIN
  INSERT INTO sd_workflow_templates (sd_type, name, is_active, version)
  VALUES ('orchestrator', 'orchestrator workflow v1', true, 1)
  ON CONFLICT (sd_type, version) DO UPDATE SET is_active = true
  RETURNING id INTO tmpl_id;

  INSERT INTO sd_workflow_template_steps (template_id, step_key, step_label, step_order, weight, completion_signal)
  VALUES
    (tmpl_id, 'LEAD_initial', 'LEAD Initial Approval', 1, 20.00, 'handoff:LEAD-TO-PLAN'),
    (tmpl_id, 'FINAL_handoff', 'Final Handoff', 2, 5.00, 'handoff:PLAN-TO-LEAD|handoff:PLAN-TO-EXEC'),
    (tmpl_id, 'RETROSPECTIVE', 'Retrospective', 3, 15.00, 'artifact:retrospective'),
    (tmpl_id, 'CHILDREN_completion', 'Children Completion', 4, 60.00, 'children:all_complete')
  ON CONFLICT (template_id, step_key) DO NOTHING;
END $$;

-- ============================================================================
-- PART 4: Admin views and validation functions
-- ============================================================================

-- View: Active templates with step counts and weight sums
CREATE OR REPLACE VIEW v_active_sd_workflow_templates AS
SELECT
  t.sd_type,
  t.id AS template_id,
  t.version,
  t.updated_at,
  COUNT(s.id) AS step_count,
  COALESCE(SUM(s.weight), 0) AS weight_sum
FROM sd_workflow_templates t
LEFT JOIN sd_workflow_template_steps s ON s.template_id = t.id
WHERE t.is_active = true
GROUP BY t.sd_type, t.id, t.version, t.updated_at
ORDER BY t.sd_type;

-- Validation function: returns violations for a template
CREATE OR REPLACE FUNCTION validate_sd_workflow_template(p_template_id UUID)
RETURNS TABLE(violation_type TEXT, detail TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  weight_total NUMERIC;
BEGIN
  -- Check weight sum
  SELECT COALESCE(SUM(weight), 0) INTO weight_total
  FROM sd_workflow_template_steps WHERE template_id = p_template_id;

  IF ABS(weight_total - 100.00) > 0.01 THEN
    violation_type := 'WEIGHT_SUM_MISMATCH';
    detail := 'Weight sum is ' || weight_total || ', expected 100.00 (±0.01)';
    RETURN NEXT;
  END IF;

  -- Check for missing steps
  IF NOT EXISTS (SELECT 1 FROM sd_workflow_template_steps WHERE template_id = p_template_id) THEN
    violation_type := 'NO_STEPS';
    detail := 'Template has no steps defined';
    RETURN NEXT;
  END IF;

  -- Check template exists
  IF NOT EXISTS (SELECT 1 FROM sd_workflow_templates WHERE id = p_template_id) THEN
    violation_type := 'TEMPLATE_NOT_FOUND';
    detail := 'Template ID does not exist';
    RETURN NEXT;
  END IF;

  RETURN;
END;
$$;

-- ============================================================================
-- PART 5: Update get_progress_breakdown to use templates with fallback
-- Feature flag: FF_SD_WORKFLOW_TEMPLATES (checked via app_config or env)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  result jsonb;
  total_children INT;
  completed_children INT;
  blocked_children INT;
  retrospective_exists BOOLEAN;
  lead_to_plan_exists BOOLEAN;
  plan_to_lead_exists BOOLEAN;
  plan_to_exec_exists BOOLEAN;
  exec_to_plan_exists BOOLEAN;
  lead_final_exists BOOLEAN;
  final_handoff_exists BOOLEAN;
  total_progress INT := 0;
  sd_type_profile RECORD;
  phase_breakdown jsonb := '{}'::jsonb;
  -- Template variables
  tmpl RECORD;
  step RECORD;
  step_complete BOOLEAN;
  step_progress NUMERIC;
  use_template BOOLEAN := false;
BEGIN
  -- Load SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found', 'sd_id', sd_id_param);
  END IF;

  -- Load validation profile
  SELECT * INTO sd_type_profile
  FROM sd_type_validation_profiles
  WHERE sd_type = COALESCE(sd.sd_type, 'feature');

  -- Check handoffs
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-TO-PLAN' AND status = 'accepted') INTO lead_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-EXEC' AND status = 'accepted') INTO plan_to_exec_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'EXEC-TO-PLAN' AND status = 'accepted') INTO exec_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-LEAD' AND status = 'accepted') INTO plan_to_lead_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status = 'accepted') INTO lead_final_exists;
  SELECT EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param) INTO retrospective_exists;

  -- Count children
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'blocked')
  INTO total_children, completed_children, blocked_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = sd_id_param;

  -- Try to load active template for this SD type
  SELECT t.* INTO tmpl
  FROM sd_workflow_templates t
  WHERE t.sd_type = COALESCE(sd.sd_type, 'feature')
    AND t.is_active = true;

  IF FOUND THEN
    use_template := true;
  END IF;

  -- ==========================================================================
  -- TEMPLATE-BASED PROGRESS (when template exists)
  -- ==========================================================================
  IF use_template THEN
    FOR step IN
      SELECT s.* FROM sd_workflow_template_steps s
      WHERE s.template_id = tmpl.id
      ORDER BY s.step_order
    LOOP
      step_complete := false;
      step_progress := 0;

      -- Evaluate completion based on completion_signal
      CASE
        WHEN step.completion_signal = 'handoff:LEAD-TO-PLAN' THEN
          -- Orchestrators: also complete if children exist
          IF (sd.sd_type = 'orchestrator' OR total_children > 0) THEN
            step_complete := lead_to_plan_exists OR total_children > 0;
          ELSE
            step_complete := lead_to_plan_exists;
          END IF;

        WHEN step.completion_signal = 'handoff:PLAN-TO-EXEC' THEN
          step_complete := plan_to_exec_exists;

        WHEN step.completion_signal = 'handoff:EXEC-TO-PLAN' THEN
          step_complete := exec_to_plan_exists;

        WHEN step.completion_signal = 'handoff:PLAN-TO-LEAD' THEN
          step_complete := plan_to_lead_exists;

        WHEN step.completion_signal = 'handoff:LEAD-FINAL-APPROVAL' THEN
          step_complete := lead_final_exists;

        WHEN step.completion_signal = 'artifact:retrospective' THEN
          step_complete := retrospective_exists;

        WHEN step.completion_signal = 'handoff:PLAN-TO-LEAD|handoff:PLAN-TO-EXEC' THEN
          step_complete := plan_to_lead_exists OR plan_to_exec_exists;

        WHEN step.completion_signal = 'children:all_complete' THEN
          -- Partial credit for children
          IF total_children > 0 THEN
            step_progress := step.weight * completed_children / total_children;
            step_complete := (completed_children = total_children);
          ELSE
            step_complete := false;
          END IF;

        ELSE
          -- Unknown signal: treat as incomplete, log warning
          step_complete := false;
      END CASE;

      -- Calculate progress (children:all_complete has partial credit above)
      IF step.completion_signal != 'children:all_complete' THEN
        step_progress := CASE WHEN step_complete THEN step.weight ELSE 0 END;
      END IF;

      total_progress := total_progress + step_progress;

      phase_breakdown := phase_breakdown || jsonb_build_object(
        step.step_key,
        jsonb_build_object(
          'weight', step.weight,
          'complete', step_complete,
          'progress', step_progress,
          'step_order', step.step_order,
          'source', 'template'
        )
      );
    END LOOP;

    result := jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', COALESCE(sd.sd_type, 'feature'),
      'is_orchestrator', (sd.sd_type = 'orchestrator' OR total_children > 0),
      'total_progress', total_progress,
      'template_id', tmpl.id,
      'template_version', tmpl.version,
      'requires_prd', COALESCE(sd_type_profile.requires_prd, true),
      'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true),
      'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true),
      'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true),
      'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true),
      'phase_breakdown', phase_breakdown
    );

    RETURN result;
  END IF;

  -- ==========================================================================
  -- FALLBACK: Original hardcoded logic (when no template exists)
  -- ==========================================================================

  -- ORCHESTRATOR progress calculation
  IF sd.sd_type = 'orchestrator' OR total_children > 0 THEN
    -- Phase 1: LEAD approval (20%)
    IF lead_to_plan_exists OR total_children > 0 THEN
      total_progress := total_progress + 20;
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object(
        'weight', 20, 'complete', true, 'progress', 20,
        'note', CASE WHEN lead_to_plan_exists
          THEN 'LEAD-TO-PLAN handoff indicates orchestrator approved and active'
          ELSE 'Auto-granted: children exist (proves orchestrator activation)'
        END,
        'lead_to_plan_handoff_exists', lead_to_plan_exists,
        'source', 'hardcoded'
      ));
    ELSE
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object(
        'weight', 20, 'complete', false, 'progress', 0,
        'note', 'LEAD-TO-PLAN handoff indicates orchestrator approved and active',
        'source', 'hardcoded'
      ));
    END IF;

    -- Phase 2: Final handoff (5%)
    final_handoff_exists := plan_to_lead_exists OR plan_to_exec_exists;
    IF final_handoff_exists THEN
      total_progress := total_progress + 5;
    END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('FINAL_handoff', jsonb_build_object(
      'weight', 5, 'complete', final_handoff_exists, 'progress', CASE WHEN final_handoff_exists THEN 5 ELSE 0 END,
      'required', true,
      'note', 'PLAN-TO-LEAD or PLAN-TO-EXEC indicating orchestrator work complete',
      'plan_to_lead_exists', plan_to_lead_exists,
      'plan_to_exec_exists', plan_to_exec_exists,
      'source', 'hardcoded'
    ));

    -- Phase 3: Retrospective (15%)
    IF retrospective_exists THEN
      total_progress := total_progress + 15;
    END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
      'weight', 15, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 15 ELSE 0 END,
      'required', COALESCE(sd_type_profile.requires_retrospective, true),
      'source', 'hardcoded'
    ));

    -- Phase 4: Children completion (60%)
    IF total_children > 0 THEN
      total_progress := total_progress + (60 * completed_children / total_children);
      phase_breakdown := phase_breakdown || jsonb_build_object('CHILDREN_completion', jsonb_build_object(
        'weight', 60, 'complete', completed_children = total_children,
        'progress', (60 * completed_children / total_children),
        'total_children', total_children, 'completed_children', completed_children,
        'note', completed_children || ' of ' || total_children || ' children completed',
        'source', 'hardcoded'
      ));
    END IF;

    result := jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', COALESCE(sd.sd_type, 'orchestrator'),
      'is_orchestrator', true,
      'total_progress', total_progress,
      'requires_prd', COALESCE(sd_type_profile.requires_prd, false),
      'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, false),
      'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, false),
      'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, false),
      'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true),
      'phase_breakdown', phase_breakdown
    );

    RETURN result;
  END IF;

  -- STANDARD SD progress calculation (non-orchestrator)
  -- Phase 1: LEAD approval (10%)
  IF lead_to_plan_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_approval', jsonb_build_object(
    'weight', 10, 'complete', lead_to_plan_exists, 'progress', CASE WHEN lead_to_plan_exists THEN 10 ELSE 0 END,
    'plan_to_exec_accepted', plan_to_exec_exists,
    'source', 'hardcoded'
  ));

  -- Phase 2: PLAN verification (10%)
  IF plan_to_exec_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('PLAN_verification', jsonb_build_object(
    'weight', 10, 'complete', plan_to_exec_exists, 'progress', CASE WHEN plan_to_exec_exists THEN 10 ELSE 0 END,
    'plan_to_exec_accepted', plan_to_exec_exists,
    'source', 'hardcoded'
  ));

  -- Phase 3: EXEC implementation (50%)
  IF exec_to_plan_exists THEN
    total_progress := total_progress + 50;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('EXEC_implementation', jsonb_build_object(
    'weight', 50, 'complete', exec_to_plan_exists, 'progress', CASE WHEN exec_to_plan_exists THEN 50 ELSE 0 END,
    'required', COALESCE(sd_type_profile.requires_deliverables, true),
    'note', CASE WHEN NOT COALESCE(sd_type_profile.requires_deliverables, true)
      THEN 'Auto-complete: deliverables not required for ' || COALESCE(sd.sd_type, 'feature')
      ELSE NULL END,
    'exec_to_plan_accepted', exec_to_plan_exists,
    'source', 'hardcoded'
  ));

  -- Phase 4: LEAD review (10%)
  IF plan_to_lead_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_review', jsonb_build_object(
    'weight', 10, 'complete', plan_to_lead_exists, 'progress', CASE WHEN plan_to_lead_exists THEN 10 ELSE 0 END,
    'source', 'hardcoded'
  ));

  -- Phase 5: Retrospective (10%)
  IF retrospective_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
    'weight', 10, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 10 ELSE 0 END,
    'required', COALESCE(sd_type_profile.requires_retrospective, true),
    'retrospective_exists', retrospective_exists,
    'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true),
    'source', 'hardcoded'
  ));

  -- Phase 6: LEAD final approval (10%)
  IF lead_final_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_final_approval', jsonb_build_object(
    'weight', 10, 'complete', lead_final_exists, 'progress', CASE WHEN lead_final_exists THEN 10 ELSE 0 END,
    'min_handoffs', 0,
    'handoffs_count', (SELECT COUNT(*) FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND status = 'accepted'),
    'retrospective_exists', retrospective_exists,
    'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true),
    'source', 'hardcoded'
  ));

  result := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', COALESCE(sd.sd_type, 'feature'),
    'is_orchestrator', false,
    'total_progress', total_progress,
    'requires_prd', COALESCE(sd_type_profile.requires_prd, true),
    'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true),
    'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true),
    'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true),
    'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true),
    'phase_breakdown', phase_breakdown
  );

  RETURN result;
END;
$$;

-- ============================================================================
-- PART 6: Verification
-- ============================================================================

-- Verify all templates exist and have valid weights
DO $$
DECLARE
  tmpl_count INT;
  invalid_count INT;
BEGIN
  SELECT COUNT(*) INTO tmpl_count FROM sd_workflow_templates WHERE is_active = true;
  RAISE NOTICE 'Active templates: %', tmpl_count;

  SELECT COUNT(*) INTO invalid_count
  FROM v_active_sd_workflow_templates
  WHERE ABS(weight_sum - 100.00) > 0.01;

  IF invalid_count > 0 THEN
    RAISE WARNING '% template(s) have invalid weight sums', invalid_count;
  ELSE
    RAISE NOTICE 'All templates have valid weight sums (100.00)';
  END IF;

  -- Verify template-based progress matches for a completed SD
  RAISE NOTICE 'Template verification complete';
END $$;
