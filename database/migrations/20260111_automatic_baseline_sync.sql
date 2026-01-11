-- Migration: Automatic Baseline Sync for Strategic Directives
-- SD: SD-BASELINE-SYNC-001
-- Purpose: Automatically sync SD creation/completion to active baseline
--
-- This migration creates:
-- 1. fn_sync_sd_to_baseline() - Function to handle sync logic
-- 2. tr_sd_baseline_sync - Trigger on strategic_directives_v2

-- ============================================================================
-- FUNCTION: Sync SD to Baseline
-- ============================================================================
-- Handles two scenarios:
-- 1. INSERT: Add new SD to active baseline with status 'planned'
-- 2. UPDATE to completed: Update baseline item progress to 100%

CREATE OR REPLACE FUNCTION fn_sync_sd_to_baseline()
RETURNS TRIGGER AS $$
DECLARE
  v_active_baseline_id UUID;
  v_baseline_item_exists BOOLEAN;
BEGIN
  -- -------------------------------------------------------------------------
  -- Get the active baseline (if any)
  -- -------------------------------------------------------------------------
  SELECT id INTO v_active_baseline_id
  FROM sd_execution_baselines
  WHERE is_active = true
  LIMIT 1;

  -- If no active baseline, log warning and exit gracefully
  -- This allows SD creation to succeed even without a baseline
  IF v_active_baseline_id IS NULL THEN
    RAISE NOTICE 'fn_sync_sd_to_baseline: No active baseline found. SD % not auto-synced.', NEW.id;
    RETURN NEW;
  END IF;

  -- -------------------------------------------------------------------------
  -- SCENARIO 1: New SD Created (INSERT)
  -- -------------------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    -- Check if item already exists (idempotency)
    SELECT EXISTS(
      SELECT 1 FROM sd_baseline_items
      WHERE baseline_id = v_active_baseline_id
        AND sd_key = NEW.id
    ) INTO v_baseline_item_exists;

    IF NOT v_baseline_item_exists THEN
      -- Add new SD to baseline
      INSERT INTO sd_baseline_items (
        baseline_id,
        sd_key,
        title,
        track,
        sequence,
        status,
        current_phase,
        progress_percentage,
        created_at
      ) VALUES (
        v_active_baseline_id,
        NEW.id,
        NEW.title,
        COALESCE(NEW.track, 'B'),  -- Default to Track B (Features)
        COALESCE(
          (SELECT MAX(sequence) + 1 FROM sd_baseline_items WHERE baseline_id = v_active_baseline_id),
          1
        ),
        'planned',
        COALESCE(NEW.phase, 'LEAD_REVIEW'),
        0,
        NOW()
      );

      RAISE NOTICE 'fn_sync_sd_to_baseline: Added SD % to baseline %', NEW.id, v_active_baseline_id;
    END IF;

    RETURN NEW;
  END IF;

  -- -------------------------------------------------------------------------
  -- SCENARIO 2: SD Status Changed (UPDATE)
  -- -------------------------------------------------------------------------
  IF TG_OP = 'UPDATE' THEN
    -- Only sync if status changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN

      -- Handle completion
      IF NEW.status = 'completed' THEN
        UPDATE sd_baseline_items
        SET
          status = 'completed',
          progress_percentage = 100,
          completed_at = NOW(),
          current_phase = 'COMPLETED'
        WHERE baseline_id = v_active_baseline_id
          AND sd_key = NEW.id;

        RAISE NOTICE 'fn_sync_sd_to_baseline: Marked SD % as completed in baseline', NEW.id;

      -- Handle reactivation (completed -> active/planning)
      ELSIF OLD.status = 'completed' AND NEW.status IN ('active', 'planning', 'in_progress') THEN
        UPDATE sd_baseline_items
        SET
          status = 'in_progress',
          progress_percentage = LEAST(progress_percentage, 90),
          completed_at = NULL,
          current_phase = NEW.phase
        WHERE baseline_id = v_active_baseline_id
          AND sd_key = NEW.id;

        RAISE NOTICE 'fn_sync_sd_to_baseline: Reactivated SD % in baseline', NEW.id;

      -- Handle status change to active/in_progress
      ELSIF NEW.status IN ('active', 'in_progress') THEN
        UPDATE sd_baseline_items
        SET
          status = 'in_progress',
          current_phase = NEW.phase
        WHERE baseline_id = v_active_baseline_id
          AND sd_key = NEW.id;
      END IF;
    END IF;

    -- Sync phase changes
    IF OLD.phase IS DISTINCT FROM NEW.phase THEN
      UPDATE sd_baseline_items
      SET current_phase = NEW.phase
      WHERE baseline_id = v_active_baseline_id
        AND sd_key = NEW.id;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER: Auto-sync on SD changes
-- ============================================================================

-- Drop existing trigger if exists (idempotent)
DROP TRIGGER IF EXISTS tr_sd_baseline_sync ON strategic_directives_v2;

-- Create trigger
CREATE TRIGGER tr_sd_baseline_sync
  AFTER INSERT OR UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_sd_to_baseline();

-- ============================================================================
-- COMMENTS for documentation
-- ============================================================================

COMMENT ON FUNCTION fn_sync_sd_to_baseline() IS
'Automatically syncs Strategic Directive changes to the active baseline.
- INSERT: Adds new SD to active baseline with status "planned"
- UPDATE (status=completed): Sets baseline item to 100% progress
- UPDATE (phase change): Syncs current_phase to baseline item
- Graceful degradation: Logs warning if no active baseline exists
Created by SD-BASELINE-SYNC-001';

COMMENT ON TRIGGER tr_sd_baseline_sync ON strategic_directives_v2 IS
'Fires fn_sync_sd_to_baseline() on INSERT/UPDATE to keep baseline in sync.
Created by SD-BASELINE-SYNC-001';

-- ============================================================================
-- VERIFICATION: Show created objects
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Complete: Automatic Baseline Sync';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Function: fn_sync_sd_to_baseline()';
  RAISE NOTICE 'Trigger: tr_sd_baseline_sync';
  RAISE NOTICE '';
  RAISE NOTICE 'To test:';
  RAISE NOTICE '1. Create a new SD and verify it appears in baseline';
  RAISE NOTICE '2. Mark SD as completed and verify baseline updates';
  RAISE NOTICE '========================================';
END $$;
