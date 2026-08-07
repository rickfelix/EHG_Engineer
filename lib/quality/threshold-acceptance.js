/**
 * THRESHOLD-CHANGE ACCEPTANCE — SD-LEO-INFRA-GATE-THRESHOLD-TUNING-002.
 *
 * THE JOB HERE IS TO MAKE THE SD FALSIFIABLE, WHICH IT WOULD NOT OTHERWISE BE.
 *
 * A threshold change is accepted by comparing gate pass-rate before and after. The obvious way to do
 * that — read the 4-week view before, apply the change, read it again a few days later — IS BROKEN,
 * and broken in a way that produces a real-looking number. Two 4-week windows taken days apart SHARE
 * THREE WEEKS OF ASSESSMENTS. The delta they yield is computed mostly from the same rows on both
 * sides, so it is diluted toward zero and cannot detect the change the SD itself made. The SD would
 * then complete on a measurement STRUCTURALLY UNABLE TO FALSIFY IT.
 *
 * That is the same defect class as the sibling SD's stale-window finding, one layer up: there a fixed
 * window could not track a step change in the data; here it cannot detect a change we ourselves make.
 *
 * So overlap is REFUSED rather than caveated. A caveat on a plausible number gets dropped; a refusal
 * cannot be read past.
 */

'use strict';

const OUTCOME = Object.freeze({
  MEASURED: 'MEASURED',
  INSUFFICIENT: 'INSUFFICIENT',
  OVERLAPPING_WINDOW: 'OVERLAPPING_WINDOW',
});

/** Minimum post-change assessments before a pass-rate is worth reporting at all. */
const MIN_AFTER = 5;

/**
 * Do two windows share any instant? Touching endpoints do not overlap — a change applied at T
 * cleanly separates [.., T) from [T, ..).
 */
function windowsOverlap(before, after) {
  return before.end > after.start && after.end > before.start;
}

const passRate = (rows) => {
  const n = rows.length;
  if (!n) return null;
  const passed = rows.filter((r) => Number(r.weighted_score) >= Number(r.pass_threshold)).length;
  return Math.round((passed / n) * 1000) / 10;
};

/**
 * Evaluate one tuned type.
 *
 * @param {object} args
 * @param {string} args.sd_type
 * @param {number} args.before_threshold
 * @param {number} args.after_threshold
 * @param {{start:number,end:number}} args.beforeWindow
 * @param {{start:number,end:number}} args.afterWindow
 * @param {Array<object>} args.beforeRows - assessments in beforeWindow
 * @param {Array<object>} args.afterRows  - assessments in afterWindow
 * @returns {{outcome:string, ...}}
 */
function evaluateChange(args) {
  // CHECKED FIRST, DELIBERATELY. If the windows overlap, every number downstream is contaminated —
  // computing them and then labelling the result would invite exactly the reading this refuses.
  if (windowsOverlap(args.beforeWindow, args.afterWindow)) {
    return {
      outcome: OUTCOME.OVERLAPPING_WINDOW,
      sd_type: args.sd_type,
      before_pass_rate: null,
      after_pass_rate: null,
      reason:
        'before and after windows share assessments, so any delta would be computed largely from the '
        + 'same rows and could not detect the change. Measure post-change assessments only.',
    };
  }

  const after = args.afterRows || [];
  // A NULL MEASUREMENT MUST NOT RENDER AS "UNCHANGED". This is the failure mode that would let the SD
  // complete on applied-but-unmeasured changes, which its own scope forbids — and it is invisible in
  // any summary that only prints failures, because "no movement" reads like a quiet success.
  if (after.length < MIN_AFTER) {
    return {
      outcome: OUTCOME.INSUFFICIENT,
      sd_type: args.sd_type,
      before_pass_rate: passRate(args.beforeRows || []),
      after_pass_rate: null,
      after_n: after.length,
      reason: 'only ' + after.length + ' post-change assessment(s); need ' + MIN_AFTER
        + '. NOT the same as "no change observed".',
    };
  }

  const before = passRate(args.beforeRows || []);
  const now = passRate(after);
  // A raised bar predicts pass-rate at or below the before-value. The prediction is recorded so the
  // result can CONTRADICT it — a type whose pass-rate rises after its bar was raised means the
  // population moved more than the threshold did, and that should surface rather than be averaged in.
  const raised = Number(args.after_threshold) > Number(args.before_threshold);
  const predicted = raised ? 'pass_rate_should_not_rise' : 'pass_rate_should_not_fall';
  const contradicted = before === null ? false : (raised ? now > before : now < before);

  return {
    outcome: OUTCOME.MEASURED,
    sd_type: args.sd_type,
    before_threshold: args.before_threshold,
    after_threshold: args.after_threshold,
    before_pass_rate: before,
    after_pass_rate: now,
    after_n: after.length,
    predicted,
    contradicted,
    reason: contradicted
      ? 'pass rate moved AGAINST the direction the change predicted — the population moved more than the bar did'
      : 'pass rate moved as predicted',
  };
}

module.exports = { evaluateChange, windowsOverlap, OUTCOME, MIN_AFTER };
