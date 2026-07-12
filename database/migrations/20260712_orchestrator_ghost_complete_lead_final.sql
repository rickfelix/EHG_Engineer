-- Migration: Orchestrator ghost-complete fix — enforce LEAD-FINAL + SD_COMPLETION retro
-- SD: SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001
-- Date: 2026-07-12
--
-- ⚠️  STAGED — NOT YET APPROVED FOR APPLY. CHAIRMAN APPLY REQUIRED. ⚠️
-- TIER-2 (non-delegatable): CREATE OR REPLACE of a SECURITY DEFINER function
-- per migration-tier-classifier.mjs. Apply via apply-migration.js --prod-deploy.
-- Rollback companion: 20260712_orchestrator_ghost_complete_lead_final_rollback.sql
-- Applied-vs-staged state observable via scripts/orchestrator-rpc-enforcement-status.mjs
--
-- ORDERING: this migration SUPERSEDES section (c) (complete_orchestrator_sd) of the
-- also-staged 20260711_orchestrator_terminal_status_sql_parity.sql and INCORPORATES its
-- logic verbatim (cancelled-as-terminal child counting, PCVP handoff-evidence check,
-- honest completion narrative). Sections (a),(b),(d),(e) of 20260711 are untouched and
-- must still be applied. Apply 20260711 first, then this file (date order).
--
-- The Problem (ghost-complete, caught live on SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001):
-- complete_orchestrator_sd() set status='completed' directly once all children
-- finished, FABRICATED an accepted PLAN-TO-LEAD handoff row
-- (created_by='ORCHESTRATOR_AUTO_COMPLETE'), and its retrospective check accepted
-- ANY retro row regardless of retro_type — a mere HANDOFF retro satisfied completion.
--
-- The Fix:
-- 1. Retro check filters retro_type='SD_COMPLETION' + freshness after the SD's
--    accepted LEAD-TO-PLAN handoff (mirrors scripts/modules/handoff/retro-filters.js).
-- 2. Completion requires a GENUINE accepted LEAD-FINAL-APPROVAL handoff row written by
--    the executor (created_by IN ('UNIFIED-HANDOFF-SYSTEM','unified-handoff-system')) —
--    NOT rows forged via privileged actors (live data shows 807 ADMIN_OVERRIDE-created
--    accepted LFA rows; handoff_actor_policy() still authorizes ADMIN_OVERRIDE inserts
--    that skip claim checks, so created_by is the discriminating witness). Absent the
--    witness, the function stages the SD at status='pending_approval' and returns the
--    exact command to run. No handoff row is ever fabricated.
-- 3. NOTE (adversarial review 2026-07-12): the previously-drafted check_handoff_bypass()
--    replacement was REMOVED from this migration — that function is a dead third copy
--    already DROPped by the 20260530 handoff-actor-policy SSOT migration; re-creating it
--    would resurrect dead code without touching the live gates
--    (enforce_handoff_system / enforce_is_working_on_for_handoffs via
--    handoff_actor_policy()). Narrowing handoff_actor_policy() itself is out of scope
--    here (it has its own SSOT invariant tests) — the created_by witness allow-list in
--    (2) is the enforcement seam instead.

