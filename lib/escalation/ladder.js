/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-E — the escalation ladder and lane router.
 *
 * PURE BY CONSTRUCTION, AND THAT IS A REQUIREMENT RATHER THAN A STYLE CHOICE. -B's scope
 * bullet 10 forbids any write path from the drive-report job reaching a claim, a dispatch, or
 * an SD insert — the guardrail that keeps an instrument from becoming an actor. This module
 * therefore holds ZERO writes and lives OUTSIDE lib/drive-loop/, so -E's acting code can never
 * be reached from the report job.
 *
 * (PLAN correction, recorded so nobody re-derives it wrongly: -E's scope cites that constraint
 * as "-B's FR-7 ... anywhere under lib/drive-loop/". Measured, it is -B scope bullet 10 and it
 * is JOB-scoped, not directory-scoped. The separation is kept anyway because being stricter is
 * free; the citation is corrected so a future reader does not contort around a directory-wide
 * ban that does not exist.)
 */

/**
 * Ladder rungs, keyed by the number of consecutive ticks an item has gone unmoved.
 *
 * OFF-BY-ONE IS THE WHOLE FEATURE. A rung that fires at x1 makes the ladder noise; one that
 * fires at x6 makes it decorative. The boundaries are exact and TS-1 drives 1..5 to prove it.
 */
export const RUNG = Object.freeze({
  NONE: null,
  IN_REPORT: 'in_report',   // x2 — visible in the report, no message sent
  OWNER: 'owner',           // x3 — one message to the owning lane
  CHAIRMAN: 'chairman',     // x5 — a line in the chairman packet
});

/**
 * @param {number} ticks consecutive ticks unmoved
 * @returns {string|null} the rung that fires AT this tick, or null when none does
 */
export function rungForTicks(ticks) {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new TypeError(`[ladder] ticks must be a non-negative integer, received ${JSON.stringify(ticks)}`);
  }
  // Deliberately exact equality, not >=. A rung fires ON its tick and not again; "still true at
  // x4" is the NORMAL case for an unmoved item, and re-firing every tick thereafter is the flood
  // FR_C exists to prevent. Persistence across ticks is handled by the supersede path, not here.
  if (ticks === 2) return RUNG.IN_REPORT;
  if (ticks === 3) return RUNG.OWNER;
  if (ticks === 5) return RUNG.CHAIRMAN;
  return RUNG.NONE;
}

/** Destination lanes. Membership is exclusive — an item belongs to exactly one. */
export const LANE = Object.freeze({
  CHAIRMAN: 'chairman_packet',
  OWNER: 'owner',
  ADAM: 'adam',
});

/**
 * Route a stall to its lane BY STALL TYPE.
 *
 * EXCLUSIVITY IS THE PROPERTY THAT MATTERS. A pending-chairman item reaching an owner lane is
 * what makes the chairman packet untrustworthy — the packet's value is that everything in it is
 * genuinely the chairman's to decide. So pending-chairman is tested FIRST and returns
 * immediately; there is no path by which one stall yields two lanes.
 *
 * @param {{stall_type?:string, owner?:string|null}} stall
 * @returns {string} one of LANE
 */
export function laneForStall(stall) {
  if (!stall || typeof stall !== 'object') {
    throw new TypeError(`[ladder] stall must be an object, received ${JSON.stringify(stall)}`);
  }
  const type = String(stall.stall_type || '').toLowerCase();

  if (type === 'pending_chairman') return LANE.CHAIRMAN;
  if (type === 'unsourced') return LANE.ADAM;
  if (stall.owner) return LANE.OWNER;
  // No owner and not otherwise classified: unsourced work by definition — it has nobody to
  // route to, which is precisely what Adam materialises. Falling back to the owner lane here
  // would send a message to nobody and read as "handled".
  return LANE.ADAM;
}

/**
 * Group stalls into { lane -> stalls[] } for a single tick.
 *
 * Returned as a Map keyed by lane so the caller aggregates PER LANE PER TICK. See
 * lib/escalation/aggregate.js for why the cap must never be keyed on the recipient.
 */
export function groupByLane(stalls) {
  const out = new Map();
  for (const s of stalls || []) {
    const lane = laneForStall(s);
    if (!out.has(lane)) out.set(lane, []);
    out.get(lane).push(s);
  }
  return out;
}
