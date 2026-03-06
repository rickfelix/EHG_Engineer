-- Skill Assessment Scores table (already deployed)
-- Stores per-skill rubric scores from npm run skill:audit
-- Part of SD-LEO-INFRA-SKILL-ASSESSMENT-SYSTEM-001

-- NOTE: This table was created by a prior session with this schema.
-- Migration kept for documentation purposes.

CREATE TABLE IF NOT EXISTS skill_assessment_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  skill_name TEXT NOT NULL,
  skill_file TEXT NOT NULL,
  version TEXT,
  description_text TEXT,
  rubric_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC(4,2) NOT NULL DEFAULT 0,
  is_baseline BOOLEAN NOT NULL DEFAULT false,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assessed_by TEXT
);

-- View: v_skill_health (already deployed)
-- Returns the most recent score + health status per skill,
-- plus delta from baseline if one exists.
CREATE OR REPLACE VIEW v_skill_health AS
WITH latest_scores AS (
  SELECT DISTINCT ON (skill_name)
    skill_name, skill_file, description_text,
    total_score, rubric_scores, is_baseline,
    assessed_at, assessed_by
  FROM skill_assessment_scores
  ORDER BY skill_name, assessed_at DESC
),
baseline_scores AS (
  SELECT DISTINCT ON (skill_name)
    skill_name, total_score AS baseline_score
  FROM skill_assessment_scores
  WHERE is_baseline = true
  ORDER BY skill_name, assessed_at DESC
)
SELECT
  ls.skill_name,
  ls.skill_file,
  ls.description_text,
  ls.total_score,
  ls.rubric_scores,
  ls.assessed_at,
  ls.assessed_by,
  CASE
    WHEN ls.description_text IS NULL THEN 'missing'
    WHEN ls.total_score >= 8 THEN 'excellent'
    WHEN ls.total_score >= 6 THEN 'good'
    WHEN ls.total_score >= 4 THEN 'needs_work'
    ELSE 'poor'
  END AS health_status,
  bs.baseline_score,
  CASE WHEN bs.baseline_score IS NOT NULL
    THEN ls.total_score - bs.baseline_score ELSE NULL
  END AS delta_from_baseline
FROM latest_scores ls
LEFT JOIN baseline_scores bs ON ls.skill_name = bs.skill_name
ORDER BY ls.total_score DESC;
