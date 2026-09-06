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
 * RATIFIED — chairman ratification be6e9d73 (under ffebbd68), SD-LEO-INFRA-DRIVE-SCORE-LEG4-001.
 * Supersedes the prior binary HEALTHY_VERDICTS-only rule (TIGHT=2, everything else=0), which
 * collapsed leg4 to two values and read 0 on nine of the last ten drive_reports rows measured at
 * plan time. The graduated mapping is a point on the bidirectional ladder, not a re-ranking of it:
 * TIGHT (the target) earns the full LEG_POINTS; DEFICIT and SURPLUS (one step off-target on
 * either side) each earn half; DEFICIT-URGENT (the worst state) earns zero. DEFICIT and SURPLUS
 * intentionally score the SAME value — that is the ratified mapping, not a collision to "fix".
 * Exported and injectable, mirroring the array it replaces, so a future ratification stays a
 * one-line change.
 */
export const EARNING_POINTS = Object.freeze({
  'DEFICIT-URGENT': 0,
  DEFICIT: 1,
  TIGHT: 2,
  SURPLUS: 1,
});

/**
 * ⚠️ NOT RATIFIED (SD-LEO-FIX-DRIVE-SCORE-GRADIENT-001, FR-3). Chairman ratification ffebbd68
 * authorizes PROPOSING a gradient in place of leg4's binary TIGHT-only earning rule; it does NOT
 * ratify this specific mapping or any numeric scale — the illustrative values below are a telemetry
 * proposal, not a decision. This field is ALWAYS computed and reported ALONGSIDE the existing,
 * completely unchanged `points`/`earned` value in scoreLeg4() below — never replacing it. Enabling
 * any earning rule derived from this field is a separate, explicit chairman decision routed as a
 * structured decision packet, not decided in code by this SD.
 */
export const LADDER_DISTANCE = Object.freeze({
  'DEFICIT-URGENT': -2,
  DEFICIT: -1,
  TIGHT: 0,
  SURPLUS: -1,
});

/**
 * @param {object} o
 * @param {() => {verdict:string, beltDepth:number, demandSoon:number, deficit:number}} o.computeVerdict
 * @param {(row:object) => {id:string}} o.persist writes the durable row; returns its id
 * @param {Record<string, number>} [o.earning] the ratified points table, injectable pending a future
 *   ratification change. Renamed from the prior binary `healthy` array (TR-2) so a caller still
 *   passing the old array shape gets the correct ratified default rather than a silently
 *   misinterpreted parameter.
 * @param {string} [o.runId]
 */
export function scoreLeg4({ computeVerdict, persist, earning = EARNING_POINTS, runId = null } = {}) {
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

  const earned = earning[verdict] ?? 0;
  const ladderDistance = LADDER_DISTANCE[verdict];

  return {
    leg: LEG_ID,
    verdict_row_id: row?.id ?? null,
    ladder_distance: cite({
      value: ladderDistance,
      table: 'drive_reports',
      // Same provenance decision as `points` below, for the same reason (see header): the row is
      // the record, the inputs are not cited.
      row_ids: row?.id ? [row.id] : [],
      predicate: 'illustrative signed distance from TIGHT on the bidirectional ladder '
        + `(${VERDICTS.join(' -> ')}). ALWAYS computed and reported alongside the unchanged points `
        + 'value below -- telemetry only, this SD does not change scoring',
      limitation: 'NOT RATIFIED. Chairman ratification ffebbd68 authorizes PROPOSING a gradient in '
        + 'place of the binary TIGHT-only earning rule; it does NOT ratify this mapping or any '
        + 'numeric scale. Enabling an earning rule derived from this field is a separate chairman '
        + 'decision, routed as a structured decision packet, never decided in code',
      source: 'lib/drive-loop/score/leg4-capacity.js scoreLeg4',
    }),
    points: cite({
      value: earned,
      table: 'drive_reports',
      // NO row_ids, ON PURPOSE — see the header. This is the one place in this SD where absent row
      // ids is a decision rather than a gap, and the predicate says so out loud.
      predicate: 'Points per verdict, ratified be6e9d73 (under ffebbd68): '
        + `${VERDICTS.map((v) => `${v}=${earning[v]}`).join(', ')}, of LEG_POINTS=${LEG_POINTS}. `
        + 'The ladder is BIDIRECTIONAL — DEFICIT-URGENT/DEFICIT starve the belt and SURPLUS floods '
        + 'it — so the healthy state is the middle, not the top; DEFICIT and SURPLUS intentionally '
        + 'earn the same value, which is the ratified mapping, not a collision. INPUT ROWS ARE '
        + 'DELIBERATELY NOT CITED (FR-2, ruling e6876fe6): a citation proves where you looked, not '
        + 'the inference, and citing beltDepth\'s rows would make an auditor re-derive the verdict '
        + `instead of reading it. Provenance is the persisted row ${row?.id ?? '(unwritten)'}, not the inputs`,
      limitation: 'THE POINTS TABLE IS RATIFIED (be6e9d73/ffebbd68), superseding the prior binary '
        + 'TIGHT-only rule. It is still injectable (the `earning` parameter) so a future ratification '
        + 'change stays a one-line change rather than a code restructure.',
      source: 'lib/drive-loop/score/leg4-capacity.js scoreLeg4 (verdict from '
        + 'scripts/coordinator-capacity-forecast.mjs:385-388)',
    }),
  };
}
