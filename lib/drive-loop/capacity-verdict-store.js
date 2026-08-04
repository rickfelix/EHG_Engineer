/**
 * DURABLE CAPACITY-VERDICT WRITER — SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001, FR-2.
 *
 * This is FR-2 CLAUSE 1 of SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B, which shipped with AC-3 UNMET.
 * Clause 2 — drive_score leg4 citing a durable row — was built. Clause 1, the row itself, was not.
 * So leg4 has been holding a citation shape pointed at nothing, and scoreLeg4 has had zero production
 * callers. scripts/coordinator-capacity-forecast.mjs computes the verdict at :384-388 and DISCARDS
 * it: the file contains no insert and no upsert anywhere.
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
 * THE VERDICT VOCABULARY IS INHERITED, NOT REDEFINED. leg4-capacity.js:38 freezes the four values and
 * :66 throws on anything else. Re-declaring them here would be a second representation of a closed
 * set, and the two copies would drift in exactly the way nobody notices until a verdict is silently
 * dropped. Imported.
 */

'use strict';

import { VERDICTS } from './score/leg4-capacity.js';

/** Set by the staged migration. Named once so the writer and the DDL cannot drift apart silently. */
export const CAPACITY_VERDICT_TABLE = 'belt_capacity_verdicts';

/**
 * Build the persist function leg4 expects.
 *
 * Returns a function matching the injection contract at leg4-capacity.js:55 — it is called with the
 * verdict this run reached and must durably record it, or throw.
 *
 * @param {object} supabase
 * @param {object} [opts]
 * @param {string} [opts.table] - override for tests
 * @returns {(args: {verdict: string, runId?: string|null, detail?: object}) => Promise<object>}
 */
export function makeCapacityVerdictPersist(supabase, opts = {}) {
  if (!supabase || typeof supabase.from !== 'function') {
    // Fail at construction rather than at the first write. A persist built from a missing client
    // would look fine until the one run that needed it, and leg4 would fail then instead of here.
    throw new Error('makeCapacityVerdictPersist(): a supabase client is required');
  }
  const table = opts.table || CAPACITY_VERDICT_TABLE;

  return async function persistCapacityVerdict({ verdict, runId = null, detail = null } = {}) {
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

    const { data, error } = await supabase
      .from(table)
      .insert({ verdict, run_id: runId, detail, recorded_at: new Date().toISOString() })
      .select('id, verdict, recorded_at')
      .single();

    // THROWS. See the header: leg4-capacity.js:72 depends on this propagating. Catching here would
    // let the leg score against a row that does not exist.
    if (error) {
      throw new Error(
        `persistCapacityVerdict(): durable write failed (${error.code || 'no-code'}): ${error.message}. `
        + 'Failing rather than letting leg4 score against a row that was never written.'
      );
    }
    return data;
  };
}
