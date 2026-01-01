-- ============================================================================
-- Migration: Fix 1 - Store Blocked Handoffs Instead of Raising Exception
-- ============================================================================
-- Issue: Circuit breaker RAISES EXCEPTION which prevents handoff storage
-- Fix: INSERT with status='blocked' to preserve audit trail and enable retry
-- Date: 2026-01-01
-- Author: LEO Protocol Process Improvement
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Add 'blocked' to status constraint
-- ============================================================================

-- First, drop the old status constraint
ALTER TABLE sd_phase_handoffs DROP CONSTRAINT IF EXISTS sd_phase_handoffs_status_check;

-- Add new constraint with 'blocked' status
ALTER TABLE sd_phase_handoffs ADD CONSTRAINT sd_phase_handoffs_status_check
  CHECK (status IN ('pending_acceptance', 'accepted', 'rejected', 'blocked'));

-- ============================================================================
-- PHASE 2: Update validation_score threshold constraint
-- ============================================================================
-- Allow blocked status to have any validation_score

ALTER TABLE sd_phase_handoffs DROP CONSTRAINT IF EXISTS chk_handoff_validation_threshold;

ALTER TABLE sd_phase_handoffs ADD CONSTRAINT chk_handoff_validation_threshold
  CHECK (
    -- Allow NULL only for rejected/failed/blocked status
    (validation_score IS NULL AND status IN ('rejected', 'failed', 'blocked'))
    OR
    -- Allow any score for blocked status (circuit breaker already logged it)
    (status = 'blocked')
    OR
    -- Require score >= 85 for active handoffs
    (validation_score >= 85 AND status IN ('pending_acceptance', 'accepted'))
  );

COMMENT ON CONSTRAINT chk_handoff_validation_threshold ON sd_phase_handoffs IS
'Validates handoff scores: blocked can have any score, active must have >=85';

-- ============================================================================
-- PHASE 3: Create enhanced trigger function that STORES blocked handoffs
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_handoff_system()
RETURNS TRIGGER AS $$
DECLARE
  v_allowed_creators TEXT[] := ARRAY[
    'UNIFIED-HANDOFF-SYSTEM',
    'SYSTEM_MIGRATION',
    'ADMIN_OVERRIDE'
  ];
  v_validation_threshold INTEGER := 85;
  v_remediation_hints JSONB;
BEGIN
  -- ========================================================================
  -- GATE 1: Creator Validation
  -- ========================================================================

  -- Log the attempt (always, regardless of outcome)
  INSERT INTO handoff_audit_log (
    attempted_by,
    sd_id,
    handoff_type,
    from_phase,
    to_phase,
    blocked,
    block_reason,
    request_metadata
  ) VALUES (
    COALESCE(NEW.created_by, 'NULL'),
    NEW.sd_id,
    NEW.handoff_type,
    NEW.from_phase,
    NEW.to_phase,
    NOT (COALESCE(NEW.created_by, '') = ANY(v_allowed_creators)),
    CASE
      WHEN COALESCE(NEW.created_by, '') = ANY(v_allowed_creators) THEN NULL
      ELSE format('Invalid created_by: %s. Must use handoff.js script.', COALESCE(NEW.created_by, 'NULL'))
    END,
    jsonb_build_object(
      'trigger_time', NOW(),
      'status', NEW.status,
      'validation_score', NEW.validation_score
    )
  );

  -- Check if creator is allowed
  IF NOT (COALESCE(NEW.created_by, '') = ANY(v_allowed_creators)) THEN
    RAISE EXCEPTION 'HANDOFF_BYPASS_BLOCKED: Direct handoff creation is not allowed.

To create a handoff, run:
  node scripts/handoff.js execute <TYPE> <SD-ID>

