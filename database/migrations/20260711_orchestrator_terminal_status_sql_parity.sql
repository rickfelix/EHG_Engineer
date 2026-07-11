-- SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001
-- Terminal-status SQL parity for the orchestrator progress/completion chain.
--
-- The JS-layer fix (lib/orchestrator/child-terminal-status.js, QF-20260710-491, merged
-- rickfelix/EHG_Engineer#5867) treats a cancelled child as terminal (never blocking) at
-- 5 call sites. Adversarial review found the SAME bug one layer deeper: the DB progress/
-- completion chain counts ONLY status='completed' children, so an orchestrator with a
-- cancelled child can NEVER reach 100% progress or auto-complete — live-verified:
-- calculate_sd_progress() on SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001 (children
-- [completed, cancelled, completed]) returns 73, not 100. Shipping the JS fix alone (as
-- happened — merged before this migration) is a REGRESSION on its own: it lets
-- OrchestratorCompletionGuardian proceed past validateChildren() and persist
-- "all children completed successfully" PRD/handoff/retrospective provenance for an
-- orchestrator that, at the DB layer, still cannot actually complete.
--
-- Surgical changes (CREATE OR REPLACE FUNCTION only — no DROP, no data mutation):
--   (a) get_progress_breakdown(text)  — single-predicate: completed_children COUNT FILTER
--   (b) get_progress_breakdown(uuid)  — same (two overloads exist on this function name)
--   (c) complete_orchestrator_sd      — COUNT FILTER (now tracks cancelled_children
--                                        separately too) + the hardcoded completion
--                                        narrative made conditional (adversarial round-2
--                                        CRITICAL: this function's own success text was
--                                        unconditionally "quality verified... completed
--                                        successfully" even when every child was
--                                        cancelled — the same false-provenance class the
--                                        JS-layer OrchestratorCompletionGuardian fix in
--                                        this SD addresses, missed here in round 1).
--                                        children_without_handoffs logic (which decides
--                                        who needs handoff evidence) is INTENTIONALLY
--                                        UNCHANGED — a cancelled child never needs
--                                        handoff evidence.
--   (d) try_auto_complete_parent_orchestrator — COUNT FILTER, PLUS both entry guards
--       (NEW.status terminal-check and OLD.status-changed check) updated together —
--       NOT a single-predicate change, despite the "surgical" framing above; documented
--       here for audit accuracy (adversarial round-2 finding).
--   (e) trg_auto_complete_parent_orchestrator — the trigger's own WHEN clause currently
--       fires ONLY on a transition INTO 'completed'; a child whose last terminal
--       transition is to 'cancelled' never invokes the check at all, independent of any
--       function-body fix. WHEN clause widened to fire on any transition into EITHER
--       terminal state (matching baseline: the ORIGINAL trigger fired regardless of what
--       OLD.status was, including from the other terminal value — an earlier draft of
--       this migration over-restricted that case; fixed in round 2).
--
-- APPLY IS CHAIRMAN-GATED (requires_chairman_apply): node scripts/apply-migration.js
-- --prod-deploy with @approved-by stamp. Trigger/function DDL on the live DB.
-- @approved-by: codestreetlabs@gmail.com
-- (approval given live in-session by the chairman 2026-07-11 ~3:05 PM ET, recorded by Adam ac499e67)
--
-- ─── ROLLBACK (verbatim prior definitions, captured live via pg_get_functiondef/
-- pg_get_triggerdef 2026-07-11) ───
-- Re-run get_progress_breakdown(text), get_progress_breakdown(uuid),
-- complete_orchestrator_sd, try_auto_complete_parent_orchestrator with
-- `WHERE status = 'completed'` in place of `WHERE status IN ('completed','cancelled')`
-- in each COUNT(*) FILTER, and re-run:
--   DROP TRIGGER trg_auto_complete_parent_orchestrator ON public.strategic_directives_v2;
--   CREATE TRIGGER trg_auto_complete_parent_orchestrator AFTER UPDATE OF status
--     ON public.strategic_directives_v2 FOR EACH ROW
--     WHEN (((new.status)::text = 'completed'::text) AND ((old.status)::text IS DISTINCT FROM 'completed'::text))
--     EXECUTE FUNCTION try_auto_complete_parent_orchestrator();
-- ──────────────────────────────────────────────────────────────────────────────────────

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

  -- SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001: cancelled is a terminal disposition, same as completed.
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled')), COUNT(*) FILTER (WHERE status = 'blocked'), COUNT(*) FILTER (WHERE status = 'cancelled')
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
      -- 'complete'/'progress' correctly weight a cancelled child the same as completed
      -- (both terminal, neither blocks orchestrator progression — the point of this SD).
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

-- (b) get_progress_breakdown(uuid) — second overload, identical structure + comments preserved.
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

  -- SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001: cancelled is a terminal disposition, same as completed.
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled')), COUNT(*) FILTER (WHERE status = 'blocked'), COUNT(*) FILTER (WHERE status = 'cancelled')
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
      -- 'complete'/'progress' correctly weight a cancelled child the same as completed
      -- (both terminal, neither blocks orchestrator progression — the point of this SD).
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

-- (c) complete_orchestrator_sd
CREATE OR REPLACE FUNCTION public.complete_orchestrator_sd(sd_id_param character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sd RECORD;
  is_orch BOOLEAN;
  children_done BOOLEAN;
  retro_exists BOOLEAN;
  total_children INT;
  completed_children INT;
  cancelled_children INT;
  children_without_handoffs INT;
  child_quality_issues JSONB;
  child_summaries JSONB;
  completion_narrative TEXT;
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SD not found: ' || sd_id_param
    );
  END IF;
  IF sd.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'SD already completed',
      'sd_id', sd_id_param
    );
  END IF;
  is_orch := is_orchestrator_sd(sd_id_param);
  IF NOT is_orch THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not an orchestrator SD (has no children)',
      'sd_id', sd_id_param
    );
  END IF;
  -- SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001: cancelled is a terminal disposition, same as completed.
  -- cancelled_children is tracked SEPARATELY (not just derived as total-completed) so the
  -- completion narrative below can be honest about a cancelled-containing orchestrator
  -- instead of unconditionally claiming "quality verified" (adversarial round-2 CRITICAL:
  -- this SQL path has its OWN hardcoded success text, independent of the JS-layer
  -- OrchestratorCompletionGuardian provenance fix in this same SD).
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled')),
    COUNT(*) FILTER (WHERE status = 'cancelled')
  INTO total_children, completed_children, cancelled_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = sd_id_param;
  children_done := (completed_children = total_children);
  IF NOT children_done THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Not all children completed: %s/%s', completed_children, total_children),
      'completed_children', completed_children,
      'total_children', total_children
    );
  END IF;
  -- UNCHANGED: only 'completed' children (never 'cancelled') are required to have handoff evidence.
  SELECT COUNT(*) INTO children_without_handoffs
  FROM strategic_directives_v2 child
  WHERE child.parent_sd_id = sd_id_param
  AND child.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM sd_phase_handoffs h
    WHERE h.sd_id = child.id
    AND h.status = 'accepted'
  );
  IF children_without_handoffs > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'sd_key', child.sd_key,
      'title', child.title,
      'issue', 'No accepted handoff records found'
    ))
    INTO child_quality_issues
    FROM strategic_directives_v2 child
    WHERE child.parent_sd_id = sd_id_param
    AND child.status = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM sd_phase_handoffs h
      WHERE h.sd_id = child.id
      AND h.status = 'accepted'
    );
    RETURN jsonb_build_object(
      'success', false,
      'error', format('PCVP: %s child(ren) completed without handoff evidence', children_without_handoffs),
      'children_without_handoffs', children_without_handoffs,
      'quality_issues', child_quality_issues,
      'hint', 'Each child SD must have at least one accepted handoff in sd_phase_handoffs'
    );
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retro_exists;
  IF NOT retro_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Retrospective required but not found',
      'hint', 'Create a retrospective before completing'
    );
  END IF;

  -- Build child summaries for deliverables manifest
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sd_key', child.sd_key,
    'title', child.title,
    'status', child.status
  )), '[]'::jsonb)
  INTO child_summaries
  FROM strategic_directives_v2 child
  WHERE child.parent_sd_id = sd_id_param;

  completion_narrative := CASE WHEN cancelled_children = 0
    THEN format('All %s child SDs completed with verified handoff evidence. Quality verified across all children.', total_children)
    ELSE format('%s of %s child SDs completed with verified handoff evidence; %s cancelled (a terminal disposition, not a quality failure — cancelled children never require handoff evidence).', completed_children - cancelled_children, total_children, cancelled_children)
  END;

  INSERT INTO sd_phase_handoffs (
    sd_id,
    handoff_type,
    from_phase,
    to_phase,
    status,
    validation_score,
    executive_summary,
    deliverables_manifest,
    completeness_report,
    key_decisions,
    known_issues,
    resource_utilization,
    action_items,
    created_by
  ) VALUES (
    sd_id_param,
    'PLAN-TO-LEAD',
    'PLAN',
    'LEAD',
    'accepted',
    100,
    format('Orchestrator auto-completion: %s', completion_narrative),
    child_summaries::text,
    jsonb_build_object(
      'children_completed', completed_children - cancelled_children,
      'children_cancelled', cancelled_children,
      'children_total', total_children,
      'children_without_handoffs', 0,
      'quality_verified', cancelled_children = 0,
      'auto_completed', true,
      'completion_date', now()
    ),
    jsonb_build_array(jsonb_build_object(
      'decision', 'Auto-complete orchestrator after all children reached a terminal state',
      'rationale', completion_narrative
    )),
    jsonb_build_array(jsonb_build_object(
      'issue', CASE WHEN cancelled_children = 0 THEN 'None identified' ELSE format('%s child SD(s) cancelled', cancelled_children) END,
      'severity', 'info',
      'detail', completion_narrative
    )),
    jsonb_build_object(
      'orchestrator_auto_complete', true,
      'children_completed', completed_children - cancelled_children,
      'children_cancelled', cancelled_children,
      'total_children', total_children,
      'completion_method', 'ORCHESTRATOR_AUTO_COMPLETE'
    ),
    jsonb_build_array(jsonb_build_object(
      'action', 'Orchestrator completed - proceed to next queued SD',
      'owner', 'LEO',
      'priority', 'info'
    )),
    'ORCHESTRATOR_AUTO_COMPLETE'
  );
  UPDATE strategic_directives_v2
  SET
    status = 'completed',
    current_phase = 'COMPLETED',
    is_working_on = false,
    updated_at = now()
  WHERE id = sd_id_param;
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Orchestrator completed: %s', completion_narrative),
    'sd_id', sd_id_param,
    'completed_children', completed_children - cancelled_children,
    'cancelled_children', cancelled_children,
    'quality_verified', cancelled_children = 0
  );
