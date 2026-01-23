-- Migration: Retrospective Auto-Archive Trigger
-- File: 20260123_retrospective_auto_archive_trigger.sql
-- Date: 2026-01-23
-- SD: SD-LEO-HARDEN-VALIDATION-001
-- Purpose: Auto-archive retrospectives that are stale AND low quality

-- OVERVIEW:
-- This migration creates a trigger-based system to automatically archive
-- retrospectives that meet staleness criteria:
-- 1. Created more than 90 days ago (stale)
-- 2. Quality score below 50% (low quality / boilerplate)
-- 3. NOT linked to a completed SD (orphaned)
--
-- This addresses the issue identified in SD-LEO-HARDEN-VALIDATION-001:
-- "87.5% of retrospectives contain boilerplate content"

-- ============================================================================
-- PART 1: Add archive tracking columns if not exist
-- ============================================================================

ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS archive_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN retrospectives.archived_at IS 'Timestamp when retrospective was auto-archived. NULL = not archived.';
COMMENT ON COLUMN retrospectives.archive_reason IS 'Reason for archival: stale_low_quality, orphaned, manual';

-- ============================================================================
-- PART 2: Create auto-archive function
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_archive_stale_retrospectives()
RETURNS INTEGER AS $$
DECLARE
  archived_count INTEGER := 0;
  stale_threshold INTERVAL := '90 days';
  quality_threshold INTEGER := 50;
BEGIN
  -- Archive retrospectives that are:
  -- 1. Older than 90 days
  -- 2. Quality score below 50
  -- 3. Not already archived
  -- 4. Status is DRAFT or PUBLISHED (not already ARCHIVED)

  UPDATE retrospectives
  SET
    status = 'ARCHIVED',
    archived_at = NOW(),
    archive_reason = 'stale_low_quality'
  WHERE
    archived_at IS NULL
    AND status != 'ARCHIVED'
    AND created_at < NOW() - stale_threshold
    AND (quality_score IS NULL OR quality_score < quality_threshold)
    AND NOT EXISTS (
      -- Don't archive if linked to a completed SD
      SELECT 1 FROM strategic_directives_v2 sd
      WHERE sd.id = retrospectives.sd_id
      AND sd.status = 'completed'
    );

  GET DIAGNOSTICS archived_count = ROW_COUNT;

  -- Log the operation
  IF archived_count > 0 THEN
    RAISE NOTICE 'Auto-archived % stale/low-quality retrospectives', archived_count;
  END IF;

  RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_archive_stale_retrospectives() IS
'SD-LEO-HARDEN-VALIDATION-001: Auto-archives retrospectives older than 90 days with quality score < 50';

-- ============================================================================
-- PART 3: Create trigger for new low-quality retrospectives
-- ============================================================================

-- Trigger function to flag boilerplate retrospectives on insert
CREATE OR REPLACE FUNCTION flag_boilerplate_retrospective()
RETURNS TRIGGER AS $$
BEGIN
  -- If quality score is set and very low (< 30), mark as needing review
  IF NEW.quality_score IS NOT NULL AND NEW.quality_score < 30 THEN
    NEW.archive_reason := 'pending_quality_review';
    RAISE WARNING 'Retrospective % has very low quality score (%), flagging for review', NEW.id, NEW.quality_score;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (only fires if quality_score is being set)
DROP TRIGGER IF EXISTS flag_boilerplate_retrospective_trigger ON retrospectives;

CREATE TRIGGER flag_boilerplate_retrospective_trigger
  BEFORE INSERT OR UPDATE OF quality_score
  ON retrospectives
  FOR EACH ROW
  WHEN (NEW.quality_score IS NOT NULL AND NEW.quality_score < 30)
  EXECUTE FUNCTION flag_boilerplate_retrospective();

COMMENT ON TRIGGER flag_boilerplate_retrospective_trigger ON retrospectives IS
'SD-LEO-HARDEN-VALIDATION-001: Flags very low quality retrospectives for review';

-- ============================================================================
-- PART 4: Create view for boilerplate detection
-- ============================================================================

CREATE OR REPLACE VIEW v_boilerplate_retrospectives AS
SELECT
  r.id,
  r.title,
  r.sd_id,
  r.quality_score,
  r.status,
  r.created_at,
  r.archived_at,
  r.archive_reason,
  EXTRACT(DAYS FROM (NOW() - r.created_at)) as age_days,
  sd.title as sd_title,
  sd.status as sd_status
FROM retrospectives r
LEFT JOIN strategic_directives_v2 sd ON sd.id = r.sd_id
WHERE
  r.status != 'ARCHIVED'
  AND (r.quality_score IS NULL OR r.quality_score < 50)
ORDER BY r.quality_score ASC NULLS FIRST, r.created_at DESC;

COMMENT ON VIEW v_boilerplate_retrospectives IS
'SD-LEO-HARDEN-VALIDATION-001: Lists non-archived retrospectives with low quality scores for review';

-- ============================================================================
-- PART 5: Create scheduled job function for periodic cleanup
-- ============================================================================

-- Function to be called by pg_cron or manual scheduler
CREATE OR REPLACE FUNCTION run_retrospective_maintenance()
RETURNS JSONB AS $$
DECLARE
  archived INTEGER;
  flagged INTEGER;
  result JSONB;
BEGIN
  -- Run auto-archive
  SELECT auto_archive_stale_retrospectives() INTO archived;

  -- Count flagged items
  SELECT COUNT(*) INTO flagged
  FROM retrospectives
  WHERE archive_reason = 'pending_quality_review';

  result := jsonb_build_object(
    'archived_count', archived,
    'flagged_for_review', flagged,
    'run_at', NOW(),
    'thresholds', jsonb_build_object(
      'stale_days', 90,
      'quality_min', 50
    )
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION run_retrospective_maintenance() IS
'SD-LEO-HARDEN-VALIDATION-001: Run periodic retrospective maintenance (archive stale, report flagged)';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  boilerplate_count INTEGER;
  stale_count INTEGER;
BEGIN
  -- Count current boilerplate retrospectives
  SELECT COUNT(*) INTO boilerplate_count
  FROM retrospectives
  WHERE status != 'ARCHIVED'
  AND (quality_score IS NULL OR quality_score < 50);

  -- Count stale retrospectives (90+ days old)
  SELECT COUNT(*) INTO stale_count
  FROM retrospectives
  WHERE status != 'ARCHIVED'
  AND created_at < NOW() - INTERVAL '90 days';

  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'SD-LEO-HARDEN-VALIDATION-001: Retrospective Auto-Archive';
  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'Columns added: archived_at, archive_reason';
  RAISE NOTICE 'Function: auto_archive_stale_retrospectives()';
  RAISE NOTICE 'Function: flag_boilerplate_retrospective()';
  RAISE NOTICE 'Function: run_retrospective_maintenance()';
  RAISE NOTICE 'Trigger: flag_boilerplate_retrospective_trigger';
  RAISE NOTICE 'View: v_boilerplate_retrospectives';
  RAISE NOTICE '---------------------------------------------------------';
  RAISE NOTICE 'Current boilerplate retrospectives (quality < 50): %', boilerplate_count;
  RAISE NOTICE 'Current stale retrospectives (90+ days): %', stale_count;
  RAISE NOTICE '---------------------------------------------------------';
  RAISE NOTICE 'To run manual cleanup: SELECT run_retrospective_maintenance();';
  RAISE NOTICE '=========================================================';
END $$;
