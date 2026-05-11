-- Migration: get_progress_breakdown LHE-pending-aware (PR-A FR-3)
-- Date: 2026-05-11
-- SD: SD-FDBK-INFRA-REFACTOR-LEADFINALAPPROVALEXECUTOR-LHE-001
-- Closes feedback: 7260707e-72b9-4bbe-b4d7-020846d51922
-- Closes pattern: PAT-GHOST-COMPLETION-PARTIAL-REVERT-001 (source-fix layer)
--
-- Purpose:
--   Extend the LHE existence check in get_progress_breakdown to count BOTH
--   status='pending_acceptance' AND status='accepted' for LEAD-FINAL-APPROVAL.
--   This preserves the chicken-and-egg unblock for the progress-enforcement
--   trigger when LeadFinalApprovalExecutor pre-inserts a pending row (FR-1)
--   that HandoffRecorder later flips to accepted (FR-2).
--
--   Also adds:
--     (FR-2b) Partial UNIQUE INDEX on (sd_id, handoff_type) WHERE status='pending_acceptance'
--             to prevent two parallel sessions from inserting two pending pre-insert rows.
--     (FR-9 helper) RPC lhe_pending_migration_applied() — returns true when this
--             migration's function body is live; used by checkProgressBreakdownLheReady()
--             in pending-migrations-check.js to gate flag-ON pre-insert.
--     NOTIFY pgrst, 'reload schema' — invalidate PostgREST cache after function replace.
--
-- Backward compat:
--   UNION ALL extension to include 'pending_acceptance' is a strict SUPERSET. Existing
--   callers see TRUE for lead_final_exists in both old and new code paths once the row
--   is accepted. Brief pending window is intentional (chicken-and-egg unblock).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + CREATE UNIQUE INDEX IF NOT EXISTS.
-- Both overloads (text, uuid) updated per database-agent W1.

BEGIN;

