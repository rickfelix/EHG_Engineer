-- Migration: Russian Judge SD Type Awareness
-- Description: Add sd_type and pass_threshold columns to ai_quality_assessments
-- Author: Claude Code (LEO Protocol)
-- Date: 2025-12-05
-- Version: v1.1.0-sd-type-aware

-- =========================================
-- Purpose:
-- Enable Russian Judge AI quality assessments to track and adjust
-- evaluation criteria based on SD type (documentation, infrastructure,
-- feature, database, security).
--
-- This allows for:
-- 1. Conditional pass thresholds (50-65% based on sd_type)
-- 2. Type-specific evaluation guidance
-- 3. Meta-analysis of pass rates by SD type
-- 4. Data-driven threshold tuning
-- =========================================

-- Add sd_type column to track Strategic Directive type
ALTER TABLE ai_quality_assessments
ADD COLUMN IF NOT EXISTS sd_type TEXT
CHECK (sd_type IN ('documentation', 'infrastructure', 'feature', 'database', 'security'));

-- Add pass_threshold column to track dynamic threshold used
ALTER TABLE ai_quality_assessments
ADD COLUMN IF NOT EXISTS pass_threshold INTEGER DEFAULT 70
CHECK (pass_threshold >= 0 AND pass_threshold <= 100);

-- Add index for performance on sd_type queries
CREATE INDEX IF NOT EXISTS idx_ai_quality_assessments_sd_type
ON ai_quality_assessments(sd_type);

-- Update existing view to include sd_type
DROP VIEW IF EXISTS v_ai_quality_summary;
CREATE VIEW v_ai_quality_summary AS
SELECT
  content_type,
  sd_type,
  pass_threshold,
  COUNT(*) as total_assessments,
  SUM(CASE WHEN weighted_score >= pass_threshold THEN 1 ELSE 0 END) as passed,
  SUM(CASE WHEN weighted_score < pass_threshold THEN 1 ELSE 0 END) as failed,
  ROUND(SUM(CASE WHEN weighted_score >= pass_threshold THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100, 1) as pass_rate_pct,
  ROUND(AVG(weighted_score), 1) as avg_score,
  MIN(weighted_score) as min_score,
  MAX(weighted_score) as max_score,
  SUM(cost_usd) as total_cost_usd
FROM ai_quality_assessments
GROUP BY content_type, sd_type, pass_threshold
ORDER BY content_type, sd_type, pass_threshold;

-- Create new view for threshold effectiveness analysis
CREATE OR REPLACE VIEW v_ai_quality_threshold_analysis AS
SELECT
  sd_type,
  content_type,
  pass_threshold,
  COUNT(*) as assessment_count,
  ROUND(AVG(weighted_score), 1) as avg_score,
  ROUND(STDDEV(weighted_score), 1) as score_stddev,
  ROUND(SUM(CASE WHEN weighted_score >= pass_threshold THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100, 1) as pass_rate_pct,
  -- Show how many would pass/fail at different thresholds
  SUM(CASE WHEN weighted_score >= 50 THEN 1 ELSE 0 END) as would_pass_at_50,
  SUM(CASE WHEN weighted_score >= 60 THEN 1 ELSE 0 END) as would_pass_at_60,
  SUM(CASE WHEN weighted_score >= 70 THEN 1 ELSE 0 END) as would_pass_at_70,
  SUM(CASE WHEN weighted_score >= 80 THEN 1 ELSE 0 END) as would_pass_at_80
FROM ai_quality_assessments
WHERE sd_type IS NOT NULL
GROUP BY sd_type, content_type, pass_threshold
ORDER BY sd_type, content_type, pass_threshold;

-- Create view for threshold tuning recommendations
CREATE OR REPLACE VIEW v_ai_quality_tuning_recommendations AS
WITH threshold_stats AS (
  SELECT
    sd_type,
    content_type,
    pass_threshold,
    COUNT(*) as total,
    ROUND(AVG(weighted_score), 1) as avg_score,
    ROUND(SUM(CASE WHEN weighted_score >= pass_threshold THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100, 1) as pass_rate
  FROM ai_quality_assessments
  WHERE sd_type IS NOT NULL
    AND created_at >= NOW() - INTERVAL '4 weeks'  -- Last 4 weeks
  GROUP BY sd_type, content_type, pass_threshold
)
SELECT
  sd_type,
  content_type,
  pass_threshold as current_threshold,
  total as assessments_last_4_weeks,
  avg_score,
  pass_rate,
  -- Recommendation logic
  CASE
    WHEN pass_rate < 50 AND total >= 5 THEN 'DECREASE (-5%): Pass rate too low, may be blocking legitimate work'
    WHEN pass_rate > 90 AND avg_score > 80 AND total >= 10 THEN 'INCREASE (+5%): Consistently high scores, can tighten standards'
    WHEN pass_rate BETWEEN 60 AND 85 AND total >= 5 THEN 'OPTIMAL: Pass rate in target range (60-85%)'
    WHEN total < 5 THEN 'INSUFFICIENT DATA: Need more assessments (minimum 5)'
    ELSE 'MONITOR: Continue tracking, reassess in 2 weeks'
  END as recommendation,
  CASE
    WHEN pass_rate < 50 THEN GREATEST(pass_threshold - 5, 45)
    WHEN pass_rate > 90 AND avg_score > 80 THEN LEAST(pass_threshold + 5, 85)
    ELSE pass_threshold
  END as suggested_threshold
FROM threshold_stats
ORDER BY sd_type, content_type;

-- Add comment documentation
COMMENT ON COLUMN ai_quality_assessments.sd_type IS
'Strategic Directive type: documentation, infrastructure, feature, database, security. Used for conditional threshold and evaluation guidance.';

COMMENT ON COLUMN ai_quality_assessments.pass_threshold IS
'Dynamic pass threshold (0-100) used for this assessment. Varies by sd_type: docs=50%, infra=55%, feature=60%, database=65%, security=65% (Phase 1 baseline).';

COMMENT ON VIEW v_ai_quality_threshold_analysis IS
'Analyzes threshold effectiveness by sd_type. Shows pass rates and simulates what would happen at different thresholds.';

COMMENT ON VIEW v_ai_quality_tuning_recommendations IS
'Data-driven recommendations for threshold adjustments. Reviews last 4 weeks of data and suggests increases/decreases based on pass rates and score distribution.';
