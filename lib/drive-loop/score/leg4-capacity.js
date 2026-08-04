/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — drive_score leg 4: capacity verdict, persisted.
 *
 * 2 of 8 points. FR-2, coordinator ruling e6876fe6.
 *
 * ── THIS LEG DELIBERATELY DOES NOT CITE ITS INPUTS ────────────────────────────────────────
 * Every other cited value in this SD carries row_ids. This one must not, and the reason is the
 * principle the ruling turns on: A CITATION PROVES WHERE YOU LOOKED, NOT THE INFERENCE. Citing
 * beltDepth's rows would hand an auditor the raw material and make them re-derive the verdict
 * themselves — provenance without the inference, which is precisely what the chairman-ratified
 * requirement is not for. What an auditor needs is the VERDICT THIS RUN REACHED, durably, so it can
 * be trended and disputed as a verdict.
 *
 * So the provenance here is the PERSISTED ROW, not the inputs. `citation.source` names the
 * instrument and `verdict_row_id` names the record. Deliberately absent row_ids is a decision, and
 * it is stated in the predicate so a reader does not mistake it for an omission — that distinction
 * is exactly what the C4 property's `no_way_to_re_derive` default-deny would otherwise flag.
 *
 * ── PERSISTS-NOTHING WAS A LATENT DEFECT IN THE INSTRUMENT BEING REUSED ───────────────────
 * scripts/coordinator-capacity-forecast.mjs:385-388 already computes the ladder and then discards
 * it. A bidirectional verdict that leaves no record can be neither audited nor trended: you cannot
 * ask "how long have we been in DEFICIT" of a number nobody wrote down. The ruling names this as
 * wrong independent of this SD; leg 4 is one row per run.
 *
 * ── BIDIRECTIONAL MEANS TIGHT IS THE TARGET, NOT SURPLUS ──────────────────────────────────
 * The ladder is DEFICIT-URGENT / DEFICIT / TIGHT / SURPLUS, and SURPLUS is explicitly "the flooded
 * pole" — capacity idle against no work. Both ends are off-target, so the healthy state is the
 * middle. Reading SURPLUS as good is the obvious mistake here and it would score a starved belt as
 * a perfect run.
 */

import { cite } from '../citation.js';

export const LEG_ID = 'leg4_capacity';
export const LEG_POINTS = 2;

/** The full ladder, ordered worst → flooded. Exported so a consumer cannot re-spell it. */
export const VERDICTS = Object.freeze(['DEFICIT-URGENT', 'DEFICIT', 'TIGHT', 'SURPLUS']);

/**
 * ⚠️ NOT RATIFIED, same status as leg 2's threshold. The PRD specifies the verdict ladder and the
 * persistence requirement; it does not say which verdicts EARN the 2 points. TIGHT-only follows
 * from the ladder being explicitly bidirectional, but it is an inference recorded here rather than
 * a ruling. Exported and injectable so ratification is a one-line change.
 */
export const HEALTHY_VERDICTS = Object.freeze(['TIGHT']);

/**
 * @param {object} o
 * @param {() => {verdict:string, beltDepth:number, demandSoon:number, deficit:number}} o.computeVerdict
 * @param {(row:object) => {id:string}} o.persist writes the durable row; returns its id
 * @param {string[]} [o.healthy]
 * @param {string} [o.runId]
 */
export function scoreLeg4({ computeVerdict, persist, healthy = HEALTHY_VERDICTS, runId = null } = {}) {
  if (typeof computeVerdict !== 'function' || typeof persist !== 'function') {
    throw new Error('scoreLeg4(): computeVerdict and persist must be injected — a leg whose '
      + 'persistence is implicit cannot be tested for whether it actually persisted');
  }

  const forecast = computeVerdict();
  const verdict = forecast?.verdict;

  // An unrecognised verdict is NOT a zero score — it is a broken instrument, and scoring it 0 would
  // be indistinguishable from a genuine DEFICIT. Fail loudly instead.
  if (!VERDICTS.includes(verdict)) {
    throw new Error(`scoreLeg4(): unrecognised verdict ${JSON.stringify(verdict)} — expected one of `
      + `${VERDICTS.join(', ')}. Scoring this 0 would be indistinguishable from a real DEFICIT`);
  }

  // Persist BEFORE scoring. The durable record is the deliverable FR-2 asks for; the points are a
  // reading of it. If persistence throws, the leg fails rather than reporting a score whose
  // provenance was never written.
  const row = persist({
    run_id: runId,
    verdict,
    belt_depth: forecast.beltDepth,
    demand_soon: forecast.demandSoon,
    deficit: forecast.deficit,
  });

  const earned = healthy.includes(verdict) ? LEG_POINTS : 0;

  return {
    leg: LEG_ID,
    verdict_row_id: row?.id ?? null,
    points: cite({
      value: earned,
      table: 'drive_reports',
      // NO row_ids, ON PURPOSE — see the header. This is the one place in this SD where absent row
      // ids is a decision rather than a gap, and the predicate says so out loud.
      predicate: `${LEG_POINTS} points iff the capacity verdict is one of [${healthy.join(', ')}]. `
        + 'The ladder is BIDIRECTIONAL — DEFICIT-URGENT/DEFICIT starve the belt and SURPLUS floods '
        + 'it — so the healthy state is the middle, not the top. INPUT ROWS ARE DELIBERATELY NOT '
        + 'CITED (FR-2, ruling e6876fe6): a citation proves where you looked, not the inference, and '
        + 'citing beltDepth\'s rows would make an auditor re-derive the verdict instead of reading it. '
        + `Provenance is the persisted row ${row?.id ?? '(unwritten)'}, not the inputs`,
      limitation: 'THE HEALTHY SET IS NOT RATIFIED. The PRD fixes the ladder and the persistence '
        + 'requirement but not which verdicts earn the points; TIGHT-only follows from the ladder '
        + 'being bidirectional and is an inference recorded here, injectable pending a ruling',
      source: 'lib/drive-loop/score/leg4-capacity.js scoreLeg4 (verdict from '
        + 'scripts/coordinator-capacity-forecast.mjs:385-388)',
    }),
  };
}