-- ============================================================================
-- PART 1: get_progress_breakdown(UUID) — UUID overload
-- Source: predecessor at 20260213_fix_reduced_workflow_exec_progress.sql:54-404
-- Change: LHE branch in lines 102-109 now matches status IN ('pending_acceptance', 'accepted').
-- ============================================================================
CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param UUID)
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
  tmpl RECORD;
  step RECORD;
  step_complete BOOLEAN;
  step_progress NUMERIC;
  use_template BOOLEAN := false;
  signal_part TEXT;
  signal_parts TEXT[];
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found', 'sd_id', sd_id_param);
  END IF;

  SELECT * INTO sd_type_profile FROM sd_type_validation_profiles WHERE sd_type = COALESCE(sd.sd_type, 'feature');

  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-TO-PLAN' AND status = 'accepted') INTO lead_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-EXEC' AND status = 'accepted') INTO plan_to_exec_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'EXEC-TO-PLAN' AND status = 'accepted') INTO exec_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-LEAD' AND status = 'accepted') INTO plan_to_lead_exists;

  -- SD-FDBK-INFRA-REFACTOR-LEADFINALAPPROVALEXECUTOR-LHE-001 FR-3:
  -- LHE branch extended to count BOTH 'pending_acceptance' (transient pre-insert state)
  -- AND 'accepted' (post-HandoffRecorder finalization). SPH branch keeps 'accepted' only
  -- because HandoffRecorder writes rejected SPH rows for LEAD-FINAL-APPROVAL too
  -- (database-agent live query: 1267 such rows since 2026-02-14).
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status = 'accepted'
    UNION ALL
    SELECT 1 FROM leo_handoff_executions
    WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status IN ('pending_acceptance', 'accepted')
  ) INTO lead_final_exists;

  SELECT EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param) INTO retrospective_exists;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed'), COUNT(*) FILTER (WHERE status = 'blocked')
  INTO total_children, completed_children, blocked_children
  FROM strategic_directives_v2 WHERE parent_sd_id = sd_id_param;

  SELECT t.* INTO tmpl FROM sd_workflow_templates t WHERE t.sd_type = COALESCE(sd.sd_type, 'feature') AND t.is_active = true;
  IF FOUND THEN use_template := true; END IF;

  IF use_template THEN
    FOR step IN SELECT s.* FROM sd_workflow_template_steps s WHERE s.template_id = tmpl.id ORDER BY s.step_order LOOP
      step_complete := false; step_progress := 0;
      CASE
        WHEN step.completion_signal = 'handoff:LEAD-TO-PLAN' THEN
          IF (sd.sd_type = 'orchestrator' OR total_children > 0) THEN step_complete := lead_to_plan_exists OR total_children > 0;
          ELSE step_complete := lead_to_plan_exists; END IF;
        WHEN step.completion_signal = 'handoff:PLAN-TO-EXEC' THEN step_complete := plan_to_exec_exists;
        WHEN step.completion_signal = 'handoff:EXEC-TO-PLAN' THEN step_complete := exec_to_plan_exists;
        WHEN step.completion_signal = 'handoff:PLAN-TO-LEAD' THEN step_complete := plan_to_lead_exists;
        WHEN step.completion_signal = 'handoff:LEAD-FINAL-APPROVAL' THEN step_complete := lead_final_exists;
        WHEN step.completion_signal = 'artifact:retrospective' THEN step_complete := retrospective_exists;
        WHEN step.completion_signal = 'children:all_complete' THEN
          IF total_children > 0 THEN step_progress := step.weight * completed_children / total_children; step_complete := (completed_children = total_children);
          ELSE step_complete := false; END IF;
        ELSE
          IF position('|' in step.completion_signal) > 0 THEN
            signal_parts := string_to_array(step.completion_signal, '|'); step_complete := false;
            FOREACH signal_part IN ARRAY signal_parts LOOP
              CASE signal_part
                WHEN 'handoff:LEAD-TO-PLAN' THEN IF lead_to_plan_exists THEN step_complete := true; END IF;
                WHEN 'handoff:PLAN-TO-EXEC' THEN IF plan_to_exec_exists THEN step_complete := true; END IF;
                WHEN 'handoff:EXEC-TO-PLAN' THEN IF exec_to_plan_exists THEN step_complete := true; END IF;
                WHEN 'handoff:PLAN-TO-LEAD' THEN IF plan_to_lead_exists THEN step_complete := true; END IF;
                WHEN 'handoff:LEAD-FINAL-APPROVAL' THEN IF lead_final_exists THEN step_complete := true; END IF;
                WHEN 'artifact:retrospective' THEN IF retrospective_exists THEN step_complete := true; END IF;
                ELSE NULL;
              END CASE;
            END LOOP;
          ELSE step_complete := false;
          END IF;
      END CASE;
      IF step.completion_signal != 'children:all_complete' THEN step_progress := CASE WHEN step_complete THEN step.weight ELSE 0 END; END IF;
      total_progress := total_progress + step_progress;
      phase_breakdown := phase_breakdown || jsonb_build_object(step.step_key, jsonb_build_object('weight', step.weight, 'complete', step_complete, 'progress', step_progress, 'step_order', step.step_order, 'source', 'template'));
    END LOOP;
    result := jsonb_build_object('sd_id', sd_id_param, 'sd_type', COALESCE(sd.sd_type, 'feature'), 'is_orchestrator', (sd.sd_type = 'orchestrator' OR total_children > 0), 'total_progress', total_progress, 'template_id', tmpl.id, 'template_version', tmpl.version, 'requires_prd', COALESCE(sd_type_profile.requires_prd, true), 'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true), 'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true), 'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true), 'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true), 'phase_breakdown', phase_breakdown);
    RETURN result;
  END IF;

  -- ORCHESTRATOR progress
  IF sd.sd_type = 'orchestrator' OR total_children > 0 THEN
    IF lead_to_plan_exists OR total_children > 0 THEN
      total_progress := total_progress + 20;
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object('weight', 20, 'complete', true, 'progress', 20, 'note', CASE WHEN lead_to_plan_exists THEN 'LEAD-TO-PLAN handoff indicates orchestrator approved and active' ELSE 'Auto-granted: children exist (proves orchestrator activation)' END, 'lead_to_plan_handoff_exists', lead_to_plan_exists, 'source', 'hardcoded'));
    ELSE
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object('weight', 20, 'complete', false, 'progress', 0, 'note', 'LEAD-TO-PLAN handoff indicates orchestrator approved and active', 'source', 'hardcoded'));
    END IF;
    final_handoff_exists := plan_to_lead_exists OR plan_to_exec_exists;
    IF final_handoff_exists THEN total_progress := total_progress + 5; END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('FINAL_handoff', jsonb_build_object('weight', 5, 'complete', final_handoff_exists, 'progress', CASE WHEN final_handoff_exists THEN 5 ELSE 0 END, 'required', true, 'note', 'PLAN-TO-LEAD or PLAN-TO-EXEC indicating orchestrator work complete', 'plan_to_lead_exists', plan_to_lead_exists, 'plan_to_exec_exists', plan_to_exec_exists, 'source', 'hardcoded'));
    IF retrospective_exists THEN total_progress := total_progress + 15; END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object('weight', 15, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 15 ELSE 0 END, 'required', COALESCE(sd_type_profile.requires_retrospective, true), 'source', 'hardcoded'));
    IF total_children > 0 THEN
      total_progress := total_progress + (60 * completed_children / total_children);
      phase_breakdown := phase_breakdown || jsonb_build_object('CHILDREN_completion', jsonb_build_object('weight', 60, 'complete', completed_children = total_children, 'progress', (60 * completed_children / total_children), 'total_children', total_children, 'completed_children', completed_children, 'note', completed_children || ' of ' || total_children || ' children completed', 'source', 'hardcoded'));
    END IF;
    result := jsonb_build_object('sd_id', sd_id_param, 'sd_type', COALESCE(sd.sd_type, 'orchestrator'), 'is_orchestrator', true, 'total_progress', total_progress, 'requires_prd', COALESCE(sd_type_profile.requires_prd, false), 'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, false), 'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, false), 'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, false), 'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true), 'phase_breakdown', phase_breakdown);
    RETURN result;
  END IF;

  -- STANDARD SD progress
  IF lead_to_plan_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_approval', jsonb_build_object('weight', 10, 'complete', lead_to_plan_exists, 'progress', CASE WHEN lead_to_plan_exists THEN 10 ELSE 0 END, 'plan_to_exec_accepted', plan_to_exec_exists, 'source', 'hardcoded'));
  IF plan_to_exec_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('PLAN_verification', jsonb_build_object('weight', 10, 'complete', plan_to_exec_exists, 'progress', CASE WHEN plan_to_exec_exists THEN 10 ELSE 0 END, 'plan_to_exec_accepted', plan_to_exec_exists, 'source', 'hardcoded'));
  IF exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists) THEN total_progress := total_progress + 50; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('EXEC_implementation', jsonb_build_object('weight', 50, 'complete', exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists), 'progress', CASE WHEN exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists) THEN 50 ELSE 0 END, 'required', COALESCE(sd_type_profile.requires_deliverables, true), 'note', CASE WHEN NOT COALESCE(sd_type_profile.requires_deliverables, true) THEN 'Auto-complete: deliverables not required for ' || COALESCE(sd.sd_type, 'feature') ELSE NULL END, 'exec_to_plan_accepted', exec_to_plan_exists, 'plan_to_lead_accepted', plan_to_lead_exists, 'source', 'hardcoded'));
  IF plan_to_lead_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_review', jsonb_build_object('weight', 10, 'complete', plan_to_lead_exists, 'progress', CASE WHEN plan_to_lead_exists THEN 10 ELSE 0 END, 'source', 'hardcoded'));
  IF retrospective_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object('weight', 10, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 10 ELSE 0 END, 'required', COALESCE(sd_type_profile.requires_retrospective, true), 'retrospective_exists', retrospective_exists, 'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true), 'source', 'hardcoded'));
  IF lead_final_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_final_approval', jsonb_build_object('weight', 10, 'complete', lead_final_exists, 'progress', CASE WHEN lead_final_exists THEN 10 ELSE 0 END, 'min_handoffs', 0, 'handoffs_count', (SELECT COUNT(*) FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND status = 'accepted'), 'retrospective_exists', retrospective_exists, 'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true), 'source', 'hardcoded'));
  result := jsonb_build_object('sd_id', sd_id_param, 'sd_type', COALESCE(sd.sd_type, 'feature'), 'is_orchestrator', false, 'total_progress', total_progress, 'requires_prd', COALESCE(sd_type_profile.requires_prd, true), 'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true), 'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true), 'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true), 'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true), 'phase_breakdown', phase_breakdown);
  RETURN result;
