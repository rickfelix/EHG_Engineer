-- SD-LEO-INFRA-GATE-THRESHOLD-TUNING-001 — FR-3: give the tuner symmetric guards.
-- CHAIRMAN-GATED. The builder STAGES; the chairman APPLIES. Do not self-apply, including inside a
-- transaction that is rolled back — an apply attempt against a gated object is still an apply attempt.
--
-- WHAT THIS FIXES (both measured at source, both independent of the missing outcome arm):
--
--   1. THE ARMS CARRIED UNEQUAL EVIDENTIARY BURDENS. Loosening fired on pass_rate < 50 AND total >= 5
--      with NO score condition; tightening required pass_rate > 90 AND avg_score > 80 AND total >= 10.
--      On one live run that produced orchestrator x retrospective (100% pass, avg 88.7, n=6) DENIED an
--      increase, while database x user_story (0% pass, n=8) FIRED a decrease. n=6 was too little
--      evidence to tighten; n=8 was enough to loosen. A tuner shaped like that drifts one way no
--      matter what else is bolted onto it.
--
--   2. suggested_threshold COULD CONTRADICT ITS OWN recommendation. Its CASE carried no total guard
--      while the recommendation CASE beside it did, so security x prd published suggested_threshold
--      70 (up from 65) on the same row reading "INSUFFICIENT DATA ... (minimum 5)" at n=2. A number
--      printed beside a disclaimer gets read without it. It is now NULL unless an arm actually fired.
--
--   3. A DECREASE THAT CANNOT REACH ITS POPULATION IS NO LONGER OFFERED. All six live DECREASE
--      recommendations proposed a bar that, after the cut, STILL SAT ABOVE the mean score — by 4.0
--      (documentation) to 25.7 (database) points. None would have moved its pass rate. Such a row now
--      returns INEFFECTIVE_CHANGE, which says the true thing: this is a content signal, not a
--      threshold signal, and lowering the bar would hide it.
--
-- The authoritative specification and its tests are lib/quality/tuning-rules.js and
-- tests/unit/tuning-rules.test.js (18 cases, mutation-proven). Keep this DDL in step with them.
--
-- ============================================================================================
-- PRE-CONDITION — THIS IS THE LOAD-BEARING PART OF THE FILE. READ BEFORE APPLYING.
-- ============================================================================================
-- The migration that supposedly defines this view (supabase/migrations/20251205_russian_judge_
-- sd_type_awareness.sql:85) filters `created_at`, and ai_quality_assessments HAS NO created_at
-- COLUMN — a live select returns assessed_at instead. A view defined as that file reads could not
-- execute, yet the live view returns 22 rows. THE FILE IS THEREFORE NOT THE LIVE DEFINITION, and the
-- live one could not be retrieved from the builder's side (no exec_sql RPC exists).
--
-- CREATE OR REPLACE VIEW is all-or-nothing. Replacing this view from a definition reconstructed out
-- of a stale file would SILENTLY REVERT whatever the live version actually contains — full-object
-- DDL merges clean and then mutually reverts, with nothing failing at apply time to indicate it.
--
-- So this script REFUSES TO RUN unless the live definition matches what was assumed. If it raises,
-- that is the script working: capture pg_get_viewdef output, reconcile the body below against it,
-- and re-stage. Do not delete the guard to make the script run.
DO $$
DECLARE
  live_def TEXT;
