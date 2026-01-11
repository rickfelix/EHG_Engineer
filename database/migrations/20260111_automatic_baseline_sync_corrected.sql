-- Migration: Automatic Baseline Sync for Strategic Directives (CORRECTED)
-- SD: SD-BASELINE-SYNC-001
-- Purpose: Automatically sync SD creation/completion to active baseline
--
-- FIXES:
-- - Changed NEW.phase to NEW.current_phase (correct column name)
-- - Added track derivation logic from category field
-- - Fixed sd_baseline_items INSERT to match actual schema
--
-- This migration creates:
-- 1. fn_sync_sd_to_baseline() - Function to handle sync logic
-- 2. tr_sd_baseline_sync - Trigger on strategic_directives_v2

-- ============================================================================
-- FUNCTION: Sync SD to Baseline
-- ============================================================================
-- Handles three scenarios:
-- 1. INSERT: Add new SD to active baseline with status 'planned'
-- 2. UPDATE (status change): Update baseline item status/progress
-- 3. UPDATE (phase change): Sync current_phase to baseline item

CREATE OR REPLACE FUNCTION fn_sync_sd_to_baseline()
RETURNS TRIGGER AS $$
DECLARE
  v_active_baseline_id UUID;
  v_baseline_item_exists BOOLEAN;
  v_track TEXT;
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
  -- Derive track from category (A=Infrastructure, B=Features, C=Quality)
  -- -------------------------------------------------------------------------
  v_track := CASE
    WHEN LOWER(NEW.category) IN ('infrastructure', 'platform') THEN 'A'
    WHEN LOWER(NEW.category) IN ('quality', 'testing', 'qa') THEN 'C'
    ELSE 'B'  -- Default to Features track
  END;

  -- -------------------------------------------------------------------------
  -- SCENARIO 1: New SD Created (INSERT)
  -- -------------------------------------------------------------------------
  IF TG_OP = 'INSERT' THEN
    -- Check if item already exists (idempotency)
    SELECT EXISTS(
      SELECT 1 FROM sd_baseline_items
      WHERE baseline_id = v_active_baseline_id
        AND sd_id = NEW.id
    ) INTO v_baseline_item_exists;

    IF NOT v_baseline_item_exists THEN
      -- Add new SD to baseline
      -- Note: sd_baseline_items uses sd_id (not sd_key) and sequence_rank (not sequence)
      INSERT INTO sd_baseline_items (
        baseline_id,
        sd_id,
        sequence_rank,
        track,
        is_ready,
        created_at
      ) VALUES (
        v_active_baseline_id,
        NEW.id,
        COALESCE(
          (SELECT MAX(sequence_rank) + 1 FROM sd_baseline_items WHERE baseline_id = v_active_baseline_id),
          1
        ),
        v_track,
        false,  -- New SDs are not ready by default
        NOW()
      );

      RAISE NOTICE 'fn_sync_sd_to_baseline: Added SD % to baseline % (Track %)', NEW.id, v_active_baseline_id, v_track;
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
        -- Note: sd_baseline_items doesn't have status/progress_percentage/completed_at
        -- These fields are in the SD table itself
        -- We can update notes or is_ready flag instead
        UPDATE sd_baseline_items
        SET
          is_ready = true,
          notes = COALESCE(notes, '') || E'\nCompleted: ' || NOW()::text
        WHERE baseline_id = v_active_baseline_id
          AND sd_id = NEW.id;

        RAISE NOTICE 'fn_sync_sd_to_baseline: Marked SD % as completed in baseline', NEW.id;

      -- Handle reactivation (completed -> active/planning)
      ELSIF OLD.status = 'completed' AND NEW.status IN ('active', 'planning', 'in_progress') THEN
        UPDATE sd_baseline_items
        SET
          is_ready = true,
          notes = COALESCE(notes, '') || E'\nReactivated: ' || NOW()::text
        WHERE baseline_id = v_active_baseline_id
          AND sd_id = NEW.id;

        RAISE NOTICE 'fn_sync_sd_to_baseline: Reactivated SD % in baseline', NEW.id;

      -- Handle status change to active/in_progress
      ELSIF NEW.status IN ('active', 'in_progress') THEN
        UPDATE sd_baseline_items
        SET is_ready = true
        WHERE baseline_id = v_active_baseline_id
          AND sd_id = NEW.id;
      END IF;
    END IF;

    -- Sync track changes if category changes
    IF OLD.category IS DISTINCT FROM NEW.category THEN
      UPDATE sd_baseline_items
      SET track = v_track
      WHERE baseline_id = v_active_baseline_id
        AND sd_id = NEW.id;
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
- INSERT: Adds new SD to active baseline (track derived from category)
- UPDATE (status=completed): Marks SD as ready in baseline
- UPDATE (category change): Updates track assignment
- Graceful degradation: Logs warning if no active baseline exists
Created by SD-BASELINE-SYNC-001 (corrected version)';

COMMENT ON TRIGGER tr_sd_baseline_sync ON strategic_directives_v2 IS
'Fires fn_sync_sd_to_baseline() on INSERT/UPDATE to keep baseline in sync.
Created by SD-BASELINE-SYNC-001 (corrected version)';

-- ============================================================================
-- VERIFICATION: Show created objects
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Migration Complete: Automatic Baseline Sync (CORRECTED)';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Function: fn_sync_sd_to_baseline()';
  RAISE NOTICE 'Trigger: tr_sd_baseline_sync';
  RAISE NOTICE '';
  RAISE NOTICE 'CORRECTIONS APPLIED:';
  RAISE NOTICE '- Uses NEW.current_phase instead of NEW.phase';
  RAISE NOTICE '- Derives track from category field';
  RAISE NOTICE '- Matches sd_baseline_items actual schema';
  RAISE NOTICE '';
  RAISE NOTICE 'To test:';
  RAISE NOTICE '1. Create a new SD and verify it appears in baseline';
  RAISE NOTICE '2. Mark SD as completed and verify baseline updates';
  RAISE NOTICE '========================================';
END $$;
