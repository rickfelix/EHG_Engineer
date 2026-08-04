/**
 * GATE-THRESHOLD TUNING RULES — SD-LEO-INFRA-GATE-THRESHOLD-TUNING-001.
 *
 * THE SHIPPED RULE LOOSENS ON WEAKER EVIDENCE THAN IT TIGHTENS ON, AND THAT IS A RATCHET.
 * Measured at source (supabase/migrations/20251205_russian_judge_sd_type_awareness.sql:97-98):
 * to DECREASE a threshold the view requires pass_rate < 50 AND total >= 5 — no score condition at
 * all. To INCREASE one it requires pass_rate > 90 AND avg_score > 80 AND total >= 10. On a single
 * live run that produced orchestrator x retrospective (100% pass, avg 88.7, n=6) DENIED an increase
 * for n<10, while database x user_story (0% pass, n=8) FIRED a decrease. n=6 was too little evidence
 * to tighten; n=8 was enough to loosen. A tuner shaped like that drifts one way regardless of what
 * else is added to it, which is why this is fixed independently of the outcome arm.
 *
 * THE SECOND DEFECT IS THAT A RECOMMENDATION COULD CONTRADICT ITSELF. The view's suggested_threshold
 * CASE (:103-107) carries NO sample-size guard while the recommendation CASE beside it does, so
 * security x prd published suggested_threshold = 70 (up from 65) on the same row that reads
 * "INSUFFICIENT DATA: Need more assessments (minimum 5)" with n=2. A number printed beside a
 * disclaimer gets read without it. Here the suggestion is NULL unless its arm actually fired.
 *
 * WHY THIS IS JAVASCRIPT WHEN THE RULE LIVES IN SQL: the view is chairman-gated DDL, so it cannot be
 * altered or executed from here. This module is the SPECIFICATION the staged DDL implements, and it
 * is the only place the logic can be exercised before the ceremony runs. Keep the two in step.
 */

'use strict';

/** Both arms move by the same step. */
const STEP = 5;

/**
 * ONE sample floor for BOTH arms. Previously 5 to loosen and 10 to tighten — the asymmetry itself.
 * Raised to the stricter of the two rather than lowered to the weaker: the failure being corrected
 * is drift toward leniency, so the safe direction is more evidence, not less.
 */
const MIN_SAMPLE = 10;

const RECOMMENDATION = Object.freeze({
  DECREASE: 'DECREASE',
  INCREASE: 'INCREASE',
  OPTIMAL: 'OPTIMAL',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  MONITOR: 'MONITOR',
  INEFFECTIVE_CHANGE: 'INEFFECTIVE_CHANGE',
});

/**
 * Would moving the threshold by STEP actually reach the population it is meant to affect?
 *
 * THIS ENCODES A MEASURED FINDING, NOT A PREFERENCE. All six live DECREASE recommendations proposed
 * a bar that, after the cut, still sat ABOVE the mean score — by 4.0 (documentation) to 25.7
 * (database) points. Not one of them would have meaningfully changed its pass rate. A recommendation
 * that cannot achieve its own stated purpose ("may be blocking legitimate work") should not be
 * issued, whatever else is true: if scores sit far below the bar the problem is the content, and
 * lowering the bar treats the symptom cosmetically while hiding it.
 *
 * The mirrored condition on the tightening side is the same idea pointed the other way — a raised
 * bar must still sit at or below the mean, or it is a bar nothing clears.
 */
function changeIsEffective(direction, currentThreshold, avgScore) {
  if (!Number.isFinite(avgScore)) return false;
  return direction === 'DECREASE'
    ? (currentThreshold - STEP) <= avgScore
    : (currentThreshold + STEP) <= avgScore;
}

/**
 * Recommend a threshold action for one sd_type x content_type cell.
 *
 * @param {object} row - { pass_rate, avg_score, current_threshold, total }
 * @returns {{recommendation: string, suggested_threshold: number|null, reason: string}}
 */
function recommend(row) {
  const pass = Number(row.pass_rate);
  const avg = Number(row.avg_score);
  const thr = Number(row.current_threshold);
  const total = Number(row.total);

  // INSUFFICIENT DATA IS CHECKED FIRST AND RETURNS A NULL SUGGESTION. The old shape let this label
  // coexist with a moved number; ordering plus the null is what makes that unrepresentable rather
  // than merely discouraged.
  if (!Number.isFinite(total) || total < MIN_SAMPLE) {
    return {
      recommendation: RECOMMENDATION.INSUFFICIENT_DATA,
      suggested_threshold: null,
      reason: 'need at least ' + MIN_SAMPLE + ' assessments, have ' + (Number.isFinite(total) ? total : 0),
    };
  }

  if (pass < 50) {
    // The loosen arm now carries a score condition, which it previously had none of.
    if (!changeIsEffective('DECREASE', thr, avg)) {
      return {
        recommendation: RECOMMENDATION.INEFFECTIVE_CHANGE,
        suggested_threshold: null,
        reason: 'pass rate ' + pass + '% is low, but avg_score ' + avg + ' sits ' + (thr - avg).toFixed(1)
          + ' below the current bar — lowering by ' + STEP + ' would leave the bar above the mean and change'
          + ' little. This is a content signal, not a threshold signal.',
      };
    }
    return {
      recommendation: RECOMMENDATION.DECREASE,
      suggested_threshold: Math.max(thr - STEP, 45),
      reason: 'pass rate ' + pass + '% with scores clustered just under the bar (avg ' + avg + ')',
    };
  }

  // The tightening arm keeps its absolute avg_score > 80 condition IN ADDITION to the mirrored
  // effectiveness test. That leaves it STRICTER than the loosening arm, which is deliberate: the
  // defect being corrected is drift toward leniency, so the two arms need not be identical — what
  // matters is that loosening never requires WEAKER evidence than tightening.
  if (pass > 90 && avg > 80 && changeIsEffective('INCREASE', thr, avg)) {
    return {
      recommendation: RECOMMENDATION.INCREASE,
      suggested_threshold: Math.min(thr + STEP, 85),
      reason: 'pass rate ' + pass + '% with avg ' + avg + ' well clear of a raised bar',
    };
  }

  if (pass >= 60 && pass <= 85) {
    return { recommendation: RECOMMENDATION.OPTIMAL, suggested_threshold: null, reason: 'pass rate in the 60-85 target range' };
  }

  return { recommendation: RECOMMENDATION.MONITOR, suggested_threshold: null, reason: 'no arm met its evidence bar' };
}

module.exports = { recommend, changeIsEffective, RECOMMENDATION, MIN_SAMPLE, STEP };
