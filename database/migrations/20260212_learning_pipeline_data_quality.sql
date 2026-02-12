-- Migration: Learning Pipeline Data Quality Remediation (FIXED)
-- SD: SD-LEO-FIX-REMEDIATE-LEARNING-PIPELINE-001
-- FRs: FR-1 (dedup guard), FR-3 (orphan sd_id), FR-4 (category normalization)
-- Date: 2026-02-12
-- NOTE: Removed gate_name references (column doesn't exist in issue_patterns)

-- ============================================================
-- FR-4: Category Normalization Function + Trigger
-- ============================================================

-- Normalization function: lower_snake_case
CREATE OR REPLACE FUNCTION normalize_category(raw_category TEXT)
RETURNS TEXT AS $$
BEGIN
  IF raw_category IS NULL THEN RETURN NULL; END IF;
  -- 1. Trim whitespace
  -- 2. Replace spaces, hyphens, dots with underscores
  -- 3. Lowercase everything
  -- 4. Collapse multiple underscores
  -- 5. Trim leading/trailing underscores
  RETURN TRIM(BOTH '_' FROM
    regexp_replace(
      lower(
        regexp_replace(
          TRIM(raw_category),
          '[\s\-\.]+', '_', 'g'
        )
      ),
      '_+', '_', 'g'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Apply normalization to existing data
UPDATE issue_patterns
SET category = normalize_category(category)
WHERE category IS DISTINCT FROM normalize_category(category);

-- Create trigger to auto-normalize on insert/update
CREATE OR REPLACE FUNCTION trigger_normalize_issue_pattern_category()
RETURNS TRIGGER AS $$
BEGIN
  NEW.category := normalize_category(NEW.category);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_category ON issue_patterns;
CREATE TRIGGER trg_normalize_category
  BEFORE INSERT OR UPDATE OF category ON issue_patterns
  FOR EACH ROW
  EXECUTE FUNCTION trigger_normalize_issue_pattern_category();

-- ============================================================
-- FR-1: Dedup Guard for Auto-Generated Patterns
-- ============================================================

-- Add fingerprint column for dedup key (generated from source + normalized category + summary hash)
ALTER TABLE issue_patterns
  ADD COLUMN IF NOT EXISTS dedup_fingerprint TEXT;

-- Populate fingerprint for existing patterns
-- NOTE: Simplified to use source + category + summary (no gate_name)
UPDATE issue_patterns
SET dedup_fingerprint = md5(
  COALESCE(source, '') || '|' ||
  normalize_category(COALESCE(category, '')) || '|' ||
  normalize_category(COALESCE(LEFT(issue_summary, 200), ''))
)
WHERE dedup_fingerprint IS NULL;

-- Create trigger to auto-set fingerprint on insert/update
CREATE OR REPLACE FUNCTION trigger_set_dedup_fingerprint()
RETURNS TRIGGER AS $$
BEGIN
  NEW.dedup_fingerprint := md5(
    COALESCE(NEW.source, '') || '|' ||
    normalize_category(COALESCE(NEW.category, '')) || '|' ||
    normalize_category(COALESCE(LEFT(NEW.issue_summary, 200), ''))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_dedup_fingerprint ON issue_patterns;
CREATE TRIGGER trg_set_dedup_fingerprint
  BEFORE INSERT OR UPDATE ON issue_patterns
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_dedup_fingerprint();

-- Add unique partial index for auto-generated patterns (prevents future dupes)
-- Only enforce uniqueness for automated sources, not manual patterns
CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_patterns_dedup_auto
  ON issue_patterns (dedup_fingerprint)
  WHERE source IN ('auto_rca', 'retrospective');

-- ============================================================
-- FR-3: Orphan sd_id Cleanup for Retrospectives
-- ============================================================

-- Add column to preserve orphaned values for traceability
ALTER TABLE retrospectives
  ADD COLUMN IF NOT EXISTS orphaned_sd_id TEXT;

-- Move orphaned sd_ids (those not matching any SD) to orphaned_sd_id
-- Note: retrospectives.sd_id references strategic_directives_v2.id (UUID)
UPDATE retrospectives r
SET
  orphaned_sd_id = r.sd_id::text,
  sd_id = NULL
WHERE r.sd_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM strategic_directives_v2 sd
    WHERE sd.id = r.sd_id
  );

-- Add data_quality_status column for FR-6 flagging
ALTER TABLE issue_patterns
  ADD COLUMN IF NOT EXISTS data_quality_status TEXT;

-- ============================================================
-- FR-5: Add effectiveness measurement columns to protocol_improvement_queue
-- ============================================================

ALTER TABLE protocol_improvement_queue
  ADD COLUMN IF NOT EXISTS measured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS baseline_metric NUMERIC,
  ADD COLUMN IF NOT EXISTS post_metric NUMERIC,
  ADD COLUMN IF NOT EXISTS delta NUMERIC,
  ADD COLUMN IF NOT EXISTS measurement_status TEXT DEFAULT 'pending'
    CHECK (measurement_status IN ('pending', 'measured', 'inconclusive', 'skipped'));

-- ============================================================
-- Verification Queries
-- ============================================================

-- Verify category normalization
DO $$
DECLARE
  mixed_case_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO mixed_case_count
  FROM issue_patterns
  WHERE category IS DISTINCT FROM normalize_category(category);

  IF mixed_case_count > 0 THEN
    RAISE WARNING 'Still % patterns with non-normalized categories', mixed_case_count;
  ELSE
    RAISE NOTICE 'All categories normalized successfully';
  END IF;
END $$;

-- Verify no orphan sd_ids
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM retrospectives r
  WHERE r.sd_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM strategic_directives_v2 sd WHERE sd.id = r.sd_id
    );

  IF orphan_count > 0 THEN
    RAISE WARNING 'Still % orphan sd_id references in retrospectives', orphan_count;
  ELSE
    RAISE NOTICE 'No orphan sd_id references found';
  END IF;
END $$;

-- Report dedup fingerprint stats
DO $$
DECLARE
  dupe_groups INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupe_groups
  FROM (
    SELECT dedup_fingerprint, COUNT(*) as cnt
    FROM issue_patterns
    WHERE source IN ('auto_rca', 'retrospective')
    GROUP BY dedup_fingerprint
    HAVING COUNT(*) > 1
  ) dupes;

  IF dupe_groups > 0 THEN
    RAISE WARNING '% duplicate fingerprint groups found - run dedup consolidation script', dupe_groups;
  ELSE
    RAISE NOTICE 'No duplicate fingerprints found';
  END IF;
END $$;
