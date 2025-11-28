-- ============================================================================
-- Migration: SD-DELIVERABLES-V2-001 Phase 4 - Verification Enhancement
-- ============================================================================
-- Implements US-009 and US-010 from PRD-SD-DELIVERABLES-V2-001
--
-- Changes:
--   US-009: Disable/replace the blind auto-complete trigger
--   US-010: Implement intelligent verification gate
--
-- The old trigger blindly marked all deliverables complete on handoff.
-- The new approach uses actual completion data from tracking systems.
--
-- Date: 2025-11-28
-- Related SD: SD-DELIVERABLES-V2-001
-- Phase: 4 of 5 (Verification Enhancement)
-- ============================================================================

-- ============================================================================
-- SECTION 1: Disable Blind Auto-Complete Trigger (US-009)
-- ============================================================================
-- Instead of removing, we replace with intelligent verification

-- Drop the old blind trigger
DROP TRIGGER IF EXISTS trigger_auto_complete_deliverables ON sd_phase_handoffs;
DROP TRIGGER IF EXISTS trigger_auto_complete_deliverables_insert ON sd_phase_handoffs;

-- Create a backup of the old function for rollback
-- (The function is kept but renamed, not used by any trigger)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'auto_complete_sd_deliverables'
  ) THEN
    -- Keep the function but document it's deprecated
    COMMENT ON FUNCTION auto_complete_sd_deliverables() IS
      'DEPRECATED (SD-DELIVERABLES-V2-001): Blind auto-complete replaced by intelligent verification.
       Kept for rollback purposes. Use verify_deliverables_before_handoff() instead.';
  END IF;
END $$;

RAISE NOTICE 'Disabled blind auto-complete triggers (US-009)';

-- ============================================================================
-- SECTION 2: Intelligent Verification Gate (US-010)
-- ============================================================================

-- Function to verify deliverable completion before accepting handoff
CREATE OR REPLACE FUNCTION verify_deliverables_before_handoff()
RETURNS TRIGGER AS $$
DECLARE
  total_deliverables INTEGER;
  completed_deliverables INTEGER;
  completion_percentage NUMERIC;
  incomplete_list TEXT;
  verification_result JSONB;
BEGIN
  -- Only check EXEC-TO-PLAN handoffs being accepted
  IF NEW.handoff_type != 'EXEC-TO-PLAN' OR NEW.status != 'accepted' THEN
    RETURN NEW;
  END IF;

  -- Skip if already processed (prevent re-verification on update)
  IF OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  -- Count deliverables
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE completion_status = 'completed')
  INTO total_deliverables, completed_deliverables
  FROM sd_scope_deliverables
  WHERE sd_id = NEW.sd_id
  AND priority IN ('required', 'high');

  -- Calculate completion percentage
  IF total_deliverables > 0 THEN
    completion_percentage := (completed_deliverables::NUMERIC / total_deliverables::NUMERIC) * 100;
  ELSE
    -- No deliverables tracked, allow handoff but warn
    completion_percentage := 100;
  END IF;

  -- Get list of incomplete deliverables
  SELECT string_agg(deliverable_name, ', ')
  INTO incomplete_list
  FROM sd_scope_deliverables
  WHERE sd_id = NEW.sd_id
  AND priority IN ('required', 'high')
  AND completion_status != 'completed'
  LIMIT 5;

  -- Build verification result
  verification_result := jsonb_build_object(
    'verified_at', NOW(),
    'total_deliverables', total_deliverables,
    'completed_deliverables', completed_deliverables,
    'completion_percentage', completion_percentage,
    'verification_method', 'intelligent_gate',
    'incomplete_sample', incomplete_list
  );

  -- Decision based on completion
  IF completion_percentage >= 100 THEN
    -- All deliverables complete - allow handoff
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'verification', verification_result || jsonb_build_object('verdict', 'PASS')
    );

    RAISE NOTICE 'Verification PASS: %/% deliverables complete (100%%) for SD %',
      completed_deliverables, total_deliverables, NEW.sd_id;

  ELSIF completion_percentage >= 80 THEN
    -- 80-99% complete - allow with warning
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'verification', verification_result || jsonb_build_object(
        'verdict', 'PASS_WITH_WARNING',
        'warning', format('%s deliverables incomplete: %s',
                         total_deliverables - completed_deliverables, incomplete_list)
      )
    );

    RAISE WARNING 'Verification PASS_WITH_WARNING: %.0f%% complete for SD %. Incomplete: %',
      completion_percentage, NEW.sd_id, incomplete_list;

  ELSE
    -- Below 80% - block handoff
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'verification', verification_result || jsonb_build_object(
        'verdict', 'BLOCKED',
        'reason', format('Only %.0f%% complete (%s/%s). Incomplete: %s',
                        completion_percentage, completed_deliverables,
                        total_deliverables, incomplete_list)
      )
    );

    -- NOTE: We don't block the trigger - that's done at application level
    -- This just records the verification result
    RAISE WARNING 'Verification BLOCKED: Only %.0f%% complete for SD %. Required: 80%%+',
      completion_percentage, NEW.sd_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for intelligent verification
