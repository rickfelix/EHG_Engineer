-- ============================================================================
-- Migration: Fix format() Trigger Error in auto_complete_sd_deliverables
-- ============================================================================
-- Purpose: Replace format() function calls with string concatenation to fix
--          "unrecognized format() type specifier '.'" error when handling UUIDs
--
-- Root Cause: PostgreSQL's format() with %s specifier can misinterpret
--             UUID characters as format specifiers (the '.' in UUID)
--
-- Solution: Use || string concatenation instead of format()
--
-- Date: 2025-12-02
-- Related: SD-BLUEPRINT-UI-001 handoff process
-- ============================================================================

-- Drop existing function and recreate with fixed logic
CREATE OR REPLACE FUNCTION auto_complete_sd_deliverables()
RETURNS TRIGGER AS $$
DECLARE
  deliverable_count INTEGER;
  updated_count INTEGER;
BEGIN
  -- Only proceed if this is an EXEC-TO-PLAN handoff being accepted
  IF NEW.handoff_type = 'EXEC-TO-PLAN' AND NEW.status = 'accepted' AND
     (OLD.status IS NULL OR OLD.status != 'accepted') THEN

    -- Count pending deliverables before update
    SELECT COUNT(*) INTO deliverable_count
    FROM sd_scope_deliverables
    WHERE sd_id = NEW.sd_id
    AND priority IN ('required', 'high')
    AND completion_status != 'completed';

    -- If there are pending deliverables, complete them
    IF deliverable_count > 0 THEN
      UPDATE sd_scope_deliverables
      SET
        completion_status = 'completed',
        verified_by = 'PLAN',  -- PLAN agent verified by accepting handoff
        verified_at = NOW(),
        -- FIX: Use string concatenation instead of format() to avoid UUID parsing issues
        completion_evidence = 'EXEC-TO-PLAN handoff ' || NEW.id::text || ' accepted',
        completion_notes = 'Auto-completed by database trigger on handoff acceptance. Handoff ID: ' || NEW.id::text || ', Accepted at: ' || NOW()::text,
        updated_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'auto_completed', true,
          'auto_completed_at', NOW(),
          'trigger', 'auto_complete_sd_deliverables',
          'handoff_id', NEW.id,
          'handoff_type', NEW.handoff_type,
          'verification_tier', 'TRIGGER_HANDOFF_ACCEPTED',
          'confidence', 100
        )
      WHERE sd_id = NEW.sd_id
      AND priority IN ('required', 'high')
      AND completion_status != 'completed';

      GET DIAGNOSTICS updated_count = ROW_COUNT;

      -- Log the auto-completion
      RAISE NOTICE 'Auto-completed % deliverables for SD % on EXEC-TO-PLAN handoff acceptance',
        updated_count, NEW.sd_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON FUNCTION auto_complete_sd_deliverables() IS
  'LEO Protocol: Auto-completes sd_scope_deliverables when EXEC-TO-PLAN handoff is accepted.
   This ensures deliverables tracking stays in sync with actual verification events.
   Confidence: 100% (handoff acceptance is definitive proof of work completion).

   FIX (2025-12-02): Replaced format() with string concatenation to avoid UUID parsing errors.';

-- Verify the function was updated
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'auto_complete_sd_deliverables'
  ) THEN
    RAISE NOTICE 'Function auto_complete_sd_deliverables updated successfully';
  ELSE
    RAISE EXCEPTION 'Function update failed';
  END IF;
END $$;
