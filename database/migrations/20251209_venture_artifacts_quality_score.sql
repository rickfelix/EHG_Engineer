-- Migration: Add quality_score column to venture_artifacts
-- SD: SD-VISION-TRANSITION-001D (Kochel Integration)
-- Date: 2025-12-09
-- Purpose: Enable quality gate enforcement by tracking artifact quality scores
--
-- Background:
-- The Kochel Integration cross-validation identified that the 85% quality gate
-- is conceptual but not enforced at database level. This migration adds the
-- infrastructure needed for quality tracking.
--
-- ============================================================================
-- 1. Add quality_score column to venture_artifacts
-- ============================================================================

ALTER TABLE venture_artifacts
ADD COLUMN IF NOT EXISTS quality_score INT CHECK (quality_score BETWEEN 0 AND 100);

COMMENT ON COLUMN venture_artifacts.quality_score IS 'Quality score (0-100) from AI validation or manual review. Required for quality gate enforcement at Stages 3, 5, 16.';

-- ============================================================================
-- 2. Add validation_status column to track review state
-- ============================================================================

ALTER TABLE venture_artifacts
ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'pending'
CHECK (validation_status IN ('pending', 'validated', 'rejected', 'needs_revision'));

COMMENT ON COLUMN venture_artifacts.validation_status IS 'Artifact validation state: pending (not reviewed), validated (passed), rejected (failed), needs_revision (fixable issues).';

-- ============================================================================
-- 3. Add validated_at timestamp
-- ============================================================================

ALTER TABLE venture_artifacts
ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;

COMMENT ON COLUMN venture_artifacts.validated_at IS 'Timestamp when artifact was validated or rejected.';

-- ============================================================================
-- 4. Add validated_by to track who/what validated
-- ============================================================================

ALTER TABLE venture_artifacts
ADD COLUMN IF NOT EXISTS validated_by VARCHAR(100);

COMMENT ON COLUMN venture_artifacts.validated_by IS 'Who validated: chairman, auto_validation, crewai_agent_name, etc.';

-- ============================================================================
-- 5. Create index for quality queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_venture_artifacts_quality_score
ON venture_artifacts(quality_score)
WHERE quality_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_venture_artifacts_validation_status
ON venture_artifacts(validation_status);

-- ============================================================================
-- 6. Helper function: Check if venture passes quality gate at stage
-- ============================================================================

CREATE OR REPLACE FUNCTION check_venture_quality_gate(
  p_venture_id UUID,
  p_stage_number INT,
  p_threshold INT DEFAULT 85
)
RETURNS TABLE(
  passes_gate BOOLEAN,
  avg_quality_score NUMERIC,
  artifacts_reviewed INT,
  artifacts_below_threshold INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(AVG(va.quality_score), 0) >= p_threshold AS passes_gate,
    COALESCE(AVG(va.quality_score), 0) AS avg_quality_score,
    COUNT(*)::INT AS artifacts_reviewed,
    COUNT(*) FILTER (WHERE va.quality_score < p_threshold)::INT AS artifacts_below_threshold
  FROM venture_artifacts va
  WHERE va.venture_id = p_venture_id
    AND va.lifecycle_stage <= p_stage_number
    AND va.quality_score IS NOT NULL
    AND va.is_current = true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_venture_quality_gate IS 'Check if a venture passes the quality gate at a given stage. Default threshold is 85%.';

-- ============================================================================
-- 7. Helper function: Get artifacts needing validation
-- ============================================================================

CREATE OR REPLACE FUNCTION get_artifacts_pending_validation(p_venture_id UUID)
RETURNS TABLE(
  artifact_id UUID,
  artifact_type VARCHAR,
  lifecycle_stage INT,
  title VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    va.id AS artifact_id,
    va.artifact_type,
    va.lifecycle_stage,
    va.title,
    va.created_at
  FROM venture_artifacts va
  WHERE va.venture_id = p_venture_id
    AND va.is_current = true
    AND va.validation_status = 'pending'
  ORDER BY va.lifecycle_stage, va.created_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After migration, verify with:
--
-- Check column exists:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'venture_artifacts' AND column_name = 'quality_score';
--
-- Check constraint:
-- INSERT INTO venture_artifacts (venture_id, lifecycle_stage, artifact_type, title, quality_score)
-- VALUES ('...', 1, 'test', 'test', 101);  -- Should FAIL (> 100)
--
-- Check function:
-- SELECT * FROM check_venture_quality_gate('venture-uuid-here', 5);

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To reverse this migration:
-- DROP FUNCTION IF EXISTS get_artifacts_pending_validation(UUID);
-- DROP FUNCTION IF EXISTS check_venture_quality_gate(UUID, INT, INT);
-- DROP INDEX IF EXISTS idx_venture_artifacts_validation_status;
-- DROP INDEX IF EXISTS idx_venture_artifacts_quality_score;
-- ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS validated_by;
-- ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS validated_at;
-- ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS validation_status;
-- ALTER TABLE venture_artifacts DROP COLUMN IF EXISTS quality_score;
