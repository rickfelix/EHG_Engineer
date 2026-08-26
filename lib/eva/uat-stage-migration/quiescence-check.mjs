/**
 * Stage-quiescent freeze check (FR-2 AC-1) for the UAT-stage renumber migration.
 *
 * The renumber must never apply while a venture is mid-transition through the stage range
 * about to be renumbered (23-26) -- doing so would leave a venture_stage_transitions row
 * pointing at a stage_number that means something different the moment the DDL commits.
 */
'use strict';

/** stage_number range this SD's migration renumbers (23-26 -> 24-27). */
export const RENUMBER_RANGE = Object.freeze({ min: 23, max: 26 });

/**
 * PURE: a venture_stage_transitions row is "mid-transition" when it has no completed_at yet
 * and touches the renumber range on either end.
 * @param {Array<{from_stage?:number|null, to_stage?:number|null, completed_at?:string|null}>} transitionRows
 * @param {{min:number,max:number}} [range]
 */
export function checkQuiescence(transitionRows = [], range = RENUMBER_RANGE) {
  const inFlight = (transitionRows || []).filter((row) => {
    if (row?.completed_at) return false;
    const stages = [row?.from_stage, row?.to_stage]
      .filter((s) => s !== null && s !== undefined)
      .map(Number);
    return stages.some((s) => s >= range.min && s <= range.max);
  });

  return {
    quiescent: inFlight.length === 0,
    inFlightCount: inFlight.length,
    inFlight,
  };
}

/** IO: fetch venture_stage_transitions rows still in flight through the renumber range. */
export async function fetchInFlightTransitions(client, range = RENUMBER_RANGE) {
  const { rows } = await client.query(
    `SELECT id, venture_id, from_stage, to_stage, completed_at
     FROM venture_stage_transitions
     WHERE completed_at IS NULL
       AND (from_stage BETWEEN $1 AND $2 OR to_stage BETWEEN $1 AND $2)`,
    [range.min, range.max]
  );
  return rows;
}

/** Compose fetch + check. The apply-time CLI calls this and refuses to proceed when not quiescent. */
export async function runQuiescenceCheck(client, range = RENUMBER_RANGE) {
  const rows = await fetchInFlightTransitions(client, range);
  return checkQuiescence(rows, range);
}
