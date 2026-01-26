-- SD-LEO-FIX-COMPLETION-TRIGGER-001: Fix deliverables completion when code is merged
-- Issue: SDs with merged code are blocked from completing because deliverables
--        stay in 'pending' status even after code is merged to main
-- Fix: Create trigger to auto-complete deliverables when GITHUB sub-agent passes
-- Date: 2026-01-26

-- ============================================================================
-- Create function to auto-complete deliverables based on GITHUB sub-agent results
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_deliverables_on_github_pass()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger on GITHUB sub-agent pass results
  IF NEW.sub_agent_code = 'GITHUB' AND NEW.verdict = 'PASS' THEN
    -- Auto-complete development-related deliverables
    UPDATE sd_scope_deliverables
    SET
      completion_status = 'completed',
      completion_evidence = format('Code merged via PR. GITHUB sub-agent verdict: PASS (confidence: %s%%)', NEW.confidence),
      completion_notes = format('Auto-completed by complete_deliverables_on_github_pass trigger. Result ID: %s', NEW.id),
      verified_by = 'GITHUB',
      verified_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_completed', true,
        'auto_completed_at', NOW()::text,
        'trigger', 'complete_deliverables_on_github_pass',
        'sub_agent_code', 'GITHUB',
        'sub_agent_result_id', NEW.id::text,
        'confidence', NEW.confidence
      )
    WHERE sd_id = NEW.sd_id
      AND completion_status = 'pending'
      AND deliverable_type IN ('configuration', 'ui_feature', 'documentation', 'api_endpoint', 'database_change');

    RAISE NOTICE 'Auto-completed deliverables for SD % based on GITHUB PASS result', NEW.sd_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Create trigger to fire when sub_agent_execution_results receives GITHUB PASS
-- ============================================================================

DROP TRIGGER IF EXISTS trg_complete_deliverables_on_github_pass ON sub_agent_execution_results;

CREATE TRIGGER trg_complete_deliverables_on_github_pass
  AFTER INSERT ON sub_agent_execution_results
  FOR EACH ROW
  EXECUTE FUNCTION complete_deliverables_on_github_pass();

-- ============================================================================
-- Also create utility function to manually complete deliverables for merged SDs
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_deliverables_for_merged_sd(
  p_sd_id TEXT,
  p_evidence TEXT DEFAULT 'Code merged to main branch'
)
RETURNS TABLE(deliverable_name TEXT, completion_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if there's a passing GITHUB sub-agent result for this SD
  IF NOT EXISTS (
    SELECT 1 FROM sub_agent_execution_results
    WHERE sd_id = p_sd_id
    AND sub_agent_code = 'GITHUB'
    AND verdict = 'PASS'
  ) THEN
    RAISE NOTICE 'No passing GITHUB result found for SD %. Checking handoffs...', p_sd_id;

    -- Alternative: Check if there's an accepted PLAN-TO-LEAD handoff (indicates completion flow reached)
    IF NOT EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = p_sd_id
      AND handoff_type = 'PLAN-TO-LEAD'
      AND status = 'accepted'
    ) THEN
      RAISE EXCEPTION 'Cannot complete deliverables: SD % has no passing GITHUB result or PLAN-TO-LEAD handoff', p_sd_id;
    END IF;
  END IF;

  -- Update pending deliverables
  UPDATE sd_scope_deliverables
  SET
    completion_status = 'completed',
    completion_evidence = p_evidence,
    completion_notes = 'Completed via complete_deliverables_for_merged_sd function',
    verified_by = 'GITHUB',
    verified_at = NOW()
  WHERE sd_scope_deliverables.sd_id = p_sd_id
    AND sd_scope_deliverables.completion_status = 'pending';

  -- Return updated deliverables
  RETURN QUERY
  SELECT d.deliverable_name, d.completion_status
  FROM sd_scope_deliverables d
  WHERE d.sd_id = p_sd_id;
END;
$$;

-- ============================================================================
-- Grant execute permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION complete_deliverables_on_github_pass() TO service_role;
GRANT EXECUTE ON FUNCTION complete_deliverables_for_merged_sd(TEXT, TEXT) TO service_role;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Verify trigger was created
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_complete_deliverables_on_github_pass'
  ) THEN
    RAISE NOTICE 'SUCCESS: Trigger trg_complete_deliverables_on_github_pass created';
  ELSE
    RAISE EXCEPTION 'FAILED: Trigger was not created';
  END IF;

  -- Verify functions exist
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'complete_deliverables_on_github_pass') THEN
    RAISE NOTICE 'SUCCESS: Function complete_deliverables_on_github_pass exists';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'complete_deliverables_for_merged_sd') THEN
    RAISE NOTICE 'SUCCESS: Function complete_deliverables_for_merged_sd exists';
  END IF;
END $$;
