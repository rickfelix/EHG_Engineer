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
-- The Problem (ghost-complete, caught live on SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001):
-- complete_orchestrator_sd() set status='completed' directly once all children
-- finished, FABRICATED an accepted PLAN-TO-LEAD handoff row
-- (created_by='ORCHESTRATOR_AUTO_COMPLETE', whitelisted in check_handoff_bypass),
-- and its retrospective check accepted ANY retro row regardless of retro_type —
-- a mere HANDOFF retro satisfied completion.
--
-- The Fix:
-- 1. Retro check filters retro_type='SD_COMPLETION' + freshness after the SD's
--    accepted LEAD-TO-PLAN handoff (mirrors scripts/modules/handoff/retro-filters.js).
-- 2. Completion requires a genuine accepted LEAD-FINAL-APPROVAL handoff row —
--    otherwise the function stages the SD at status='pending_approval' and returns
--    the exact command to run. No handoff row is ever fabricated.
-- 3. check_handoff_bypass() no longer whitelists ORCHESTRATOR_AUTO_COMPLETE
--    (the function no longer inserts handoffs; the whitelist was the bypass seam).

-- ============================================================================
-- FUNCTION: Complete Orchestrator SD (LEAD-FINAL enforced)
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_orchestrator_sd(sd_id_param VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  is_orch BOOLEAN;
  total_children INT;
  completed_children INT;
  lead_to_plan_accepted_at TIMESTAMPTZ;
  retro_exists BOOLEAN;
  lfa_exists BOOLEAN;
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

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
  INTO total_children, completed_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = sd_id_param;

  IF completed_children <> total_children THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Not all children completed: %s/%s', completed_children, total_children),
      'completed_children', completed_children,
      'total_children', total_children
    );
  END IF;

  -- Canonical completion-retro check (mirrors scripts/modules/handoff/retro-filters.js):
  -- retro_type='SD_COMPLETION', not tagged as a handoff-time retro, created after
  -- LEAD-TO-PLAN acceptance (fallback: SD creation time).
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

  -- Completion witness: a genuine accepted LEAD-FINAL-APPROVAL handoff row.
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
      AND handoff_type = 'LEAD-FINAL-APPROVAL'
      AND status = 'accepted'
  ) INTO lfa_exists;

  IF NOT lfa_exists THEN
    -- Stage for the real executor instead of fabricating completion.
    UPDATE strategic_directives_v2
    SET status = 'pending_approval', is_working_on = false, updated_at = now()
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
  UPDATE strategic_directives_v2
  SET status = 'completed', current_phase = 'COMPLETED', is_working_on = false, updated_at = now()
  WHERE id = sd_id_param;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Orchestrator completed: %s/%s children done, LEAD-FINAL-APPROVAL verified', completed_children, total_children),
    'sd_id', sd_id_param,
    'completed_children', completed_children
  );
END;
$$;

-- ============================================================================
-- check_handoff_bypass: remove the ORCHESTRATOR_AUTO_COMPLETE whitelist
-- (no code path inserts handoffs with that created_by anymore)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_handoff_bypass()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow known system creators
  IF NEW.created_by IN ('HANDOFF_SYSTEM', 'LEO_EXECUTOR', 'UNIFIED_HANDOFF_SYSTEM') THEN
    RETURN NEW;
  END IF;

  -- Block unknown direct creation attempts
  IF NEW.created_by IS NULL OR NEW.created_by = 'LEO_AGENT' THEN
    RAISE EXCEPTION 'HANDOFF_BYPASS_BLOCKED: Direct handoff creation is not allowed.

To create a handoff, run:
  node scripts/handoff.js execute <TYPE> <SD-ID>

Where TYPE is one of:
  - LEAD-TO-PLAN
  - PLAN-TO-EXEC
  - EXEC-TO-PLAN
  - PLAN-TO-LEAD

Example:
  node scripts/handoff.js execute PLAN-TO-EXEC SD-EXAMPLE-001

Attempted created_by: %', COALESCE(NEW.created_by, 'NULL');
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Orchestrator ghost-complete fix installed:';
  RAISE NOTICE '  - complete_orchestrator_sd(): SD_COMPLETION retro + accepted LEAD-FINAL-APPROVAL required';
  RAISE NOTICE '  - no fabricated PLAN-TO-LEAD rows; stages at pending_approval instead';
  RAISE NOTICE '  - check_handoff_bypass(): ORCHESTRATOR_AUTO_COMPLETE whitelist removed';
END $$;