END;
$$;

-- ============================================================================
-- PART 2: get_progress_breakdown(TEXT) — TEXT overload
-- Source: predecessor at 20260213_fix_reduced_workflow_exec_progress.sql:411-757
-- Same body as UUID overload (just parameter type difference + <> vs != synonym).
-- ============================================================================
CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
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
  tmpl RECORD;
  step RECORD;
  step_complete BOOLEAN;
  step_progress NUMERIC;
  use_template BOOLEAN := false;
  signal_part TEXT;
  signal_parts TEXT[];
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found', 'sd_id', sd_id_param);
  END IF;

  SELECT * INTO sd_type_profile FROM sd_type_validation_profiles WHERE sd_type = COALESCE(sd.sd_type, 'feature');

  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-TO-PLAN' AND status = 'accepted') INTO lead_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-EXEC' AND status = 'accepted') INTO plan_to_exec_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'EXEC-TO-PLAN' AND status = 'accepted') INTO exec_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-LEAD' AND status = 'accepted') INTO plan_to_lead_exists;

  -- SD-FDBK-INFRA-REFACTOR-LEADFINALAPPROVALEXECUTOR-LHE-001 FR-3:
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status = 'accepted'
    UNION ALL
    SELECT 1 FROM leo_handoff_executions
    WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status IN ('pending_acceptance', 'accepted')
  ) INTO lead_final_exists;

  SELECT EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param) INTO retrospective_exists;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed'), COUNT(*) FILTER (WHERE status = 'blocked')
  INTO total_children, completed_children, blocked_children
  FROM strategic_directives_v2 WHERE parent_sd_id = sd_id_param;

  SELECT t.* INTO tmpl FROM sd_workflow_templates t WHERE t.sd_type = COALESCE(sd.sd_type, 'feature') AND t.is_active = true;
  IF FOUND THEN use_template := true; END IF;

  IF use_template THEN
    FOR step IN SELECT s.* FROM sd_workflow_template_steps s WHERE s.template_id = tmpl.id ORDER BY s.step_order LOOP
      step_complete := false; step_progress := 0;
      CASE
        WHEN step.completion_signal = 'handoff:LEAD-TO-PLAN' THEN
          IF (sd.sd_type = 'orchestrator' OR total_children > 0) THEN step_complete := lead_to_plan_exists OR total_children > 0;
          ELSE step_complete := lead_to_plan_exists; END IF;
        WHEN step.completion_signal = 'handoff:PLAN-TO-EXEC' THEN step_complete := plan_to_exec_exists;
        WHEN step.completion_signal = 'handoff:EXEC-TO-PLAN' THEN step_complete := exec_to_plan_exists;
        WHEN step.completion_signal = 'handoff:PLAN-TO-LEAD' THEN step_complete := plan_to_lead_exists;
        WHEN step.completion_signal = 'handoff:LEAD-FINAL-APPROVAL' THEN step_complete := lead_final_exists;
        WHEN step.completion_signal = 'artifact:retrospective' THEN step_complete := retrospective_exists;
        WHEN step.completion_signal = 'children:all_complete' THEN
          IF total_children > 0 THEN step_progress := step.weight * completed_children / total_children; step_complete := (completed_children = total_children);
          ELSE step_complete := false; END IF;
        ELSE
          IF position('|' in step.completion_signal) > 0 THEN
            signal_parts := string_to_array(step.completion_signal, '|'); step_complete := false;
            FOREACH signal_part IN ARRAY signal_parts LOOP
              CASE signal_part
                WHEN 'handoff:LEAD-TO-PLAN' THEN IF lead_to_plan_exists THEN step_complete := true; END IF;
                WHEN 'handoff:PLAN-TO-EXEC' THEN IF plan_to_exec_exists THEN step_complete := true; END IF;
                WHEN 'handoff:EXEC-TO-PLAN' THEN IF exec_to_plan_exists THEN step_complete := true; END IF;
                WHEN 'handoff:PLAN-TO-LEAD' THEN IF plan_to_lead_exists THEN step_complete := true; END IF;
                WHEN 'handoff:LEAD-FINAL-APPROVAL' THEN IF lead_final_exists THEN step_complete := true; END IF;
                WHEN 'artifact:retrospective' THEN IF retrospective_exists THEN step_complete := true; END IF;
                ELSE NULL;
              END CASE;
            END LOOP;
          ELSE step_complete := false;
          END IF;
      END CASE;
      IF step.completion_signal <> 'children:all_complete' THEN step_progress := CASE WHEN step_complete THEN step.weight ELSE 0 END; END IF;
      total_progress := total_progress + step_progress;
      phase_breakdown := phase_breakdown || jsonb_build_object(step.step_key, jsonb_build_object('weight', step.weight, 'complete', step_complete, 'progress', step_progress, 'step_order', step.step_order, 'source', 'template'));
    END LOOP;
    result := jsonb_build_object('sd_id', sd_id_param, 'sd_type', COALESCE(sd.sd_type, 'feature'), 'is_orchestrator', (sd.sd_type = 'orchestrator' OR total_children > 0), 'total_progress', total_progress, 'template_id', tmpl.id, 'template_version', tmpl.version, 'requires_prd', COALESCE(sd_type_profile.requires_prd, true), 'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true), 'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true), 'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true), 'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true), 'phase_breakdown', phase_breakdown);
    RETURN result;
  END IF;

  IF sd.sd_type = 'orchestrator' OR total_children > 0 THEN
    IF lead_to_plan_exists OR total_children > 0 THEN
      total_progress := total_progress + 20;
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object('weight', 20, 'complete', true, 'progress', 20, 'note', CASE WHEN lead_to_plan_exists THEN 'LEAD-TO-PLAN handoff indicates orchestrator approved and active' ELSE 'Auto-granted: children exist (proves orchestrator activation)' END, 'lead_to_plan_handoff_exists', lead_to_plan_exists, 'source', 'hardcoded'));
    ELSE
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object('weight', 20, 'complete', false, 'progress', 0, 'note', 'LEAD-TO-PLAN handoff indicates orchestrator approved and active', 'source', 'hardcoded'));
    END IF;
    final_handoff_exists := plan_to_lead_exists OR plan_to_exec_exists;
    IF final_handoff_exists THEN total_progress := total_progress + 5; END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('FINAL_handoff', jsonb_build_object('weight', 5, 'complete', final_handoff_exists, 'progress', CASE WHEN final_handoff_exists THEN 5 ELSE 0 END, 'required', true, 'note', 'PLAN-TO-LEAD or PLAN-TO-EXEC indicating orchestrator work complete', 'plan_to_lead_exists', plan_to_lead_exists, 'plan_to_exec_exists', plan_to_exec_exists, 'source', 'hardcoded'));
    IF retrospective_exists THEN total_progress := total_progress + 15; END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object('weight', 15, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 15 ELSE 0 END, 'required', COALESCE(sd_type_profile.requires_retrospective, true), 'source', 'hardcoded'));
    IF total_children > 0 THEN
      total_progress := total_progress + (60 * completed_children / total_children);
      phase_breakdown := phase_breakdown || jsonb_build_object('CHILDREN_completion', jsonb_build_object('weight', 60, 'complete', completed_children = total_children, 'progress', (60 * completed_children / total_children), 'total_children', total_children, 'completed_children', completed_children, 'note', completed_children || ' of ' || total_children || ' children completed', 'source', 'hardcoded'));
    END IF;
    result := jsonb_build_object('sd_id', sd_id_param, 'sd_type', COALESCE(sd.sd_type, 'orchestrator'), 'is_orchestrator', true, 'total_progress', total_progress, 'requires_prd', COALESCE(sd_type_profile.requires_prd, false), 'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, false), 'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, false), 'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, false), 'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true), 'phase_breakdown', phase_breakdown);
    RETURN result;
  END IF;

  IF lead_to_plan_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_approval', jsonb_build_object('weight', 10, 'complete', lead_to_plan_exists, 'progress', CASE WHEN lead_to_plan_exists THEN 10 ELSE 0 END, 'plan_to_exec_accepted', plan_to_exec_exists, 'source', 'hardcoded'));
  IF plan_to_exec_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('PLAN_verification', jsonb_build_object('weight', 10, 'complete', plan_to_exec_exists, 'progress', CASE WHEN plan_to_exec_exists THEN 10 ELSE 0 END, 'plan_to_exec_accepted', plan_to_exec_exists, 'source', 'hardcoded'));
  IF exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists) THEN total_progress := total_progress + 50; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('EXEC_implementation', jsonb_build_object('weight', 50, 'complete', exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists), 'progress', CASE WHEN exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists) THEN 50 ELSE 0 END, 'required', COALESCE(sd_type_profile.requires_deliverables, true), 'note', CASE WHEN NOT COALESCE(sd_type_profile.requires_deliverables, true) THEN 'Auto-complete: deliverables not required for ' || COALESCE(sd.sd_type, 'feature') ELSE NULL END, 'exec_to_plan_accepted', exec_to_plan_exists, 'plan_to_lead_accepted', plan_to_lead_exists, 'source', 'hardcoded'));
  IF plan_to_lead_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_review', jsonb_build_object('weight', 10, 'complete', plan_to_lead_exists, 'progress', CASE WHEN plan_to_lead_exists THEN 10 ELSE 0 END, 'source', 'hardcoded'));
  IF retrospective_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object('weight', 10, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 10 ELSE 0 END, 'required', COALESCE(sd_type_profile.requires_retrospective, true), 'retrospective_exists', retrospective_exists, 'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true), 'source', 'hardcoded'));
  IF lead_final_exists THEN total_progress := total_progress + 10; END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_final_approval', jsonb_build_object('weight', 10, 'complete', lead_final_exists, 'progress', CASE WHEN lead_final_exists THEN 10 ELSE 0 END, 'min_handoffs', 0, 'handoffs_count', (SELECT COUNT(*) FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND status = 'accepted'), 'retrospective_exists', retrospective_exists, 'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true), 'source', 'hardcoded'));
  result := jsonb_build_object('sd_id', sd_id_param, 'sd_type', COALESCE(sd.sd_type, 'feature'), 'is_orchestrator', false, 'total_progress', total_progress, 'requires_prd', COALESCE(sd_type_profile.requires_prd, true), 'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true), 'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true), 'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true), 'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true), 'phase_breakdown', phase_breakdown);
  RETURN result;
