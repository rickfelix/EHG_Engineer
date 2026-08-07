-- DOWN for 20260804_ai_quality_tuning_symmetric_guards.sql
-- SD-LEO-INFRA-GATE-THRESHOLD-TUNING-001. CHAIRMAN-GATED — stage only, never self-apply.
--
-- ⚠️ READ THIS BEFORE RUNNING. This DOWN restores the ASYMMETRIC rule, which means restoring:
--   • a loosen arm that fires at total >= 5 while the tighten arm needs total >= 10,
--   • a loosen arm with no score condition at all,
--   • a suggested_threshold with no sample guard, free to publish a number on a row that reads
--     INSUFFICIENT DATA (measured live: security x prd, n=2, suggested 70 against current 65),
--   • DECREASE recommendations whose proposed bar still sits above the mean by 4.0 to 25.7 points.
-- Those are the defects the UP script removed. Rolling back reinstates them. That is legitimate if
-- the UP script broke something — it is not a neutral undo, and it should not be run to tidy up.
--
-- THE SAME PRE-CONDITION APPLIES IN THIS DIRECTION. The pre-change definition was never retrievable
-- from the builder's side, so the body below is a RECONSTRUCTION, not a captured original. If the
-- live view has since drifted, this would overwrite that drift exactly as the UP script would have.
DO $$
DECLARE
  live_def TEXT;
BEGIN
  SELECT pg_get_viewdef('public.v_ai_quality_tuning_recommendations'::regclass, true) INTO live_def;
  IF live_def IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: view does not exist; nothing to roll back.';
  END IF;
  -- Refuse unless the UP script is what is actually live. Rolling back something else is not a
  -- rollback, it is an unreviewed replacement.
  IF live_def NOT LIKE '%INEFFECTIVE CHANGE%' THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: the live view is not the version this DOWN reverses '
      '(no INEFFECTIVE CHANGE branch found). Capture pg_get_viewdef and reconcile before rolling back.';
  END IF;
END $$;

CREATE OR REPLACE VIEW v_ai_quality_tuning_recommendations AS
WITH threshold_stats AS (
  SELECT
    sd_type,
    content_type,
    pass_threshold,
    COUNT(*) AS total,
    ROUND(AVG(weighted_score), 1) AS avg_score,
    ROUND(SUM(CASE WHEN weighted_score >= pass_threshold THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100, 1) AS pass_rate
  FROM ai_quality_assessments
  WHERE sd_type IS NOT NULL
    AND assessed_at >= NOW() - INTERVAL '4 weeks'
  GROUP BY sd_type, content_type, pass_threshold
)
SELECT
  sd_type,
  content_type,
  pass_threshold AS current_threshold,
  total AS assessments_last_4_weeks,
  avg_score,
  pass_rate,
  CASE
    WHEN pass_rate < 50 AND total >= 5 THEN 'DECREASE (-5%): Pass rate too low, may be blocking legitimate work'
    WHEN pass_rate > 90 AND avg_score > 80 AND total >= 10 THEN 'INCREASE (+5%): Consistently high scores, can tighten standards'
    WHEN pass_rate BETWEEN 60 AND 85 AND total >= 5 THEN 'OPTIMAL: Pass rate in target range (60-85%)'
    WHEN total < 5 THEN 'INSUFFICIENT DATA: Need more assessments (minimum 5)'
    ELSE 'MONITOR: Continue tracking, reassess in 2 weeks'
  END AS recommendation,
  CASE
    WHEN pass_rate < 50 THEN GREATEST(pass_threshold - 5, 45)
    WHEN pass_rate > 90 AND avg_score > 80 THEN LEAST(pass_threshold + 5, 85)
    ELSE pass_threshold
  END AS suggested_threshold
FROM threshold_stats
ORDER BY sd_type, content_type;

COMMENT ON VIEW v_ai_quality_tuning_recommendations IS
'Data-driven recommendations for threshold adjustments. Reviews last 4 weeks of data and suggests '
'increases/decreases based on pass rates and score distribution. '
'ROLLED BACK to the asymmetric rule by 20260804_ai_quality_tuning_symmetric_guards_DOWN.sql — the '
'loosen arm fires on weaker evidence than the tighten arm, and suggested_threshold is unguarded.';