BEGIN
  SELECT pg_get_viewdef('public.v_ai_quality_tuning_recommendations'::regclass, true) INTO live_def;

  IF live_def IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: v_ai_quality_tuning_recommendations does not exist.';
  END IF;

  -- The reconstruction below assumes the live body still groups by these three keys and reads
  -- weighted_score against pass_threshold. If any marker is absent, the live view has drifted from
  -- the assumption and replacing it would discard the drift.
  IF live_def NOT LIKE '%weighted_score%'
     OR live_def NOT LIKE '%pass_threshold%'
     OR live_def NOT LIKE '%ai_quality_assessments%' THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: live definition lacks an expected marker. Capture '
      'pg_get_viewdef(''public.v_ai_quality_tuning_recommendations''::regclass, true) and reconcile '
      'this file against it before applying. DO NOT remove this guard.';
  END IF;

  -- The window predicate is the KNOWN unknown: the file says created_at, the table has assessed_at.
  -- Fail loudly if the live view filters on something this reconstruction does not reproduce.
  IF live_def NOT LIKE '%assessed_at%' THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: live definition does not filter assessed_at, so this '
      'reconstruction would change the observation window as a side effect. Reconcile first.';
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
    -- ONE sample floor for BOTH arms, checked FIRST. Raised to the stricter of the two former values
    -- rather than lowered to the weaker: the defect is drift toward leniency, so the safe direction
    -- is more evidence, not less.
    WHEN total < 10 THEN 'INSUFFICIENT DATA: Need more assessments (minimum 10)'
    WHEN pass_rate < 50 AND (pass_threshold - 5) > avg_score THEN
      'INEFFECTIVE CHANGE: scores sit well below the bar, so lowering it by 5 would not reach them. '
      'This is a content signal, not a threshold signal.'
    WHEN pass_rate < 50 THEN 'DECREASE (-5%): scores cluster just under the bar, which may be blocking legitimate work'
    WHEN pass_rate > 90 AND avg_score > 80 AND (pass_threshold + 5) <= avg_score THEN
      'INCREASE (+5%): Consistently high scores, can tighten standards'
    WHEN pass_rate BETWEEN 60 AND 85 THEN 'OPTIMAL: Pass rate in target range (60-85%)'
    ELSE 'MONITOR: Continue tracking, reassess in 2 weeks'
  END AS recommendation,
  -- NULL UNLESS AN ARM ACTUALLY FIRED. This is the whole of fix (2): the suggestion can no longer
  -- outlive the recommendation that disclaims it, because there is nothing to read.
  CASE
    WHEN total < 10 THEN NULL
    WHEN pass_rate < 50 AND (pass_threshold - 5) > avg_score THEN NULL
    WHEN pass_rate < 50 THEN GREATEST(pass_threshold - 5, 45)
    WHEN pass_rate > 90 AND avg_score > 80 AND (pass_threshold + 5) <= avg_score THEN LEAST(pass_threshold + 5, 85)
    ELSE NULL
  END AS suggested_threshold
FROM threshold_stats
ORDER BY sd_type, content_type;

-- POST-CONDITIONS — assert the two defects are actually gone, in the same transaction that made the
-- change. A migration that reports success without checking its own claim is the class of thing this
-- SD exists to correct.
DO $$
DECLARE
  contradictions INT;
  cosmetic INT;
BEGIN
  SELECT COUNT(*) INTO contradictions
  FROM v_ai_quality_tuning_recommendations
  WHERE suggested_threshold IS NOT NULL
    AND recommendation NOT LIKE 'DECREASE%'
    AND recommendation NOT LIKE 'INCREASE%';
  IF contradictions > 0 THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: % row(s) publish a suggested_threshold while declining to act.', contradictions;
  END IF;

  SELECT COUNT(*) INTO cosmetic
  FROM v_ai_quality_tuning_recommendations
  WHERE recommendation LIKE 'DECREASE%' AND (current_threshold - 5) > avg_score;
  IF cosmetic > 0 THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: % DECREASE row(s) propose a bar still above the mean.', cosmetic;
  END IF;

  RAISE NOTICE 'OK: no self-contradicting rows, no cosmetic decreases.';
END $$;

COMMENT ON VIEW v_ai_quality_tuning_recommendations IS
'Threshold tuning recommendations over the last 4 weeks. Both arms carry the same sample floor (10) '
'and a score condition, so loosening never fires on weaker evidence than tightening '
'(SD-LEO-INFRA-GATE-THRESHOLD-TUNING-001). suggested_threshold is NULL unless an arm fired. '
'NOTE: this view still has NO OUTCOME ARM — it cannot see whether a gate-PASSED artifact later '
'caused a defect, so it optimises band-occupancy only. Do not read a recommendation here as evidence '
'that a threshold is correct, only that it is or is not blocking.';