END;
$func$;

-- ============================================================================
-- PART 3: Partial UNIQUE INDEX for FR-2b (TOCTOU prevention)
-- Prevents two parallel sessions from inserting two pending_acceptance pre-insert rows
-- for the same (sd_id, handoff_type='LEAD-FINAL-APPROVAL'). Scoped by partial WHERE so
-- it does NOT prevent multiple 'accepted' rows (preserves legacy behavior).
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_lhe_lfa_pending_unique
  ON leo_handoff_executions (sd_id, handoff_type)
  WHERE status = 'pending_acceptance' AND handoff_type = 'LEAD-FINAL-APPROVAL';

-- ============================================================================
-- PART 4: RPC for FR-9 deploy-lag check
-- Returns true when this migration's function-body changes are live in the DB.
-- The check verifies that the new UNION-ALL clause containing 'pending_acceptance' is
-- present in the function source. checkProgressBreakdownLheReady() in
-- pending-migrations-check.js calls this RPC; non-existence (PGRST 42883) signals
-- "migration not applied" → graceful-degrade to legacy 'accepted' pre-insert.
-- ============================================================================
CREATE OR REPLACE FUNCTION lhe_pending_migration_applied()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_get_functiondef('get_progress_breakdown(text)'::regprocedure)
         LIKE '%status IN (''pending_acceptance'', ''accepted'')%'