DROP TRIGGER IF EXISTS trigger_verify_deliverables_before_handoff ON sd_phase_handoffs;

CREATE TRIGGER trigger_verify_deliverables_before_handoff
  BEFORE UPDATE ON sd_phase_handoffs
  FOR EACH ROW
  WHEN (NEW.handoff_type = 'EXEC-TO-PLAN' AND NEW.status = 'accepted')
  EXECUTE FUNCTION verify_deliverables_before_handoff();

-- Also trigger on INSERT for direct acceptance
DROP TRIGGER IF EXISTS trigger_verify_deliverables_before_handoff_insert ON sd_phase_handoffs;

CREATE TRIGGER trigger_verify_deliverables_before_handoff_insert
  BEFORE INSERT ON sd_phase_handoffs
  FOR EACH ROW
  WHEN (NEW.handoff_type = 'EXEC-TO-PLAN' AND NEW.status = 'accepted')
  EXECUTE FUNCTION verify_deliverables_before_handoff();

-- Comments
COMMENT ON FUNCTION verify_deliverables_before_handoff() IS
  'SD-DELIVERABLES-V2-001 Phase 4: Intelligent verification gate that checks actual
   deliverable completion status before accepting EXEC-TO-PLAN handoff.
   Replaces blind auto-complete trigger with evidence-based verification.
   - 100%: PASS
   - 80-99%: PASS_WITH_WARNING
   - <80%: BLOCKED (recorded in metadata)';

-- ============================================================================
-- SECTION 3: Helper Function for Verification Report
-- ============================================================================

CREATE OR REPLACE FUNCTION get_deliverable_verification_report(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  total_count INTEGER;
  completed_count INTEGER;
  pending_list JSONB;
BEGIN
  -- Count deliverables
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE completion_status = 'completed')
  INTO total_count, completed_count
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_param
  AND priority IN ('required', 'high');

  -- Get pending deliverables
  SELECT jsonb_agg(jsonb_build_object(
    'name', deliverable_name,
    'type', deliverable_type,
    'status', completion_status,
    'user_story_id', user_story_id
  ))
  INTO pending_list
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_param
  AND priority IN ('required', 'high')
  AND completion_status != 'completed';

  result := jsonb_build_object(
    'sd_id', sd_id_param,
    'generated_at', NOW(),
    'total_required', total_count,
    'completed', completed_count,
    'pending', total_count - completed_count,
    'completion_percentage', CASE
      WHEN total_count > 0 THEN ROUND((completed_count::NUMERIC / total_count::NUMERIC) * 100, 1)
      ELSE 100
    END,
    'ready_for_handoff', completed_count >= total_count,
    'pending_deliverables', COALESCE(pending_list, '[]'::jsonb)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_deliverable_verification_report(VARCHAR) IS
  'Returns a verification report for SD deliverables.
   Used by handoff verification and progress dashboard.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  old_trigger_removed BOOLEAN;
  new_function_exists BOOLEAN;
  new_trigger_exists BOOLEAN;
  report_function_exists BOOLEAN;
BEGIN
  -- Check old trigger is gone
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_auto_complete_deliverables'
  ) INTO old_trigger_removed;

  -- Check new function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'verify_deliverables_before_handoff'
  ) INTO new_function_exists;

  -- Check new trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_verify_deliverables_before_handoff'
  ) INTO new_trigger_exists;

  -- Check report function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_deliverable_verification_report'
  ) INTO report_function_exists;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-DELIVERABLES-V2-001 Phase 4 Migration Verification';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'US-009 Blind auto-complete trigger removed: %',
    CASE WHEN old_trigger_removed THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'US-010 verify_deliverables_before_handoff function: %',
    CASE WHEN new_function_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'US-010 Verification trigger installed: %',
    CASE WHEN new_trigger_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'Helper get_deliverable_verification_report function: %',
    CASE WHEN report_function_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE '============================================================';

  IF old_trigger_removed AND new_function_exists AND new_trigger_exists AND report_function_exists THEN
    RAISE NOTICE 'Phase 4 Migration: SUCCESS';
  ELSE
    RAISE EXCEPTION 'Phase 4 Migration: FAILED - see above for details';
  END IF;
END $$;
