/**
 * AXIS 5 — FLEET HEALTH. SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001.
 *
 * "Seats alive, unblocked, consuming lanes." Nine-plus liveness primitives exist in this repo and
 * ZERO aggregators — the de facto composition point (fleet-dashboard) is a renderer that returns
 * nothing. So this adapter aggregates rather than invents, reusing the stuck-seat predicate whose
 * three-valued verdict (STUCK | HEALTHY | UNKNOWN, with UNKNOWN never folded into HEALTHY) is the
 * shape the whole drive-state contract was modelled on.
 *
 * FETCH AND CLASSIFY ARE SEPARATE, and that is load-bearing rather than stylistic: a correct
 * classifier fed a wrongly-fetched field reports CLEAR forever with a fully green suite. The wiring
 * is therefore tested independently of the verdict.
 */

'use strict';

const { STATE, ACTION } = require('../contract.cjs');
const { fetchPopulation } = require('../../../fleet/stuck-seat-population.cjs');
const { classifySeat, VERDICT } = require('../../../fleet/stuck-seat-predicate.cjs');

const AXIS = 'fleet_health';

/** Display cut point. The predicate itself ships no default and throws without one (its own TR-4:
 *  the ordering is established, the cut point is not), so the caller must state a number — and this
 *  axis states it in its citation so the calibration is visible where it is consumed. */
const TOOL_SILENCE_CUT_MINUTES = 120;

async function fetch(supabase, { now } = {}) {
  const { seats, truncated } = await fetchPopulation(supabase);
  const results = seats.map((row) => classifySeat(row, { cutPointMinutes: TOOL_SILENCE_CUT_MINUTES, now }));
  return {
    scanned: seats.length,
    truncated: Boolean(truncated),
    stuck: results.filter((r) => r.verdict === VERDICT.STUCK).map((r) => ({ session_id: r.session_id, silent: r.toolSilentMinutes })),
    unknown: results.filter((r) => r.verdict === VERDICT.UNKNOWN).length
  };
}

/**
 * Pure. No I/O, no wall clock.
 *
 * SCANNING NOTHING IS NOT HEALTH. A population of zero means the probe could not see the fleet, not
 * that the fleet is fine — the same distinction the stuck-seat strip had to be corrected to make
 * after a reviewer mutated its query and watched it render silence.
 */
function classify(state, clock) {
  if (!state || typeof state.scanned !== 'number') {
    return {
      axis: AXIS, state: STATE.UNMEASURABLE, reason: 'no_population',
      citation: 'fleet-health: population query returned nothing to classify',
      owed: null, in_motion: null, stalled: null, action_taken: ACTION.UNVERIFIABLE
    };
  }
  if (state.scanned === 0) {
    return {
      axis: AXIS, state: STATE.UNMEASURABLE, reason: 'scanned_zero_seats',
      citation: 'fleet-health: scanned 0 seats — a blind probe, not a healthy fleet',
      owed: null, in_motion: null, stalled: null, action_taken: ACTION.UNVERIFIABLE
    };
  }

  const stuckCount = state.stuck.length;
  const base = `fleet-health: ${state.scanned} seats scanned, ${stuckCount} tool-silent >= ${TOOL_SILENCE_CUT_MINUTES}m, ${state.unknown} unknown` +
    (state.truncated ? ' [TRUNCATED at the row cap]' : '');

  if (stuckCount > 0) {
    return {
      axis: AXIS, state: STATE.STALLED,
      citation: base + ' — ' + state.stuck.slice(0, 3).map((s) => `${s.session_id.slice(0, 8)}@${s.silent}m`).join(', '),
      owed: stuckCount, in_motion: state.scanned - stuckCount - state.unknown, stalled: stuckCount,
      // A stuck seat is a condition nobody has demonstrably acted on; claiming otherwise would need
      // an artifact, and there is none to cite.
      action_taken: ACTION.NONE
    };
  }
  // UNKNOWN seats are reported but do not by themselves make the axis STALLED — they make the CLEAR
  // qualified, which is why the count rides in the citation rather than being dropped.
  return {
    axis: AXIS, state: STATE.CLEAR, citation: base,
    owed: 0, in_motion: state.scanned - state.unknown, stalled: 0, action_taken: ACTION.NONE
  };
}

module.exports = { AXIS, fetch, classify, TOOL_SILENCE_CUT_MINUTES };