$$;

-- ============================================================================
-- PART 5: PostgREST schema-cache reload (database-agent W2)
-- Without NOTIFY, RPC callers may serve stale function metadata for hours.
-- ============================================================================
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================================
-- Verification (post-COMMIT diagnostic; safe to re-run)
-- ============================================================================
DO $$
DECLARE
  uuid_def TEXT;
  text_def TEXT;
  uuid_ok BOOLEAN;
  text_ok BOOLEAN;
  rpc_result BOOLEAN;
BEGIN
  uuid_def := pg_get_functiondef('get_progress_breakdown(uuid)'::regprocedure);
  text_def := pg_get_functiondef('get_progress_breakdown(text)'::regprocedure);
  uuid_ok := uuid_def LIKE '%status IN (''pending_acceptance'', ''accepted'')%';
  text_ok := text_def LIKE '%status IN (''pending_acceptance'', ''accepted'')%';
  rpc_result := lhe_pending_migration_applied();
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Migration 20260511_progress_breakdown_lhe_pending_aware verification:';
  RAISE NOTICE '  uuid overload extended: %', uuid_ok;
  RAISE NOTICE '  text overload extended: %', text_ok;
  RAISE NOTICE '  lhe_pending_migration_applied() returns: %', rpc_result;
  IF NOT uuid_ok OR NOT text_ok OR NOT rpc_result THEN
    RAISE WARNING 'Migration verification FAILED — review function bodies';
  END IF;
  RAISE NOTICE '============================================================';
END $$;
