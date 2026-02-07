-- Migration: Auto-close feedback when linked SD or QF completes
-- SD: SD-LEO-INFRA-AUTO-CLOSE-FEEDBACK-001
-- Gaps addressed: GAP-004 (SD auto-close), GAP-013 (QF auto-close), GAP-005 (retro linkage)
--
-- This migration creates database triggers that automatically resolve
-- feedback items when their linked SD or Quick-Fix completes.

-- ============================================================================
-- GAP-004: Auto-close feedback when linked SD completes
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_auto_close_feedback_on_sd_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when SD transitions TO completed status
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Close all feedback linked via strategic_directive_id FK
    UPDATE feedback
    SET
      status = 'resolved',
      resolution_type = 'sd_completed',
      resolution_notes = COALESCE(resolution_notes, '') ||
        CASE WHEN resolution_notes IS NOT NULL AND resolution_notes != '' THEN '; ' ELSE '' END ||
        'Auto-resolved: linked SD ' || COALESCE(NEW.sd_key, NEW.id::text) || ' completed',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE strategic_directive_id = NEW.id
      AND status NOT IN ('resolved', 'wont_fix', 'shipped');

    -- Also close feedback linked via resolution_sd_id (legacy linkage)
    UPDATE feedback
    SET
      status = 'resolved',
      resolution_type = 'sd_completed',
      resolution_notes = COALESCE(resolution_notes, '') ||
        CASE WHEN resolution_notes IS NOT NULL AND resolution_notes != '' THEN '; ' ELSE '' END ||
        'Auto-resolved: linked SD ' || COALESCE(NEW.sd_key, NEW.id::text) || ' completed',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE resolution_sd_id = NEW.id
      AND status NOT IN ('resolved', 'wont_fix', 'shipped');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS trg_auto_close_feedback_on_sd_completion ON strategic_directives_v2;

CREATE TRIGGER trg_auto_close_feedback_on_sd_completion
  AFTER UPDATE ON strategic_directives_v2
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION fn_auto_close_feedback_on_sd_completion();

-- ============================================================================
-- GAP-013: Auto-close feedback when linked Quick-Fix completes
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_auto_close_feedback_on_qf_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when QF transitions TO completed/shipped status
  IF NEW.status IN ('completed', 'shipped') AND (OLD.status IS NULL OR OLD.status NOT IN ('completed', 'shipped')) THEN
    UPDATE feedback
    SET
      status = 'resolved',
      resolution_type = 'quick_fix_completed',
      resolution_notes = COALESCE(resolution_notes, '') ||
        CASE WHEN resolution_notes IS NOT NULL AND resolution_notes != '' THEN '; ' ELSE '' END ||
        'Auto-resolved: linked Quick-Fix ' || COALESCE(NEW.title, NEW.id::text) || ' completed',
      resolved_at = NOW(),
      updated_at = NOW()
    WHERE quick_fix_id = NEW.id
      AND status NOT IN ('resolved', 'wont_fix', 'shipped');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS trg_auto_close_feedback_on_qf_completion ON quick_fixes;

CREATE TRIGGER trg_auto_close_feedback_on_qf_completion
  AFTER UPDATE ON quick_fixes
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'shipped') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_auto_close_feedback_on_qf_completion();

-- ============================================================================
-- Backfill: Resolve orphaned feedback where linked SD already completed
-- ============================================================================

-- Backfill feedback linked via strategic_directive_id to completed SDs
UPDATE feedback f
SET
  status = 'resolved',
  resolution_type = 'sd_completed',
  resolution_notes = COALESCE(f.resolution_notes, '') ||
    CASE WHEN f.resolution_notes IS NOT NULL AND f.resolution_notes != '' THEN '; ' ELSE '' END ||
    'Backfill: linked SD ' || COALESCE(sd.sd_key, sd.id::text) || ' was already completed',
  resolved_at = NOW(),
  updated_at = NOW()
FROM strategic_directives_v2 sd
WHERE f.strategic_directive_id = sd.id
  AND sd.status = 'completed'
  AND f.status NOT IN ('resolved', 'wont_fix', 'shipped');

-- Backfill feedback linked via resolution_sd_id to completed SDs
UPDATE feedback f
SET
  status = 'resolved',
  resolution_type = 'sd_completed',
  resolution_notes = COALESCE(f.resolution_notes, '') ||
    CASE WHEN f.resolution_notes IS NOT NULL AND f.resolution_notes != '' THEN '; ' ELSE '' END ||
    'Backfill: linked SD ' || COALESCE(sd.sd_key, sd.id::text) || ' was already completed',
  resolved_at = NOW(),
  updated_at = NOW()
FROM strategic_directives_v2 sd
WHERE f.resolution_sd_id = sd.id
  AND sd.status = 'completed'
  AND f.status NOT IN ('resolved', 'wont_fix', 'shipped');

-- Backfill feedback linked via quick_fix_id to completed QFs
UPDATE feedback f
SET
  status = 'resolved',
  resolution_type = 'quick_fix_completed',
  resolution_notes = COALESCE(f.resolution_notes, '') ||
    CASE WHEN f.resolution_notes IS NOT NULL AND f.resolution_notes != '' THEN '; ' ELSE '' END ||
    'Backfill: linked Quick-Fix ' || COALESCE(qf.title, qf.id::text) || ' was already completed',
  resolved_at = NOW(),
  updated_at = NOW()
FROM quick_fixes qf
WHERE f.quick_fix_id = qf.id
  AND qf.status IN ('completed', 'shipped')
  AND f.status NOT IN ('resolved', 'wont_fix', 'shipped');

-- ============================================================================
-- Backfill: Set strategic_directive_id from metadata.source_id for old records
-- (GAP-001 remediation for existing data)
-- ============================================================================

UPDATE feedback f
SET
  strategic_directive_id = sd.id,
  updated_at = NOW()
FROM strategic_directives_v2 sd
WHERE f.strategic_directive_id IS NULL
  AND sd.metadata->>'source' = 'feedback'
  AND sd.metadata->>'source_id' = f.id::text
  AND f.status NOT IN ('resolved', 'wont_fix', 'shipped');
