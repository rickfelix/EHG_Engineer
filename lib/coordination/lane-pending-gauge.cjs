/**
 * Full-lane PENDING gauge for the coordinator tick.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-4.
 *
 * WHAT THIS REPLACES, AND WHAT IT DELIBERATELY LEAVES ALONE.
 * The coordinator tick printed ADAM_ADVISORIES_PENDING, computed via selectUnactionedAdvisories,
 * which is kind-scoped to adam_advisory (lib/coordinator/adam-advisory-store.cjs:48). Any pending
 * row of any other kind therefore read as ZERO — the false all-clear that let 20 rows aged 20-27h
 * sit while the gauge said nothing was waiting.
 *
 * The obvious fix — widen that selector — is FORBIDDEN and this module exists so nobody has to.
 * That selector is shared by the read-only peek AND the ack verb by design, precisely so the two
 * cannot drift apart, so widening it would not widen surfacing: it would widen RETIREMENT, and the
 * ack path would begin stamping actioned_at on ~1800 rows nobody ever acted on. That is
 * dead-lettering under a tidier name. The deferral is recorded at coordinator-quiet-tick.mjs:47-50.
 * This is therefore a SEPARATE, READ-ONLY counter: it never writes, never acks, and never touches
 * the advisory store. Surfacing scope and retirement scope stay separate, which was the whole point.
 *
 * UNWINDOWED, ON PURPOSE. The neighbouring salience counter is windowed to 30 minutes, and the
 * defect here is rows aged 20-27 HOURS. A windowed pending gauge would pass a two-armed control
 * (fresh row counts, retired row does not) while remaining blind to exactly the population that
 * motivated this work. Age is the signal; a window would discard it.
 *
 * WHY NO retention_archive JOIN, since the opposite is required elsewhere in this SD: no DRAIN RATE
 * is computable from session_coordination alone — the live table is ~8% of all rows ever written
 * and rows leave on an age/read basis regardless of whether anyone acted, so a rate taken from the
 * live table measures the purge. A PENDING BACKLOG is a different quantity. A pending row is by
 * definition still live, so archived rows are not merely unnecessary here — including them would be
 * wrong. That constraint binds rates, not backlogs.
 *
 * CLASSES ARE REPORTED SEPARATELY, never blended into one number:
 *  - actionable    — someone owns this and has not acted. The number a human should react to.
 *  - unrecognized  — no classification. COUNTED, never hidden: if unrecognized rows were dropped,
 *                    the first ownerless kind anyone introduces would be invisible from the day it
 *                    shipped, which is the defect this SD exists to fix, rebuilt inside its remedy.
 *  - informational — deliberately undrained (roll_call alone is ~1,295 rows). Counting these as
 *                    pending would manufacture a permanent breach out of correct behaviour, and a
 *                    permanently-red gauge is indistinguishable from a broken one within a week.
 */

const { classifyCoordinationRow } = require('../fleet/worker-status.cjs');

/**
 * Summarize pending (unacknowledged) rows by classification.
 *
 * @param {Array<{created_at?:string, acknowledged_at?:string|null, payload?:object}>|null} rows
 *        Rows already filtered to the lane of interest. Callers should pass UNACKNOWLEDGED rows;
 *        any row carrying acknowledged_at is skipped here too, so a caller that over-fetches is
 *        still correct rather than silently inflated.
 * @param {{nowMs?:number}} [opts]
 * @returns {{actionable:number, unrecognized:number, informational:number, total:number,
 *            oldestActionableAgeMs:number}}
 */
function summarizePendingLane(rows, { nowMs = Date.now() } = {}) {
  const out = { actionable: 0, unrecognized: 0, informational: 0, total: 0, oldestActionableAgeMs: 0 };
  if (!Array.isArray(rows)) return out;

  for (const row of rows) {
    if (!row) continue;
    if (row.acknowledged_at) continue; // already retired — must return the gauge to zero
    const { classification } = classifyCoordinationRow(row);
    if (classification === 'informational') { out.informational += 1; out.total += 1; continue; }

    if (classification === 'actionable') out.actionable += 1;
    else out.unrecognized += 1;
    out.total += 1;

    // Age is reported for the classes a human must react to. Deliberately not clamped to any
    // window — the whole defect was a gauge that could not see a 27-hour-old row.
    if (classification === 'actionable') {
      const t = Date.parse(row.created_at || '');
      if (Number.isFinite(t)) {
        const age = nowMs - t;
        if (age > out.oldestActionableAgeMs) out.oldestActionableAgeMs = age;
      }
    }
  }
  return out;
}

module.exports = { summarizePendingLane };
