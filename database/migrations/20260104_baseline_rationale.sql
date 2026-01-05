-- Migration: Intelligent Baseline Rationale Storage
-- Purpose: Store GPT-generated rationale for SD sequencing decisions
-- Author: Claude (Intelligent Baseline Generator)
-- Date: 2026-01-04

-- ============================================================================
-- 1. SD BASELINE RATIONALE TABLE
-- ============================================================================
-- Stores per-SD rationale for each baseline

CREATE TABLE IF NOT EXISTS sd_baseline_rationale (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id UUID NOT NULL REFERENCES sd_execution_baselines(id) ON DELETE CASCADE,
  sd_id VARCHAR(100) NOT NULL,
  sequence_rank INTEGER NOT NULL,
  track VARCHAR(20),
  track_name VARCHAR(50),
  rationale TEXT NOT NULL,
  priority_score NUMERIC(10,2),
  okr_impact_score NUMERIC(10,2),
  dependency_depth INTEGER DEFAULT 0,
  dependencies_count INTEGER DEFAULT 0,
  blocked_by TEXT[],
  generated_by TEXT DEFAULT 'gpt-5.2',
  algorithm_version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(baseline_id, sd_id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_baseline_rationale_baseline ON sd_baseline_rationale(baseline_id);
CREATE INDEX IF NOT EXISTS idx_baseline_rationale_sd ON sd_baseline_rationale(sd_id);
CREATE INDEX IF NOT EXISTS idx_baseline_rationale_rank ON sd_baseline_rationale(sequence_rank);

-- ============================================================================
-- 2. EXTEND SD_EXECUTION_BASELINES WITH GENERATION METADATA
-- ============================================================================

DO $$
BEGIN
  -- Add generation_rationale column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_execution_baselines'
    AND column_name = 'generation_rationale'
  ) THEN
    ALTER TABLE sd_execution_baselines
    ADD COLUMN generation_rationale TEXT;
  END IF;

  -- Add generated_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_execution_baselines'
    AND column_name = 'generated_by'
  ) THEN
    ALTER TABLE sd_execution_baselines
    ADD COLUMN generated_by TEXT;
  END IF;

  -- Add algorithm_version column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_execution_baselines'
    AND column_name = 'algorithm_version'
  ) THEN
    ALTER TABLE sd_execution_baselines
    ADD COLUMN algorithm_version TEXT;
  END IF;

  -- Add generation_metadata column for full context
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_execution_baselines'
    AND column_name = 'generation_metadata'
  ) THEN
    ALTER TABLE sd_execution_baselines
    ADD COLUMN generation_metadata JSONB;
  END IF;
END;
$$;

-- ============================================================================
-- 3. VIEW: BASELINE WITH RATIONALE
-- ============================================================================

CREATE OR REPLACE VIEW v_baseline_with_rationale AS
SELECT
  b.id as baseline_id,
  b.baseline_name,
  b.baseline_type,
  b.is_active,
  b.generation_rationale,
  b.generated_by,
  b.algorithm_version,
  b.created_at as baseline_created_at,
  r.sd_id,
  r.sequence_rank,
  r.track,
  r.track_name,
  r.rationale,
  r.priority_score,
  r.okr_impact_score,
  r.dependency_depth,
  r.blocked_by,
  sd.title as sd_title,
  sd.status as sd_status,
  sd.sd_type,
  sd.priority as sd_priority
FROM sd_execution_baselines b
LEFT JOIN sd_baseline_rationale r ON b.id = r.baseline_id
LEFT JOIN strategic_directives_v2 sd ON r.sd_id = sd.legacy_id
ORDER BY b.created_at DESC, r.sequence_rank ASC;

-- ============================================================================
-- 4. FUNCTION: GET BASELINE RATIONALE SUMMARY
-- ============================================================================

CREATE OR REPLACE FUNCTION get_baseline_rationale_summary(p_baseline_id UUID)
RETURNS TABLE (
  track VARCHAR,
  sd_count INTEGER,
  avg_priority_score NUMERIC,
  total_okr_impact NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.track,
    COUNT(*)::INTEGER as sd_count,
    ROUND(AVG(r.priority_score), 2) as avg_priority_score,
    ROUND(SUM(r.okr_impact_score), 2) as total_okr_impact
  FROM sd_baseline_rationale r
  WHERE r.baseline_id = p_baseline_id
  GROUP BY r.track
  ORDER BY r.track;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. GRANTS
-- ============================================================================

GRANT SELECT ON sd_baseline_rationale TO authenticated;
GRANT SELECT ON sd_baseline_rationale TO service_role;
GRANT INSERT ON sd_baseline_rationale TO service_role;
GRANT UPDATE ON sd_baseline_rationale TO service_role;
GRANT DELETE ON sd_baseline_rationale TO service_role;

GRANT SELECT ON v_baseline_with_rationale TO authenticated;
GRANT SELECT ON v_baseline_with_rationale TO service_role;

GRANT EXECUTE ON FUNCTION get_baseline_rationale_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_baseline_rationale_summary(UUID) TO service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- This migration adds:
-- 1. sd_baseline_rationale - Per-SD rationale with scores and justification
-- 2. Extended sd_execution_baselines with generation metadata
-- 3. v_baseline_with_rationale - Combined view for easy querying
-- 4. get_baseline_rationale_summary() - Aggregated stats by track
