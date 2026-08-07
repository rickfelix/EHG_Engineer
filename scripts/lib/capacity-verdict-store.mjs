/**
 * DURABLE CAPACITY-VERDICT WRITER — SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001, FR-2.
 *
 * This is FR-2 CLAUSE 1 of SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B, which shipped with AC-3 UNMET.
 * Clause 2 — drive_score leg4 citing a durable row — was built. Clause 1, the row itself, was not.
 * So leg4 has been holding a citation shape pointed at nothing, and scoreLeg4 has had zero production
 * callers. scripts/coordinator-capacity-forecast.mjs computed the verdict and DISCARDED it: the file
 * contained no insert and no upsert anywhere.
 *
 * WHY THAT WENT UNNOTICED IS THE PART WORTH KEEPING: for most of the origin SD, clause 1 was
 * described in comments as leg4 being "unsourced BY DESIGN". That was an omission wearing a decision.
 * UNMET is falsifiable and invites a fix; BY DESIGN is unfalsifiable and closes the question.
 *
 * ── THIS WRITER MUST NOT CATCH ITS OWN FAILURE ────────────────────────────────────────────────
 * lib/drive-loop/score/leg4-capacity.js:72 fails the leg when persistence throws, specifically so a
 * score is never reported whose durability is unproven. A persist that caught and logged its insert
 * error would silently defeat that: leg4 would score while the row it cites does not exist — WHICH IS
 * THE EXACT DEFECT THIS SD CLOSES, RE-CREATED ONE LAYER DOWN. Swallowing the error would read as
 * defensive programming and would make every run look healthier. It throws. Deliberately.
 *
 * ── IT LIVES IN scripts/, NOT lib/drive-loop, AND THAT IS ENFORCED ────────────────────────────
 * The first version of this file was lib/drive-loop/capacity-verdict-store.js. Its own 16 tests
 * passed — and tests/unit/drive-loop/report-posture.test.js FAILED, because the FR-7 propose-only
 * scan walks every module under lib/drive-loop and fails the build on any `.insert(`. For a writer
 * that is a REAL violation, not a false positive: the drive report proposes, it never acts, and a
 * write path there would make the instrument a participant in what it measures. The sweep itself
 * lives out here for exactly this reason (drive-report-wiring.test.js pins it as [BOUNDARY]). The
 * lesson is not about placement, it is that a module's own green suite says nothing about the guards
 * that live in someone else's file.
 *
 * ── THE ROW SHAPE IS THE READER'S, NOT THIS FILE'S ────────────────────────────────────────────
 * ALSO CORRECTED FROM THE FIRST VERSION, on a different axis than the one above. It accepted
 * `{verdict, runId, detail}` while lib/drive-loop/score/leg4-capacity.js:74-80 calls its injected
 * persist with `{run_id, verdict, belt_depth, demand_soon, deficit}`. Wired together, `runId` would
 * have been undefined and belt_depth / demand_soon / deficit would have been SILENTLY DROPPED —
 * every row landing with a verdict and no measurement behind it, with 16 tests green because they
 * all exercised this file's own invented shape rather than the one call site that exists. The
 * vocabulary matched, so nobody looked at the envelope. This takes the reader's shape verbatim.
 *
 * THE VERDICT VOCABULARY IS INHERITED, NOT REDEFINED. leg4-capacity.js:38 freezes the four values and
 * :66 throws on anything else. Re-declaring them here would be a second representation of a closed
 * set, and the two copies would drift in exactly the way nobody notices until a verdict is silently
 * dropped. Imported.
 */

'use strict';

import { VERDICTS } from '../../lib/drive-loop/score/leg4-capacity.js';

/** Set by the staged migration. Named once so the writer and the DDL cannot drift apart silently. */
export const CAPACITY_VERDICT_TABLE = 'belt_capacity_verdicts';

/**
 * PostgREST / Postgres codes for "the relation does not exist".
 *
 * Named here so the ONE caller that is allowed to tolerate this state (the forecast, between merge
 * and the chairman ceremony — FR-5) classifies it the same way the sweep already classifies the
 * absent drive_reports table, rather than each site re-listing codes it half-remembers.
 */
export const TABLE_ABSENT_CODES = Object.freeze(['PGRST205', '42P01']);