-- ============================================================================
-- FUNCTION: Complete Orchestrator SD (LEAD-FINAL enforced; supersedes 20260711 (c))
-- ============================================================================

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
  total_children INT;
  completed_children INT;
  cancelled_children INT;
  children_without_handoffs INT;
  child_quality_issues JSONB;
  lead_to_plan_accepted_at TIMESTAMPTZ;
  retro_exists BOOLEAN;
  lfa_witness_exists BOOLEAN;
  completion_narrative TEXT;
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'SD not found: ' || sd_id_param);
  END IF;

  IF sd.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'message', 'SD already completed', 'sd_id', sd_id_param);
  END IF;

  is_orch := is_orchestrator_sd(sd_id_param);
  IF NOT is_orch THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an orchestrator SD (has no children)', 'sd_id', sd_id_param);
  END IF;

  -- SD-LEO-FIX-ORCHESTRATOR-LEAF-ROUTER-001 (incorporated from 20260711 (c)):
  -- cancelled is a terminal disposition, same as completed.
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

  -- PCVP (incorporated from 20260711 (c)): only 'completed' children (never 'cancelled')
  -- are required to have handoff evidence.
  SELECT COUNT(*) INTO children_without_handoffs
  FROM strategic_directives_v2 child
  WHERE child.parent_sd_id = sd_id_param
    AND child.status = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM sd_phase_handoffs h
      WHERE h.sd_id = child.id AND h.status = 'accepted'
    );
  IF children_without_handoffs > 0 THEN
    SELECT jsonb_agg(jsonb_build_object(
      'sd_key', child.sd_key, 'title', child.title,
      'issue', 'No accepted handoff records found'
    ))
    INTO child_quality_issues
    FROM strategic_directives_v2 child
    WHERE child.parent_sd_id = sd_id_param
      AND child.status = 'completed'
      AND NOT EXISTS (
        SELECT 1 FROM sd_phase_handoffs h
        WHERE h.sd_id = child.id AND h.status = 'accepted'
      );
    RETURN jsonb_build_object(
      'success', false,
      'error', format('PCVP: %s child(ren) completed without handoff evidence', children_without_handoffs),
      'children_without_handoffs', children_without_handoffs,
      'quality_issues', child_quality_issues,
      'hint', 'Each child SD must have at least one accepted handoff in sd_phase_handoffs'
    );
  END IF;

  -- SD-FDBK-FIX-ORCHESTRATOR-GHOST-COMPLETE-001: canonical completion-retro check
  -- (mirrors scripts/modules/handoff/retro-filters.js): retro_type='SD_COMPLETION',
  -- not tagged as a handoff-time retro, created after LEAD-TO-PLAN acceptance
  -- (fallback: SD creation time).
  SELECT COALESCE(
    (SELECT accepted_at FROM sd_phase_handoffs
     WHERE sd_id = sd_id_param AND from_phase = 'LEAD' AND to_phase = 'PLAN' AND status = 'accepted'
     ORDER BY accepted_at DESC LIMIT 1),
    sd.created_at,
    to_timestamp(0)
  ) INTO lead_to_plan_accepted_at;

  SELECT EXISTS (
    SELECT 1 FROM retrospectives
    WHERE sd_id = sd_id_param
      AND retro_type = 'SD_COMPLETION'
      AND (retrospective_type IS NULL OR retrospective_type = 'SD_COMPLETION')
      AND created_at > lead_to_plan_accepted_at
  ) INTO retro_exists;

  IF NOT retro_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SD-completion retrospective required (retro_type=SD_COMPLETION, created after LEAD-TO-PLAN acceptance)',
      'hint', 'Run the RETRO sub-agent to generate a retro_type=SD_COMPLETION retrospective, then re-run'
    );
  END IF;

  -- Completion witness: a genuine accepted LEAD-FINAL-APPROVAL handoff row WRITTEN BY
  -- THE EXECUTOR. created_by is the discriminator: privileged actors (ADMIN_OVERRIDE,
  -- the legacy auto-complete actor) can insert accepted rows via handoff_actor_policy(),
  -- so an unqualified EXISTS would be forgeable with a single INSERT.
  -- (Actor names deliberately not spelled out here: this comment lives inside prosrc and
  -- scripts/orchestrator-rpc-enforcement-status.mjs greps the live body for markers.)
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
      AND handoff_type = 'LEAD-FINAL-APPROVAL'
      AND status = 'accepted'
      AND created_by IN ('UNIFIED-HANDOFF-SYSTEM', 'unified-handoff-system')
  ) INTO lfa_witness_exists;

  IF NOT lfa_witness_exists THEN
    -- Stage for the real executor instead of fabricating completion.
    -- is_working_on is deliberately NOT cleared: the LFA executor's canonical handoff
    -- insert (created_by='UNIFIED-HANDOFF-SYSTEM') does not skip the claim check, and
    -- enforce_is_working_on_for_handoffs rejects the insert when is_working_on is false
    -- (parity with completeStandardSD's staging behavior).
    UPDATE strategic_directives_v2
    SET status = 'pending_approval', updated_at = now()
    WHERE id = sd_id_param AND status <> 'completed';

    RETURN jsonb_build_object(
      'success', false,
      'staged', true,
      'error', 'LEAD-FINAL-APPROVAL required before completion — SD staged at pending_approval',
      'hint', format('Run: node scripts/handoff.js execute LEAD-FINAL-APPROVAL %s', COALESCE(sd.sd_key, sd_id_param)),
      'sd_id', sd_id_param
    );
  END IF;

  -- Genuine LEAD-FINAL evidence exists — completion is legitimate.
  completion_narrative := CASE WHEN cancelled_children = 0
    THEN format('All %s child SDs completed with verified handoff evidence. Quality verified across all children.', total_children)
    ELSE format('%s of %s child SDs completed with verified handoff evidence; %s cancelled (a terminal disposition, not a quality failure — cancelled children never require handoff evidence).', completed_children - cancelled_children, total_children, cancelled_children)
  END;

  UPDATE strategic_directives_v2
  SET status = 'completed', current_phase = 'COMPLETED', is_working_on = false, updated_at = now()
  WHERE id = sd_id_param;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Orchestrator completed (LEAD-FINAL-APPROVAL verified): %s', completion_narrative),
    'sd_id', sd_id_param,
    'completed_children', completed_children - cancelled_children,
    'cancelled_children', cancelled_children,
    'quality_verified', cancelled_children = 0
  );
END;
$function$
;

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Orchestrator ghost-complete fix installed:';
  RAISE NOTICE '  - complete_orchestrator_sd(): SD_COMPLETION retro + executor-written accepted LEAD-FINAL-APPROVAL required';
  RAISE NOTICE '  - no fabricated PLAN-TO-LEAD rows; stages at pending_approval instead';
  RAISE NOTICE '  - incorporates 20260711 cancelled-as-terminal + PCVP logic (supersedes its section (c))';
END $$;
