/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — the drive_score aggregate.
 *
 * Sums the legs into X/N. Three things here are requirements rather than style, and each one is the
 * difference between a number that means something and a number that merely looks like it does.
 *
 * ── AN UNAVAILABLE LEG IS NOT A ZERO LEG ──────────────────────────────────────────────────
 * The single most important rule in this file. 0/8 because the fleet is genuinely stalled and 0/8
 * because three legs threw are the same number and opposite claims — and the second one, rendered
 * as the first, reads as a catastrophic week to anyone glancing at it. So an unavailable leg is
 * EXCLUDED from the denominator and named in `unavailable_legs`, and the score is reported over the
 * legs that actually measured. FR-7's fail-loud posture is only worth having if the aggregate
 * honours it; a fail-loud leg feeding a fail-soft sum is a fail-soft system.
 *
 * ── THE DENOMINATOR IS EMITTED, NEVER ASSUMED ─────────────────────────────────────────────
 * The spec says X/8 over four legs. Only three legs exist (measured: "leg 3" appears zero times in
 * the SD or the PRD, against three mentions of leg 1 and four of leg 4). So a hard-coded 8 would be
 * a lie today, and a hard-coded 6 would silently ratify a three-leg design nobody approved. The
 * denominator is computed from the legs actually supplied and stated in the emission, so a reader
 * always knows what the score is out of and can see when that changes.
 *
 * ── CHAIRMAN DECISION LATENCY SITS BESIDE THE SCORE, UNGRADED ─────────────────────────────
 * Option A, ratified (SMS row 5d90338c, and the migration says so at :37). It is reported and never
 * folded into the total. Grading it would convert a measurement of the chairman's queue into a mark
 * against the fleet's drive, which is a different claim about a different actor.
 */

import { cite } from '../citation.js';
import { isAvailable } from '../report-posture.js';

export const SPEC_LEG_COUNT = 4;
export const POINTS_PER_LEG = 2;

/**
 * @param {object} o
 * @param {Array<{leg:string, points?:object, unavailable?:object}>} o.legs each leg's output
 * @param {object} [o.decisionLatency] reported BESIDE the score, never added to it
 */
export function aggregateScore({ legs = [], decisionLatency = null } = {}) {
  const measured = [];
  const unavailableLegs = [];

  for (const leg of legs) {
    // A leg is unavailable if it says so (FR-7 shape) or if it produced no points node at all.
    // Treating a missing node as 0 is the same collapse this whole file exists to prevent.
    if (leg?.unavailable && !isAvailable(leg.unavailable)) {
      unavailableLegs.push({ leg: leg.leg, reason: leg.unavailable.reason });
    } else if (!leg?.points || typeof leg.points.value !== 'number') {
      unavailableLegs.push({ leg: leg?.leg ?? '(unnamed)', reason: 'leg produced no numeric points node' });
    } else {
      measured.push(leg);
    }
  }

  const earned = measured.reduce((sum, l) => sum + l.points.value, 0);
  const possible = measured.length * POINTS_PER_LEG;

  // row_ids: the union of what the measured legs cited. leg 4 deliberately cites NONE (FR-2 — a
  // citation proves where you looked, not the inference), and that absence must not be read here as
  // a missing grain. Legs without row_ids simply contribute nothing to the union.
  const rowIds = [...new Set(measured.flatMap((l) => l.points.citation?.row_ids ?? []))];

  const out = {
    score: cite({
      value: earned,
      table: 'drive_reports',
      row_ids: rowIds,
      predicate: `sum of ${measured.length} MEASURED leg(s) at ${POINTS_PER_LEG} points each, out of `
        + `${possible}. UNAVAILABLE LEGS ARE EXCLUDED FROM THE DENOMINATOR, NOT SCORED ZERO — a `
        + `${earned}/${possible} from a stalled fleet and one from broken instruments are the same `
        + 'number and opposite claims. Legs citing no rows (leg 4, by FR-2 design) contribute no '
        + 'row_ids and that is not a missing grain',
      limitation: `THE DENOMINATOR IS NOT RATIFIED. The spec says X/${SPEC_LEG_COUNT * POINTS_PER_LEG} `
        + `over ${SPEC_LEG_COUNT} legs, but only 3 legs are defined anywhere in the SD or PRD `
        + '(measured: "leg 3" appears zero times). This total is over the legs actually supplied, '
        + 'and the per-leg earning rules are likewise placeholders pending a ruling',
      source: 'lib/drive-loop/score/aggregate.js aggregateScore',
    }),
    possible,
    measured_legs: measured.map((l) => l.leg),
    unavailable_legs: unavailableLegs,
  };

  // BESIDE the score, never inside it. Emitted whether or not it was measurable, so its absence is
  // visible rather than silent.
  if (decisionLatency) {
    out.chairman_decision_latency = {
      ...decisionLatency,
      graded: false,
      note: 'reported beside the score and NEVER folded into the total (option A, ratified — SMS row '
        + '5d90338c). Grading it would turn a measurement of the chairman queue into a mark against '
        + 'the fleet drive: different claim, different actor',
    };
  }

  return out;
}