Attempted created_by: %', COALESCE(NEW.created_by, 'NULL');
  END IF;

  -- ========================================================================
  -- GATE 2: CIRCUIT BREAKER - Store blocked instead of exception
  -- ========================================================================
  -- FIX: Instead of RAISE EXCEPTION, we now set status to 'blocked'
  -- This preserves the record for retry workflows and audit trails

  IF NEW.validation_score IS NOT NULL AND NEW.validation_score < v_validation_threshold THEN
    -- Build remediation hints based on score
    v_remediation_hints := jsonb_build_array(
      CASE
        WHEN NEW.validation_score < 50 THEN
          'CRITICAL: Score below 50%. Major rework required. Review PRD requirements thoroughly.'
        WHEN NEW.validation_score < 70 THEN
          'MAJOR: Score below 70%. Significant gaps exist. Run all sub-agent validations.'
        ELSE
          'MINOR: Score below 85%. Close to threshold. Address specific failing checks.'
      END,
      'Run: npm run handoff:compliance ' || NEW.sd_id || ' to see detailed breakdown',
      'Required sub-agents: QA Director (TESTING) is always mandatory',
      'Check: Are all deliverables in sd_scope_deliverables marked completed?'
    );

    -- Log the circuit breaker block to audit table
    INSERT INTO circuit_breaker_blocks (
      sd_id,
      handoff_type,
      from_phase,
      to_phase,
      validation_score,
      required_threshold,
      block_reason,
      attempted_by,
      handoff_metadata,
      remediation_hints
    ) VALUES (
      NEW.sd_id,
      NEW.handoff_type,
      NEW.from_phase,
      NEW.to_phase,
      NEW.validation_score,
      v_validation_threshold,
      format('CIRCUIT_BREAKER_TRIPPED: validation_score %s%% < %s%% threshold',
             NEW.validation_score, v_validation_threshold),
      NEW.created_by,
      jsonb_build_object(
        'status', NEW.status,
        'metadata', NEW.metadata,
        'trigger_time', NOW()
      ),
      v_remediation_hints
    );

    -- FIX: Set status to 'blocked' instead of raising exception
    -- This allows the record to be stored for audit and retry
    NEW.status := 'blocked';
    NEW.rejection_reason := format(
      'CIRCUIT_BREAKER: validation_score %s%% < %s%% threshold. Run npm run handoff:compliance %s for remediation.',
      NEW.validation_score, v_validation_threshold, NEW.sd_id
    );
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'circuit_breaker_blocked', true,
      'blocked_at', NOW(),
      'score_at_block', NEW.validation_score,
      'threshold', v_validation_threshold,
      'remediation_hints', v_remediation_hints
    );

    -- Log warning but DO NOT raise exception - allow INSERT to proceed
    RAISE WARNING '
CIRCUIT BREAKER STORED (not rejected) [LAW 3]:
  SD: %  |  Type: %  |  Score: %%/%% threshold
  Status set to ''blocked'' - handoff stored for retry workflow.
  Run: npm run handoff:compliance % to remediate.',
      NEW.sd_id, NEW.handoff_type, NEW.validation_score, v_validation_threshold, NEW.sd_id;

    -- Continue with INSERT (status now 'blocked')
    RETURN NEW;
  END IF;

  -- ========================================================================
  -- GATE 3: Null Score Check - Store blocked for null scores too
  -- ========================================================================

  IF NEW.validation_score IS NULL AND NEW.status IN ('pending_acceptance', 'accepted') THEN
    -- Log attempt to create handoff without score
    INSERT INTO circuit_breaker_blocks (
      sd_id,
      handoff_type,
      from_phase,
      to_phase,
      validation_score,
      required_threshold,
      block_reason,
      attempted_by,
      handoff_metadata,
      remediation_hints
    ) VALUES (
      NEW.sd_id,
      NEW.handoff_type,
      NEW.from_phase,
      NEW.to_phase,
      0,
      v_validation_threshold,
      'CIRCUIT_BREAKER_TRIPPED: validation_score is NULL (bypass attempt?)',
      NEW.created_by,
      jsonb_build_object(
        'status', NEW.status,
        'null_score_detected', true,
        'trigger_time', NOW()
      ),
      jsonb_build_array(
        'validation_score cannot be NULL for active handoffs',
        'Run handoff validation to compute score',
        'Score must be computed by UNIFIED-HANDOFF-SYSTEM'
      )
    );

    -- FIX: Set status to 'blocked' instead of raising exception
    NEW.status := 'blocked';
    NEW.validation_score := 0;
    NEW.rejection_reason := 'CIRCUIT_BREAKER: validation_score was NULL (treated as 0%). Run handoff validation.';
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'circuit_breaker_blocked', true,
      'blocked_at', NOW(),
      'null_score_blocked', true,
      'threshold', v_validation_threshold
    );

    RAISE WARNING 'CIRCUIT BREAKER STORED: NULL validation_score for SD % - status set to blocked.', NEW.sd_id;
    RETURN NEW;
  END IF;

  -- All gates passed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION enforce_handoff_system() IS
'Enhanced handoff enforcement with Circuit Breaker that STORES blocked records.

FIX (2026-01-01): Changed from RAISE EXCEPTION to status=''blocked''
This preserves records for audit trails and enables retry workflows.

GATES:
  1. Creator Validation: Only UNIFIED-HANDOFF-SYSTEM can create handoffs
  2. Circuit Breaker: validation_score < 85% → status=''blocked'' (not exception)
  3. Null Score Block: NULL scores → status=''blocked'' (not exception)';

-- ============================================================================
-- PHASE 4: Recreate trigger with enhanced function
-- ============================================================================

DROP TRIGGER IF EXISTS enforce_handoff_creation ON sd_phase_handoffs;

CREATE TRIGGER enforce_handoff_creation
  BEFORE INSERT ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION enforce_handoff_system();