/**
 * Is this the gated-but-unapplied state, as opposed to a real write failure?
 *
 * READS THE ERROR CODE, NEVER A ROW COUNT. A head-count against a missing table returns
 * {count: null, error: null} — indistinguishable from an empty table — so "did the write land"
 * cannot be answered by looking at what came back.
 */
export function isTableAbsentError(err) {
  return !!err && TABLE_ABSENT_CODES.includes(err.code);
}

/**
 * Build the persist function leg4 expects.
 *
 * The returned function matches the injection contract at leg4-capacity.js:55 — it is called with
 * the row that leg4 builds, and must durably record it or throw.
 *
 * @param {object} supabase
 * @param {object} [opts]
 * @param {string} [opts.table] - override for tests
 * @returns {(row: {run_id?: string|null, verdict: string, belt_depth: number,
 *   demand_soon: number, deficit: number, detail?: object}) => Promise<object>}
 */
export function makeCapacityVerdictPersist(supabase, opts = {}) {
  if (!supabase || typeof supabase.from !== 'function') {
    // Fail at construction rather than at the first write. A persist built from a missing client
    // would look fine until the one run that needed it, and leg4 would fail then instead of here.
    throw new Error('makeCapacityVerdictPersist(): a supabase client is required');
  }
  const table = opts.table || CAPACITY_VERDICT_TABLE;

  return async function persistCapacityVerdict(row = {}) {
    const { run_id = null, verdict, belt_depth, demand_soon, deficit, detail = null } = row;

    // The domain check is duplicated from the reader ON PURPOSE and is not a second representation:
    // this guards the WRITE, the reader guards the SCORE. Writing an unrecognised verdict would put a
    // value in the durable record that leg4 will later throw on — a row that poisons the reader that
    // cites it. Same frozen list, imported, so they cannot diverge.
    if (!VERDICTS.includes(verdict)) {
      throw new Error(
        `persistCapacityVerdict(): refusing to write unrecognised verdict ${JSON.stringify(verdict)} — `
        + `expected one of ${VERDICTS.join(', ')}. A durable row the reader will reject is worse than no row.`
      );
    }

    // The measurements are REQUIRED, and this guard is the reason the shape bug above cannot recur
    // silently. A row carrying a verdict with null belt_depth reads as measured on every dashboard
    // that renders it, and it is the shape a caller passing the wrong envelope produces — which is
    // exactly what happened. Refusing here makes that mistake loud at the first write instead of
    // discoverable later as a column of nulls nobody can explain.
    for (const [name, v] of Object.entries({ belt_depth, demand_soon, deficit })) {
      if (!Number.isFinite(v)) {
        throw new Error(
          `persistCapacityVerdict(): ${name} must be a finite number, got ${JSON.stringify(v)} — `
          + 'a verdict with no measurement behind it is a row that looks measured and is not.'
        );
      }
    }

    // recorded_at IS DELIBERATELY NOT SENT — the column's DEFAULT now() fires instead. This table
    // exists to measure a DURATION ("how long have we been in DEFICIT"), so the timestamp is the
    // one column whose provenance actually matters, and a client clock is the wrong authority for
    // it: two producers on two hosts with any drift would interleave into a history that is subtly
    // out of order, and nothing about the rows would show it. The database clock is single-sourced.
    const { data, error } = await supabase
      .from(table)
      .insert({ run_id, verdict, belt_depth, demand_soon, deficit, detail })
      .select('id, verdict, recorded_at')
      .single();

    // THROWS. See the header: leg4-capacity.js:72 depends on this propagating. Catching here would
    // let the leg score against a row that does not exist.
    if (error) {
      const err = new Error(
        `persistCapacityVerdict(): durable write failed (${error.code || 'no-code'}): ${error.message}. `
        + 'Failing rather than letting leg4 score against a row that was never written.'
      );
      // The code rides along on the thrown error so a caller with a documented reason can tell the
      // gated-but-unapplied state from a genuine failure. THE WRITER STILL THROWS — this classifies
      // the failure, it does not soften it, and any caller that softens must do so in the open.
      err.code = error.code;
      err.cause = error;
      throw err;
    }
    return data;
  };
}
