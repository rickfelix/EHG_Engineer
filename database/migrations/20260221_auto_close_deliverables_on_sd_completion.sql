-- Migration: Auto-close scope deliverables when linked SD completes
-- SD: SD-LEO-INFRA-AUTO-CLOSE-SCOPE-001
-- Pattern: Follows fn_auto_close_feedback_on_sd_completion (20260207)
--
-- Problem: 19/20 completed SDs have scope deliverables stuck in 'pending'.
-- Existing auto-completion fires at EXEC-TO-PLAN handoff, GitHub merge,
-- and Orchestrator Guardian — but NOT on SD completion itself.
-- This trigger closes that gap.

-- ============================================================================
-- Trigger function: auto-close pending deliverables on SD completion
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_auto_close_deliverables_on_sd_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Only fire when SD transitions TO completed status
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    UPDATE sd_scope_deliverables
    SET
      completion_status = 'completed',
      completion_notes = COALESCE(completion_notes, '') ||
        CASE WHEN completion_notes IS NOT NULL AND completion_notes != '' THEN '; ' ELSE '' END ||
        'Auto-completed: parent SD ' || COALESCE(NEW.sd_key, NEW.id::text) || ' reached completed status',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_completed_at', NOW()::text,
        'trigger', 'SD_COMPLETION',
        'previous_status', completion_status
      ),
      updated_at = NOW()
    WHERE sd_id = NEW.id
      AND completion_status NOT IN ('completed', 'skipped');

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count > 0 THEN
      RAISE NOTICE 'Auto-closed % deliverables for SD % (%)', v_updated_count, NEW.sd_key, NEW.id;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Non-blocking: log warning but don't prevent SD completion
  RAISE WARNING 'fn_auto_close_deliverables_on_sd_completion failed for SD %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS trg_auto_close_deliverables_on_sd_completion ON strategic_directives_v2;

CREATE TRIGGER trg_auto_close_deliverables_on_sd_completion
  AFTER UPDATE ON strategic_directives_v2
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION fn_auto_close_deliverables_on_sd_completion();

-- ============================================================================
-- Backfill: Close orphaned pending deliverables for already-completed SDs
-- ============================================================================

UPDATE sd_scope_deliverables d
SET
  completion_status = 'completed',
  completion_notes = COALESCE(d.completion_notes, '') ||
    CASE WHEN d.completion_notes IS NOT NULL AND d.completion_notes != '' THEN '; ' ELSE '' END ||
    'Backfill: parent SD ' || COALESCE(sd.sd_key, sd.id::text) || ' was already completed',
  metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object(
    'auto_completed_at', NOW()::text,
    'trigger', 'BACKFILL_SD_COMPLETION',
    'previous_status', d.completion_status
  ),
  updated_at = NOW()
FROM strategic_directives_v2 sd
WHERE d.sd_id = sd.id
  AND sd.status = 'completed'
  AND d.completion_status NOT IN ('completed', 'skipped');