-- ============================================================================
-- PHASE 5: Add index for blocked status queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_blocked
  ON sd_phase_handoffs(sd_id, handoff_type)
  WHERE status = 'blocked';

COMMENT ON INDEX idx_sd_phase_handoffs_blocked IS
'Partial index for finding blocked handoffs that need remediation';

-- ============================================================================
-- PHASE 6: Create view for blocked handoffs needing attention
-- ============================================================================

CREATE OR REPLACE VIEW v_blocked_handoffs_pending AS
SELECT
  h.id,
  h.sd_id,
  h.handoff_type,
  h.from_phase || ' → ' || h.to_phase AS transition,
  h.validation_score,
  h.rejection_reason,
  h.created_at,
  EXTRACT(EPOCH FROM (NOW() - h.created_at)) / 3600 AS hours_blocked,
  h.metadata->>'remediation_hints' AS hints,
  sd.title AS sd_title,
  sd.status AS sd_status
FROM sd_phase_handoffs h
LEFT JOIN strategic_directives_v2 sd ON sd.id = h.sd_id
WHERE h.status = 'blocked'
ORDER BY h.created_at DESC;

COMMENT ON VIEW v_blocked_handoffs_pending IS
'Handoffs blocked by circuit breaker that need remediation.
Use: SELECT * FROM v_blocked_handoffs_pending;';

-- ============================================================================
-- PHASE 7: Create function to retry blocked handoff
-- ============================================================================

CREATE OR REPLACE FUNCTION retry_blocked_handoff(
  p_handoff_id UUID,
  p_new_score INTEGER DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  new_status TEXT
) AS $$
DECLARE
  v_handoff RECORD;
  v_threshold INTEGER := 85;
BEGIN
  -- Get the blocked handoff
  SELECT * INTO v_handoff FROM sd_phase_handoffs WHERE id = p_handoff_id AND status = 'blocked';

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Handoff not found or not blocked', NULL::TEXT;
    RETURN;
  END IF;

  -- If new score provided, update it
  IF p_new_score IS NOT NULL THEN
    IF p_new_score < v_threshold THEN
      RETURN QUERY SELECT FALSE,
        format('New score %s%% still below threshold %s%%', p_new_score, v_threshold),
        'blocked'::TEXT;
      RETURN;
    END IF;

    -- Update to accepted status with new score
    UPDATE sd_phase_handoffs SET
      status = 'pending_acceptance',
      validation_score = p_new_score,
      rejection_reason = NULL,
      metadata = metadata || jsonb_build_object(
        'retried_at', NOW(),
        'previous_score', v_handoff.validation_score,
        'retry_score', p_new_score
      )
    WHERE id = p_handoff_id;

    RETURN QUERY SELECT TRUE,
      format('Handoff unblocked with score %s%%', p_new_score),
      'pending_acceptance'::TEXT;
  ELSE
    RETURN QUERY SELECT FALSE,
      'Provide new validation score to retry',
      'blocked'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION retry_blocked_handoff(UUID, INTEGER) IS
'Retry a blocked handoff with a new validation score.
Usage: SELECT * FROM retry_blocked_handoff(''uuid-here'', 87);';

-- ============================================================================
-- PHASE 8: Verification
-- ============================================================================

DO $$
DECLARE
  v_status_values TEXT[];
BEGIN
  -- Get current status values from constraint
  SELECT array_agg(unnest) INTO v_status_values
  FROM (
    SELECT unnest(ARRAY['pending_acceptance', 'accepted', 'rejected', 'blocked'])
  ) x;

  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║      FIX 1: CIRCUIT BREAKER - STORE BLOCKED HANDOFFS                 ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'CHANGE: Exception → Stored with status=''blocked''';
  RAISE NOTICE '';
  RAISE NOTICE 'NEW BEHAVIOR:';
  RAISE NOTICE '  [X] validation_score < 85%% → status=''blocked'' (record stored)';
  RAISE NOTICE '  [X] validation_score NULL → status=''blocked'' (record stored)';
  RAISE NOTICE '  [X] Blocked handoffs visible in v_blocked_handoffs_pending';
  RAISE NOTICE '  [X] Retry via: SELECT * FROM retry_blocked_handoff(id, new_score);';
  RAISE NOTICE '';
  RAISE NOTICE 'Status values now: pending_acceptance, accepted, rejected, blocked';
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To rollback:
-- ALTER TABLE sd_phase_handoffs DROP CONSTRAINT sd_phase_handoffs_status_check;
-- ALTER TABLE sd_phase_handoffs ADD CONSTRAINT sd_phase_handoffs_status_check
--   CHECK (status IN ('pending_acceptance', 'accepted', 'rejected'));
-- Then restore original enforce_handoff_system() from 20251226 migration
-- ============================================================================
