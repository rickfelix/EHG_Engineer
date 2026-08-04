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
 * ── THE COMPOSITE GRAIN, WHICH FR-3 ACTUALLY REQUIRES ─────────────────────────────────────
 * claim_history entries carry {session_id, claimed_at} and NO row id of their own. This header
 * used to conclude from that "the finest grain that exists is the SD id", cite SD ids alone, and
 * ship a limitation explaining the absence.
 *
 * That was backwards, and the VALIDATION sub-agent named it: A RATIONALE SHIPPED IN PLACE OF THE
 * ASSERTION. The ruling asks for sd row-id + claim_history ARRAY INDEX + entry TIMESTAMP PRECISELY
 * BECAUSE the entries have no ids — the triple IS the locator that absence forces. Citing only the
 * SD id discarded the two components that identify which event was counted, while the
 * honest-sounding limitation made it read as though the ruling had been satisfied.
 *
 * `claimGrain()` returns that triple and `citation.grains` carries it on every emission.
 * `claimedWithin()` is now a boolean over the same function, so the count and the citation cannot
 * describe different sets. Giving claim_history real ids remains a NAMED FOLLOW-ON — but that is
 * now an improvement to the data, not an excuse for the citation.
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
  return claimGrain(sd, nowMs, windowMs) !== null;
}

/**
 * The composite locator FR-3 requires: which SD, WHICH claim_history entry, and WHEN.
 *
 * claim_history entries carry no id of their own, which is exactly WHY the ruling asked for
 * sd row-id + array index + entry timestamp — that triple is what makes a specific claim event
 * re-derivable. Emitting only the SD id and a limitation explaining the absence was a rationale
 * standing in for the assertion; this returns the thing itself.
 *
 * Returns null when no entry qualifies, so `claimedWithin` stays a pure boolean over it and the
 * two can never disagree about what counted — one predicate, one place.
 *
 * @returns {{sd_id: string, claim_index: number, claimed_at: string}|null}
 */
export function claimGrain(sd, nowMs, windowMs = CLAIM_WINDOW_MS) {
  const history = sd?.metadata?.claim_history;
  if (!Array.isArray(history)) return null;
  for (let i = 0; i < history.length; i++) {
    const t = Date.parse(history[i]?.claimed_at);
    // A future-dated or unparseable stamp is NOT uptake. Treating either as "recent" would let a
    // clock skew or a malformed row manufacture a passing score.
    if (Number.isFinite(t) && t <= nowMs && nowMs - t <= windowMs) {
      return { sd_id: sd?.id ?? null, claim_index: i, claimed_at: history[i].claimed_at };
    }
  }
  return null;
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

  // ONE pass, so the count and the citation can never describe different sets.
  const grains = rankedTop5.map((sd) => claimGrain(sd, nowMs)).filter(Boolean);
  const claimed = rankedTop5.filter((sd) => claimGrain(sd, nowMs) !== null);
  const denominator = rankedTop5.length;
  // An EMPTY ranking is not 100% uptake. 0/0 is undefined, and reporting it as 1.0 would award full
  // marks for a ranking nobody produced — the vacuous-all-of-nothing this SD keeps finding.
  const fraction = denominator > 0 ? claimed.length / denominator : 0;
  const earned = denominator > 0 && fraction >= threshold ? LEG_POINTS : 0;

  // FR-3's required limitation, now stating a FACT ABOUT THE DATA rather than excusing a
  // missing citation. The composite locator IS emitted below in `grains`; what remains true
  // is that the underlying claim_history entries still have no ids of their own, which is why
  // the locator is a triple rather than a row id.
  const limitation = 'claim_history entries carry no id of their own, so a claim event is located by '
    + 'the COMPOSITE grain emitted in citation.grains — sd row-id + claim_history array index + entry '
    + 'timestamp. row_ids are the SD ids counted; the grains are the claim events behind the count. '
    + 'Giving claim_history real ids remains a named follow-on (FR-3, coordinator ruling e6876fe6)';

  return {
    leg: LEG_ID,
    fraction: cite({
      value: fraction,
      table: 'strategic_directives_v2',
      row_ids: claimed.map((sd) => sd.id),
      grains,
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
      grains,
      predicate: `${LEG_POINTS} points iff the uptake fraction is >= ${threshold}`,
      limitation: 'THE THRESHOLD IS NOT RATIFIED. FR-3 specifies the fraction and is silent on what '
        + `earns the points; ${threshold} is a placeholder recorded here rather than settled, and is `
        + `injectable so ratification changes it without touching the measurement. ${limitation}`,
      source: 'lib/drive-loop/score/leg2-uptake.js scoreLeg2',
    }),
  };
}
