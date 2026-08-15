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
 * ── THE DENOMINATOR IS EMITTED, NEVER ASSUMED — AND NOW RATIFIED ──────────────────────────
 * The score is still computed from the legs actually supplied (measured.length * POINTS_PER_LEG),
 * so a reader always knows what it is out of. What changed (SD-LEO-INFRA-DRIVE-SCORE-DENOMINATOR-001,
 * FR-2): the SPEC leg count is no longer a bare `4` that admitted itself a placeholder. It is
 * DERIVED from the frozen DRIVE_SCORE_LEGS SSOT (= 3, ratified 3 legs / 6 points per Adam ruling
 * d50b9f12, coordinator scope ac704cbd). A leg cannot silently join the set — the SSOT's
 * ratified-marker rule + the guard test make a phantom leg a loud CI failure (drive-score-legs.js).
 *
 * ── A CITATION NAMES ONE TABLE, SO IT MAY CARRY ONLY THAT TABLE'S IDS ─────────────────────
 * SD-LEO-INFRA-DRIVE-SCORE-PER-001. This file used to union every measured leg's row_ids into one
 * list and stamp its own home table, 'drive_reports', across the result. The legs do not share a
 * table: leg1 cites roadmap_wave_items, leg2 cites strategic_directives_v2, leg4 cites none by
 * design. Measured on the live rows: drive-2026-08-12 and drive-2026-08-13 each carried 12 ids
 * labelled drive_reports of which ZERO existed there — 11 were roadmap_wave_items and 1 was
 * strategic_directives_v2.
 *
 * Nothing was fabricated, and that is what made it durable: the defect was CITATION COMPOSITION,
 * and the output looked more audited than an honest one would. A citation that cannot be resolved
 * to its referent is provenance-SHAPED, not provenance.
 *
 * So the row grain now lives PER LEG in measured_legs, each id beside the table it actually lives
 * in, and the top-level score citation carries NO row_ids at all. Emitting (table, row_ids) pairs
 * up here instead was considered and rejected: once each leg carries its own ids, repeating them
 * at the aggregate creates a SECOND representation of the same fact that can drift from the first
 * — this defect again, one level up. Legs are verified against their own named tables before they
 * reach this function (verify-leg-citations.js); an unresolvable leg arrives already converted to
 * the unavailable shape, so the exclusion rule above handles it with no second code path.
 *
 * ── CHAIRMAN DECISION LATENCY SITS BESIDE THE SCORE, UNGRADED ─────────────────────────────
 * Option A, ratified (SMS row 5d90338c, and the migration says so at :37). It is reported and never
 * folded into the total. Grading it would convert a measurement of the chairman's queue into a mark
 * against the fleet's drive, which is a different claim about a different actor.
 *
 * ── EACH MEASURED LEG NOW CARRIES ITS OWN POINT VALUE ──────────────────────────────────────
 * SD-FDBK-INFRA-ENCODE-DRIVE-SIX-GOAL-001 (chairman directive 2026-08-15): the chairman-facing
 * per-leg breakdown (drive-report-sms.mjs formatDriveBreakdown) needs to say what EACH leg earned,
 * not only the fused total — "X/6 = leg1_landed 2 + leg2_uptake 1 + leg4_capacity 0" instead of a
 * bare aggregate number. That per-leg number was already computed here (`l.points.value`, summed
 * into `earned` two lines above); it was simply never carried into the projection.
 *
 * NO per-leg `possible`/denominator is added alongside it. POINTS_PER_LEG (=2) is already a
 * uniform module constant every leg shares — a per-leg copy of it would be a second representation
 * of the same fact, free to drift the day a 4th leg is ever ratified. A per-leg consumer computes
 * its own denominator from POINTS_PER_LEG, imported, never re-declared.
 *
 * BREAKING SHAPE CHANGE, by this file's own convention two sections up (FR-1's string[] -> object[]
 * move): disclosed rather than shimmed. A fresh census (this SD) found the same thing the FR-1
 * census found — ZERO runtime consumers of `measured_legs` under scripts/ or lib/, only tests — so
 * there is, again, no reader for a back-compat shim to protect. compose-report.js's SCHEMA_VERSION
 * is bumped 1 -> 2 alongside this change so a future reader can gate on the shape rather than guess.
 */

import { cite } from '../citation.js';
import { isAvailable } from '../report-posture.js';
import { SPEC_LEG_COUNT as RATIFIED_LEG_COUNT, RATIFICATION } from './drive-score-legs.js';

// DERIVED from the frozen SSOT (drive-score-legs.js), never a bare literal. = 3 (ratified).
export const SPEC_LEG_COUNT = RATIFIED_LEG_COUNT;
export const POINTS_PER_LEG = 2;

