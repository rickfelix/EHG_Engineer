/**
 * AXIS 2 — COORDINATOR PERFORMANCE. SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-1.
 *
 * The BREACH STATE is measurable and fresh. The ACTION TAKEN is not, and the mechanism that appears
 * to record it is the SD's own thesis wearing a receipt.
 *
 * WHAT IS REUSED, NOT RE-DERIVED. scripts/adam-coordinator-health.mjs already composes one reading
 * with a closed failure set and, more importantly, a FIRST-CLASS HONEST-NULL VOCABULARY:
 * 'unmeasurable_until_linkage' (:115, zero claimable leaves — never a silent 100%), 'unavailable'
 * (:406, pg unreachable), 'unverifiable' (:342, git/remote unreachable — "never a silent pass and
 * never a crash"). That module got this right before this SD existed; this adapter copies its
 * vocabulary verbatim rather than inventing a parallel one. classifyBreach (:236) is pure but takes
 * no clock and its inputs are DB-coupled, so the aggregation below supplies freshness itself.
 *
 * ===== WHY action_taken IS PINNED TO UNVERIFIABLE, MEASURED 2026-08-01 OVER ALL 82 ROWS =====
 *
 * A breach lands as ONE session_coordination row addressed to the coordinator. Retirement is
 * payload.actioned_at, and adam-advisory-store.cjs:170 states it is "the ONLY thing that retires an
 * advisory". Measured over the full population of [ADAM-COORDINATOR-HEALTH] KPI-breach rows:
 *
 *   82 of 82 RETIRED. Zero open.
 *   78 of 82 record NO ACTOR AT ALL — the stamp is a bare timestamp merged into the payload.
 *   The only 4 that name an actor name 'coordinator 1449a046' — THE MEASURED PARTY ITSELF.
 *   Retirement latency: min 0.7m, p50 7.9m, 26 within 2-6m, 51 under 10m (p90 407m).
 *
 * So the lane records THAT an advisory was retired, never WHO retired it or WHAT WAS DONE. A
 * detector whose remediation signal is a self-administered timestamp with no actor and no artifact
 * is a control that emits success regardless of whether anything happened — which is the exact
 * defect class this SD exists to detect, sitting inside the loop that closes on coordinator
 * performance. Treating that stamp as evidence of action is therefore refused: ACTION.UNVERIFIABLE.
 *
 * THE DECOY, WHICH COST ME A WRONG REFUTATION BEFORE I CAUGHT IT. session_coordination HAS a
 * visible acknowledged_at COLUMN. It is NULL on every row in this lane, while payload.actioned_at is
 * set on 82 of 82. A reader who checks the obvious column concludes "nobody ever acks" — the precise
 * opposite of the truth. I made that error here, on an inherited claim I was in the act of
 * verifying, having written "a literal grep is the wrong instrument for a concept nested in JSONB"
 * into my own notes hours earlier. The column check is left documented rather than deleted, because
 * the next reader will reach for the same column.
 *
 * ALSO CORRECTED FROM THE INHERITED CONSTRAINT: advisories are NOT deleted at +24h. Retired rows
 * persist to 166.8h, past their own expires_at (oldest carries expires_at 2026-07-25, a week stale).
 * Nothing reaps them. So the evidence does not vanish — it accumulates while saying nothing.
 */

'use strict';

const { STATE, ACTION } = require('../contract.cjs');
const { safeCitation } = require('../render.cjs');

const AXIS = 'coordinator_performance';

/** Copied verbatim from adam-coordinator-health.mjs. These are ITS words for "I could not tell",
 *  and re-spelling them here would fork the vocabulary the probe already publishes. */
const HONEST_NULL = Object.freeze(['no_cohort', 'unmeasurable_until_linkage', 'unavailable', 'unverifiable']);

/** A reading older than this cannot speak for now. The probe writes every ~1-3h in practice. */
const STALE_AFTER_HOURS = 12;