END;
$function$
;

-- (d) try_auto_complete_parent_orchestrator
CREATE OR REPLACE FUNCTION public.try_auto_complete_parent_orchestrator()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_id VARCHAR;
  v_is_orchestrator BOOLEAN;
  v_total_children INT;
  v_completed_children INT;
  v_result JSONB;
BEGIN
  -- SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001: fire on a genuine transition INTO either
  -- terminal state (the trigger's own WHEN clause below is widened correspondingly).
  -- Adversarial round-2: an earlier draft additionally required OLD.status to have been
  -- non-terminal, which over-restricted beyond the original trigger's behavior — the old
  -- trigger fired on ANY transition into 'completed' regardless of the prior value
  -- (including a cancelled->completed correction). Matching that baseline: the only
  -- requirement is that NEW.status is terminal and actually differs from OLD.status.
  IF NEW.status NOT IN ('completed', 'cancelled') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  v_parent_id := NEW.parent_sd_id;
  IF v_parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  v_is_orchestrator := is_orchestrator_sd(v_parent_id);
  IF NOT v_is_orchestrator THEN
    RETURN NEW;
  END IF;
  -- SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001: cancelled is a terminal disposition, same as completed.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled'))
  INTO v_total_children, v_completed_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = v_parent_id;
  IF v_completed_children = v_total_children AND v_total_children > 0 THEN
    RAISE NOTICE 'FIX 4: All % children completed for parent %. Attempting auto-complete...',
      v_total_children, v_parent_id;
    v_result := complete_orchestrator_sd(v_parent_id);
    IF (v_result->>'success')::boolean THEN
      RAISE NOTICE 'FIX 4: Parent orchestrator % auto-completed successfully', v_parent_id;
    ELSE
      RAISE NOTICE 'FIX 4: Parent orchestrator % not auto-completed: %',
        v_parent_id, v_result->>'error';
    END IF;
  ELSE
    RAISE NOTICE 'FIX 4: Parent % has %/% children completed - waiting for all',
      v_parent_id, v_completed_children, v_total_children;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-blocking: log warning but never prevent the child SD's completion (parity with the sibling
  -- auto-close triggers; ROOT-FIX-TRG doctrine — completion writes are sacred). SD-LEO-FIX-GUARD-UNGUARDED-UUID-001 F-9.
  RAISE WARNING 'try_auto_complete_parent_orchestrator failed for SD %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$
;

-- (e) trigger WHEN clause: fire on transition into EITHER terminal state, not just
-- 'completed' — matching baseline behavior for the "old was already terminal" case
-- (see the matching comment on try_auto_complete_parent_orchestrator above).
DROP TRIGGER IF EXISTS trg_auto_complete_parent_orchestrator ON public.strategic_directives_v2;
CREATE TRIGGER trg_auto_complete_parent_orchestrator
  AFTER UPDATE OF status ON public.strategic_directives_v2
  FOR EACH ROW
  WHEN (
    (new.status)::text = ANY (ARRAY['completed'::text, 'cancelled'::text])
    AND (old.status)::text IS DISTINCT FROM (new.status)::text
  )
  EXECUTE FUNCTION try_auto_complete_parent_orchestrator();
