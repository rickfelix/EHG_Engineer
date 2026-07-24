-- =============================================================================
-- Migration: get_progress_breakdown() -- treat 'deferred' as a terminal child status
-- QF-20260724-212 (companion to QF-20260724-703, PR #6419)
-- Date: 2026-07-24
--
-- Context: QF-20260724-703 fixed the JS-side PLAN-TO-LEAD prerequisite-check gate
-- (terminalStatuses at prerequisite-check.js:211) to treat 'deferred' as terminal,
-- matching the existing CHILD_SCOPE_COVERAGE gate pattern (deferred == not blocking).
-- This is the SECOND instance of the same class bug: get_progress_breakdown()'s
-- COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled')) omits 'deferred', so
-- an orchestrator parent whose children are (completed + deferred) passes PLAN-TO-LEAD
-- at 100% (JS-side, now fixed) but RE-BLOCKS at LEAD-FINAL-APPROVAL when this distinct
-- SQL function recomputes progress and treats the deferred child as still-incomplete.
-- Currently blocking SD-LEO-INFRA-DRAIN-SET-REGISTRY-001 (children B/C/D completed +
-- E deferred). RCA: Golf-2 session 9398a265, harness-bug id=25a2a7bd.
--
-- Canonical fix, no bypass: add 'deferred' to the terminal set alongside
-- completed/cancelled in BOTH get_progress_breakdown() overloads (text, uuid) --
-- CREATE OR REPLACE requires the full function body; everything below is otherwise
-- byte-identical to database/migrations/20260711_orchestrator_terminal_status_sql_parity.sql.
-- =============================================================================

-- (a) get_progress_breakdown(text)
CREATE OR REPLACE FUNCTION public.get_progress_breakdown(sd_id_param text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sd RECORD;
  result jsonb;
  total_children INT;
  completed_children INT;
  blocked_children INT;
  cancelled_children INT;
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

  -- QF-20260724-212: 'deferred' is a terminal disposition too, same as completed/cancelled
  -- (mirrors QF-20260724-703's JS-side fix + the CHILD_SCOPE_COVERAGE gate pattern).
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled', 'deferred')), COUNT(*) FILTER (WHERE status = 'blocked'), COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO total_children, completed_children, blocked_children, cancelled_children
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
      -- 'complete'/'progress' correctly weight a cancelled/deferred child the same as
      -- completed (all terminal, none block orchestrator progression).
      -- 'note' is kept honest about the split (adversarial round-3 CRITICAL: this field
      -- previously called cancelled children "completed" verbatim, the same
      -- false-provenance class fixed in complete_orchestrator_sd in round 2 but missed
      -- here since this function's numeric weight itself needed no behavior change).
      phase_breakdown := phase_breakdown || jsonb_build_object('CHILDREN_completion', jsonb_build_object('weight', 60, 'complete', completed_children = total_children, 'progress', (60 * completed_children / total_children), 'total_children', total_children, 'completed_children', completed_children - cancelled_children, 'cancelled_children', cancelled_children, 'note', CASE WHEN cancelled_children = 0 THEN completed_children || ' of ' || total_children || ' children completed' ELSE (completed_children - cancelled_children) || ' of ' || total_children || ' children completed, ' || cancelled_children || ' cancelled' END, 'source', 'hardcoded'));
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
$function$
;

-- (b) get_progress_breakdown(uuid) -- second overload, identical structure + comments preserved.
CREATE OR REPLACE FUNCTION public.get_progress_breakdown(sd_id_param uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sd RECORD;
  result jsonb;
  total_children INT;
  completed_children INT;
  blocked_children INT;
  cancelled_children INT;
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

  -- QF-20260724-212: 'deferred' is a terminal disposition too, same as completed/cancelled
  -- (mirrors QF-20260724-703's JS-side fix + the CHILD_SCOPE_COVERAGE gate pattern).
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled', 'deferred')), COUNT(*) FILTER (WHERE status = 'blocked'), COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO total_children, completed_children, blocked_children, cancelled_children
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
      -- 'complete'/'progress' correctly weight a cancelled/deferred child the same as
      -- completed (all terminal, none block orchestrator progression).
      -- 'note' is kept honest about the split (adversarial round-3 CRITICAL: this field
      -- previously called cancelled children "completed" verbatim, the same
      -- false-provenance class fixed in complete_orchestrator_sd in round 2 but missed
      -- here since this function's numeric weight itself needed no behavior change).
      phase_breakdown := phase_breakdown || jsonb_build_object('CHILDREN_completion', jsonb_build_object('weight', 60, 'complete', completed_children = total_children, 'progress', (60 * completed_children / total_children), 'total_children', total_children, 'completed_children', completed_children - cancelled_children, 'cancelled_children', cancelled_children, 'note', CASE WHEN cancelled_children = 0 THEN completed_children || ' of ' || total_children || ' children completed' ELSE (completed_children - cancelled_children) || ' of ' || total_children || ' children completed, ' || cancelled_children || ' cancelled' END, 'source', 'hardcoded'));
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
$function$
;

-- Verify both overloads picked up the fix.
DO $verify$
DECLARE
  v_def_text TEXT;
  v_def_uuid TEXT;
BEGIN
  v_def_text := pg_get_functiondef('public.get_progress_breakdown(text)'::regprocedure);
  ASSERT v_def_text LIKE '%''completed'', ''cancelled'', ''deferred''%', 'get_progress_breakdown(text): deferred not added to terminal filter';

  v_def_uuid := pg_get_functiondef('public.get_progress_breakdown(uuid)'::regprocedure);
  ASSERT v_def_uuid LIKE '%''completed'', ''cancelled'', ''deferred''%', 'get_progress_breakdown(uuid): deferred not added to terminal filter';
END
$verify$;
