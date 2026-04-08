-- Migration: Fix cross-trigger conflict between chairman approval side-effects and vision quality enforcement
-- Depends on: 20260407_chairman_approval_side_effects_trigger (chairman_decision_audit table + on_chairman_approval_side_effects trigger)
-- SD: SD-VISION-QUALITY-GATE-BYPASS-ORCH-001-A
--
-- Problem: on_chairman_approval_side_effects sets vision status = 'active' for kill gate approvals,
-- but enforce_vision_quality_on_advancement blocks this when quality_checked = false.
-- Since EVA seeds visions as stubs at Stage 1, every manual kill gate approval fails with 400.
--
-- Fix: Transaction-scoped session variable (SET LOCAL) coordinates the two triggers.
-- This is the 3rd bypass pattern in the codebase (after leo.bypass_working_on_check and leo.bypass_completion_check).
-- If a 4th bypass is needed within 90 days, refactor to unified RPC state machine.

-- 1. Modify on_chairman_approval_side_effects: set bypass variable before cross-table UPDATE
CREATE OR REPLACE FUNCTION on_chairman_approval_side_effects()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire on status transition to 'approved'
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    -- Stage-number guard: only fire for kill gate stages
    IF NEW.lifecycle_stage IN (3, 5) THEN
      -- Set transaction-scoped bypass so the vision quality trigger skips enforcement
      -- SET LOCAL ensures the variable is destroyed when this transaction commits
      PERFORM set_config('leo.chairman_approval_bypass', 'true', true);

      -- Un-archive vision documents for this venture
      UPDATE eva_vision_documents
      SET status = 'active', updated_at = NOW()
      WHERE venture_id = NEW.venture_id
        AND status = 'archived';

      -- Record the side-effect in the audit table (idempotent)
      INSERT INTO chairman_decision_audit (decision_id, venture_id, lifecycle_stage, effect_type)
      VALUES (NEW.id, NEW.venture_id, NEW.lifecycle_stage, 'vision_unarchive')
      ON CONFLICT (decision_id, effect_type) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Modify enforce_vision_quality_on_advancement: check bypass variable before blocking
CREATE OR REPLACE FUNCTION enforce_vision_quality_on_advancement()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow bypass when chairman approval trigger is coordinating within the same transaction
  IF current_setting('leo.chairman_approval_bypass', true) = 'true' THEN
    RAISE NOTICE 'enforce_vision_quality_on_advancement: bypass active (chairman approval side-effect), allowing status transition for vision_key=%', NEW.vision_key;
    RETURN NEW;
  END IF;

  -- Block status change to 'active' if quality not checked
  IF NEW.status = 'active' AND (OLD.status IS DISTINCT FROM 'active') AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot set vision status to active: quality_checked is false. Vision content does not meet minimum quality thresholds. Check quality_issues for details. (vision_key: %)', NEW.vision_key;
  END IF;

  -- Block chairman approval if quality not checked
  IF NEW.chairman_approved = true AND OLD.chairman_approved = false AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot approve vision: quality_checked is false. Vision content does not meet minimum quality thresholds. Check quality_issues for details. (vision_key: %)', NEW.vision_key;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create RPC wrapper for worker TTL fallback path
-- Replaces direct Supabase UPDATE in stage-execution-worker.js (lines 740-744)
CREATE OR REPLACE FUNCTION rpc_activate_vision_with_bypass(
  p_venture_id UUID,
  p_vision_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_affected INT;
BEGIN
  -- Set transaction-scoped bypass variable
  PERFORM set_config('leo.chairman_approval_bypass', 'true', true);

  -- Update vision status from archived to active
  UPDATE eva_vision_documents
  SET status = 'active', updated_at = NOW()
  WHERE venture_id = p_venture_id
    AND vision_key = p_vision_key
    AND status = 'archived';

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  IF v_affected = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No archived vision found for venture_id=' || p_venture_id || ' vision_key=' || p_vision_key,
      'affected_rows', 0
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'affected_rows', v_affected
  );
END;
$$;
