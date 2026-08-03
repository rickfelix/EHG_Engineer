/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — drive_score leg 2: uptake of the ranked top 5.
 *
 * 2 of 8 points. The METRIC is specified by FR-3: the fraction of the ranked top-5 SDs claimed
 * within 24h. The SCORING RULE is not — see UPTAKE_THRESHOLD below.
 *
 * ── MEASUREMENT AND SCORING ARE SEPARATED ON PURPOSE ──────────────────────────────────────
 * `fraction` is emitted as its own cited value. It is the thing FR-3 actually specifies, it is
 * auditable on its own terms, and it stays correct no matter what threshold is later ratified.
 * `points` applies a rule that is NOT in the PRD. Keeping them apart means ratifying a different
 * threshold changes one constant and touches no measurement.
 *
 * ── THE LIMITATION TRAVELS IN THE EMISSION (FR-3, coordinator ruling e6876fe6) ────────────
 * claim_history entries carry {session_id, claimed_at} and NO row id of their own. So the finest
 * grain that exists is the SD id — this leg cites the SDs it counted, not the claim events that
 * produced the count. That is a real limitation and it rides in `limitation` on every emission,
 * rather than living in a design doc nobody opens. Adding real ids to claim_history entries is a
 * NAMED FOLLOW-ON, not a quiet re-scope of this leg.
 *
 * Storage confirmed reusable: strategic_directives_v2.metadata.claim_history, shape stable per four
 * independent readers (claim-burn-gauge.cjs:41-58, stall-alert.js:141-143,
 * work-boundary-gauges.js:65-88, plan-drift-detectors.js:124-146). The QUERY is new — none of them
 * computes fraction-of-ranked-top-5-claimed-within-24h.
 */

import { cite } from '../citation.js';

export const LEG_ID = 'leg2_uptake';
export const LEG_POINTS = 2;
export const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * ⚠️ NOT RATIFIED. The PRD specifies the FRACTION and is silent on what earns the 2 points — there
 * are no acceptance criteria on FR-3 and no threshold wording anywhere in the record (measured).
 * 0.8 (4 of 5) is a placeholder chosen here so the leg can compute at all, flagged to the
 * coordinator rather than presented as settled. It is exported and injectable precisely so
 * ratifying a different number is a one-line change that cannot disturb the measurement above.
 */
export const UPTAKE_THRESHOLD = 0.8;

/** Did this SD acquire a claim inside the window? Reads the SHAPE the four existing readers agree on. */
export function claimedWithin(sd, nowMs, windowMs = CLAIM_WINDOW_MS) {
  const history = sd?.metadata?.claim_history;
  if (!Array.isArray(history)) return false;
  return history.some((e) => {
    const t = Date.parse(e?.claimed_at);
    // A future-dated or unparseable stamp is NOT uptake. Treating either as "recent" would let a
    // clock skew or a malformed row manufacture a passing score.
    return Number.isFinite(t) && t <= nowMs && nowMs - t <= windowMs;
  });
}

/**
 * @param {object} o
 * @param {object[]} o.rankedTop5 the ranked top-5 SDs, each {id, metadata:{claim_history:[...]}}
 * @param {number} o.nowMs
 * @param {number} [o.threshold]
 */
export function scoreLeg2({ rankedTop5 = [], nowMs, threshold = UPTAKE_THRESHOLD } = {}) {
  if (!Number.isFinite(nowMs)) {
    // Never default to Date.now() here: a leg whose clock is implicit cannot be tested at a
    // boundary, and the boundary is the only interesting part of a 24h window.
    throw new Error('scoreLeg2(): nowMs must be provided — an implicit clock makes the window untestable');
  }

  const claimed = rankedTop5.filter((sd) => claimedWithin(sd, nowMs));
  const denominator = rankedTop5.length;
  // An EMPTY ranking is not 100% uptake. 0/0 is undefined, and reporting it as 1.0 would award full
  // marks for a ranking nobody produced — the vacuous-all-of-nothing this SD keeps finding.
  const fraction = denominator > 0 ? claimed.length / denominator : 0;
  const earned = denominator > 0 && fraction >= threshold ? LEG_POINTS : 0;

  const limitation = 'claim_history entries carry no row id of their own, so these row_ids are the '
    + 'SD ids counted, NOT the claim events behind the count. Adding real ids to claim_history is a '
    + 'named follow-on (FR-3, coordinator ruling e6876fe6)';

  return {
    leg: LEG_ID,
    fraction: cite({
      value: fraction,
      table: 'strategic_directives_v2',
      row_ids: claimed.map((sd) => sd.id),
      predicate: `fraction of the ranked top ${denominator} whose metadata.claim_history contains a `
        + 'claimed_at within 24h of the report. Future-dated and unparseable stamps do not count. An '
        + 'empty ranking is 0, never 1 — 0/0 is undefined and reporting it as full uptake would score '
        + 'a ranking nobody produced',
      limitation,
      source: 'lib/drive-loop/score/leg2-uptake.js scoreLeg2',
    }),
    points: cite({
      value: earned,
      table: 'strategic_directives_v2',
      row_ids: claimed.map((sd) => sd.id),
      predicate: `${LEG_POINTS} points iff the uptake fraction is >= ${threshold}`,
      limitation: 'THE THRESHOLD IS NOT RATIFIED. FR-3 specifies the fraction and is silent on what '
        + `earns the points; ${threshold} is a placeholder recorded here rather than settled, and is `
        + `injectable so ratification changes it without touching the measurement. ${limitation}`,
      source: 'lib/drive-loop/score/leg2-uptake.js scoreLeg2',
    }),
  };
}