async function fetch(supabase, { now } = {}) {
  // The probe's DURABLE sink (persistReading, adam-coordinator-health.mjs:308) — not the advisory
  // lane. The advisory is a notification; the snapshot is the measurement.
  const { data: snaps, error } = await supabase
    .from('codebase_health_snapshots')
    .select('score, created_at, metadata')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('coordinator-performance: snapshot query failed: ' + error.message);
  return { snapshots: snaps || [], now };
}

/**
 * Pure. `state.probe` may carry a live runProbe() reading; when absent the durable snapshot is used.
 * Freshness is computed here from timestamps — never read off a "healthy" flag.
 */
function classify(state, clock) {
  const bare = { axis: AXIS, owed: null, in_motion: null, stalled: null, action_taken: ACTION.UNVERIFIABLE };

  if (!state || !Array.isArray(state.snapshots)) {
    return Object.assign({}, bare, {
      state: STATE.UNMEASURABLE, reason: 'unavailable',
      citation: 'coordinator-performance: no reading available (probe sink unreadable)'
    });
  }

  // An honest-null status from the probe propagates AS ITSELF rather than collapsing to CLEAR.
  if (state.probe && HONEST_NULL.includes(state.probe.status)) {
    return Object.assign({}, bare, {
      state: STATE.UNMEASURABLE, reason: state.probe.status,
      citation: safeCitation(`coordinator-performance: probe reports '${state.probe.status}' — ` +
        'propagated unchanged; the probe distinguishes "cannot measure" from "measured healthy" and so does this axis', 400)
    });
  }

  const fresh = state.snapshots.filter((r) => {
    const t = Date.parse(r && r.created_at);
    return Number.isFinite(t) && (clock - t) <= STALE_AFTER_HOURS * 3600000;
  });
  if (fresh.length === 0) {
    // Zero fresh readings is NOT health. Mirrors fleet-health's zero-seat rule: a population that
    // certainly exists but was not observed cannot be reported CLEAR.
    return Object.assign({}, bare, {
      state: STATE.UNMEASURABLE, reason: 'unavailable',
      citation: safeCitation(`coordinator-performance: no reading within ${STALE_AFTER_HOURS}h ` +
        `(${state.snapshots.length} older rows seen) — the probe has not spoken recently, which is not evidence it is well`, 400)
    });
  }

  // The probe scores a breach 50 and a clean run 100 (persistReading). Read the newest fresh one.
  const latest = fresh[0];
  const breached = Number(latest.score) === 50 ||
    (state.probe && state.probe.breach && state.probe.breach.breach === true);

  const which = state.probe && state.probe.breach
    ? Object.keys(state.probe.breach).filter((k) => k !== 'breach' && state.probe.breach[k] === true)
    : [];

  const actionNote = 'action_taken UNVERIFIABLE: retirement is a bare payload.actioned_at — 82 of 82 ' +
    'breach advisories retired, 78 recording NO actor, the remaining 4 naming the measured party itself';

  if (breached) {
    return {
      axis: AXIS, state: STATE.STALLED,
      citation: safeCitation(`coordinator-performance: breach reading score=${latest.score} at ` +
        `${String(latest.created_at).slice(0, 16)}` + (which.length ? ` — classes: ${which.join(', ')}` : '') +
        `; ${actionNote}`, 400),
      owed: 1, in_motion: 0, stalled: 1,
      action_taken: ACTION.UNVERIFIABLE
    };
  }
  return {
    axis: AXIS, state: STATE.CLEAR,
    citation: safeCitation(`coordinator-performance: clean reading score=${latest.score} at ` +
      `${String(latest.created_at).slice(0, 16)}, ${fresh.length} fresh within ${STALE_AFTER_HOURS}h; ${actionNote}`, 400),
    owed: 0, in_motion: 1, stalled: 0,
    action_taken: ACTION.UNVERIFIABLE
  };
}

module.exports = { AXIS, fetch, classify, HONEST_NULL, STALE_AFTER_HOURS };