/**
 * @param {object} o
 * @param {Array<{leg:string, points?:object, unavailable?:object}>} o.legs each leg's output
 * @param {object} [o.decisionLatency] reported BESIDE the score, never added to it
 * @param {object} [o.citationVerification] the verify-leg-citations.js verification node, reported
 *   beside the score so an auditor can see WHAT WAS CHECKED without re-running the query
 */
export function aggregateScore({ legs = [], decisionLatency = null, citationVerification = null } = {}) {
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

  const out = {
    score: cite({
      value: earned,
      // NO row_ids, and that is the fix. See the header: the union that used to live here fused
      // ids from DIFFERENT tables under this one label. `table` stays 'drive_reports' because it
      // is honest about THIS value — the score itself is what lives in drive_reports.drive_score —
      // and the row grain now sits per-leg in measured_legs, beside the table it actually belongs to.
      table: 'drive_reports',
      predicate: `sum of ${measured.length} MEASURED leg(s) at ${POINTS_PER_LEG} points each, out of `
        + `${possible}. UNAVAILABLE LEGS ARE EXCLUDED FROM THE DENOMINATOR, NOT SCORED ZERO — a `
        + `${earned}/${possible} from a stalled fleet and one from broken instruments are the same `
        + 'number and opposite claims. THIS CITATION CARRIES NO row_ids ON PURPOSE: row ids are '
        + 'carried PER LEG in measured_legs, each beside the table it actually lives in. Resolve '
        + 'them there. Legs citing no rows (leg 4, by FR-2 design) carry no row_ids and that is not '
        + 'a missing grain',
      limitation: `Denominator RATIFIED at ${SPEC_LEG_COUNT} legs / ${SPEC_LEG_COUNT * POINTS_PER_LEG} `
        + `points (Adam ruling ${RATIFICATION.ruling}, coordinator scope ${RATIFICATION.scope_ruling}): `
        + 'the smallest-honest denominator over the legs actually defined. A new leg is an explicit '
        + 'chairman-surfaced spec change (drive-score-legs.js ratified-marker rule), never a silent '
        + 'widening. This run scores over the legs that MEASURED; unavailable legs are excluded, not '
        + 'zeroed. UPTAKE_THRESHOLD (leg2) remains provisional/injectable, not ratified by this SD',
      source: 'lib/drive-loop/score/aggregate.js aggregateScore',
    }),
    possible,
    // PER-LEG CITATIONS (SD-LEO-INFRA-DRIVE-SCORE-PER-001 FR-1). This was `measured.map(l => l.leg)`
    // — bare strings — which discarded every leg's provenance at exactly the moment the ids were
    // being fused above. Nothing is measured again here: each leg scorer already knew its table at
    // compute time and already built this citation, so this is COMPOSITION.
    //
    // BREAKING SHAPE CHANGE, disclosed rather than shimmed: string[] -> object[]. A two-agent
    // census found ZERO runtime consumers of this field (only tests read it; drive-report-sms.mjs,
    // the one real runtime reader of drive_score, reads score.value / possible /
    // unavailable_legs.length and never this). A back-compat shim would have been a second
    // representation to keep in sync for no reader.
    measured_legs: measured.map((l) => {
      const c = l.points.citation ?? {};
      return {
        leg: l.leg,
        table: c.table ?? null,
        // ABSENT, never []. An empty array reads as "we looked and found none", which is a
        // different claim from "this leg has no row grain" — the distinction citation.js:112-114
        // draws, and leg4 depends on it.
        ...(Array.isArray(c.row_ids) ? { row_ids: c.row_ids } : {}),
        // leg2's composite locator (sd row-id + claim_history index + timestamp). Dropping it here
        // would discard the only thing that locates a claim EVENT, which has no id of its own.
        ...(Array.isArray(c.grains) && c.grains.length > 0 ? { grains: c.grains } : {}),
        ...(c.source ? { source: c.source } : {}),
        predicate: l.points.predicate,
        // SD-FDBK-INFRA-ENCODE-DRIVE-SIX-GOAL-001: THIS leg's own earned points (0..POINTS_PER_LEG),
        // already computed above when `earned` was summed — carried through, not re-derived. This
        // is what lets a per-leg chairman render say "leg2_uptake 1" instead of only the fused total.
        value: l.points.value,
      };
    }),
    unavailable_legs: unavailableLegs,
  };

  // The provenance check's own result, beside the score for the same reason the latency block is:
  // a reader must be able to see what was verified without re-deriving it. Its ids_checked is the
  // guard against a vacuous pass — 0 ids checked can then never read as "everything resolved".
  if (citationVerification) out.citation_verification = citationVerification;

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
