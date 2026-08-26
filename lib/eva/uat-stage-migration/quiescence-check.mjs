/**
 * Stage-quiescent freeze check (FR-2 AC-1) for the UAT-stage renumber migration.
 *
 * The renumber must never apply while a venture is mid-transition through the stage range
 * about to be renumbered (23-26) -- doing so would leave a live state pointer meaning something
 * different the moment the DDL commits.
 *
 * REVISION NOTE: an independent adversarial TESTING sub-agent review found the original version
 * of this module queried venture_stage_transitions.completed_at -- a column that does not exist
 * on that table (verified live). venture_stage_transitions is an append-only log the RPCs
 * (advance_venture_stage/fn_advance_venture_stage) write to AFTER a transition already succeeded,
 * in the SAME statement/transaction as the ventures update -- it has no "in progress" row shape
 * at all, so it can never observe a live in-flight transition. The correct live signal is
 * venture_stage_work.stage_status = 'in_progress', which the same RPCs set/clear as part of an
 * actual advance -- this module and its SQL-migration counterpart now both query that instead.
 */
'use strict';

/** stage_number range this SD's migration renumbers (23-26 -> 24-27). */
export const RENUMBER_RANGE = Object.freeze({ min: 23, max: 26 });

/**
 * PURE: a venture_stage_work row is "mid-transition" when its stage_status is 'in_progress' and
 * its lifecycle_stage touches the renumber range.
 * @param {Array<{lifecycle_stage?:number|null, stage_status?:string|null}>} stageWorkRows
 * @param {{min:number,max:number}} [range]
 */
export function checkQuiescence(stageWorkRows = [], range = RENUMBER_RANGE) {
  const inFlight = (stageWorkRows || []).filter((row) => {
    if (row?.stage_status !== 'in_progress') return false;
    const stage = Number(row?.lifecycle_stage);
    return Number.isFinite(stage) && stage >= range.min && stage <= range.max;
  });

  return {
    quiescent: inFlight.length === 0,
    inFlightCount: inFlight.length,
    inFlight,
  };
}

/** IO: fetch venture_stage_work rows still in flight through the renumber range. */
export async function fetchInFlightTransitions(client, range = RENUMBER_RANGE) {
  const { rows } = await client.query(
    `SELECT id, venture_id, lifecycle_stage, stage_status
     FROM venture_stage_work
     WHERE stage_status = 'in_progress'
       AND lifecycle_stage BETWEEN $1 AND $2`,
    [range.min, range.max]
  );
  return rows;
}

/** Compose fetch + check. The apply-time CLI calls this and refuses to proceed when not quiescent. */
export async function runQuiescenceCheck(client, range = RENUMBER_RANGE) {
  const rows = await fetchInFlightTransitions(client, range);
  return checkQuiescence(rows, range);
}
