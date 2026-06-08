// review-health.mjs — SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001
// Pure stuck-counter health gauge for the work-triggered coordinator self-review.
//
// The self-review (scripts/coordinator-self-review.mjs) fires once per COORD_REVIEW_EVERY completed-SD
// delta and writes .coord-review-last.json. If that cron is NOT armed (e.g. a coordinator restart that
// re-armed only the documented loops), the state file silently freezes while completed SDs keep growing —
// the exact dormancy this SD fixes. This gauge makes that freeze VISIBLE in coordinator-audit so it is an
// alert, not a silent stall. Pure + exported for unit testing; the caller supplies the live counts.

/**
 * @param {object} p
 * @param {number} p.completedCount   live count of status='completed' SDs
 * @param {number|null} p.lastReviewCount  state.lastReviewCompletedCount (null/undefined if never written)
 * @param {number} [p.threshold=8]    COORD_REVIEW_EVERY
 * @returns {{ delta:number, dueWindows:number, stuck:boolean, line:string }}
 */
export function computeReviewHealth({ completedCount, lastReviewCount, threshold = 8 }) {
  const total = Number.isFinite(completedCount) ? completedCount : 0;
  const thr = threshold > 0 ? threshold : 8;

  // Never-initialized state file: not stuck — the next self-review run seeds it.
  if (lastReviewCount === null || lastReviewCount === undefined) {
    return { delta: 0, dueWindows: 0, stuck: false, line: `review state uninitialized (no .coord-review-last.json yet) — will seed on next run` };
  }

  const delta = Math.max(0, total - lastReviewCount);
  const dueWindows = Math.floor(delta / thr);
  // STUCK = at least two full review windows have elapsed with no fire (delta >= 2*threshold).
  // A single pending window (delta in [threshold, 2*threshold)) is normal between cron ticks.
  const stuck = delta >= thr * 2;
  const base = `${delta} completed SDs since last self-review (threshold ${thr}, ~${dueWindows} window(s) due)`;
  const line = stuck
    ? `${base} ⚠ STUCK — self-review cron likely NOT armed; arm 'coordinator:self-review' or reset .coord-review-last.json`
    : base;
  return { delta, dueWindows, stuck, line };
}

export default computeReviewHealth;
