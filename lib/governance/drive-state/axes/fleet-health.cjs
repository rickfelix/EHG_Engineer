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
const { extractFleetIdentityLabel } = require('../../../fleet/fleet-identity-label.cjs');
const { renderKeystrokePacket } = require('../../../fleet/stuck-seat-keystroke-packet.cjs');

const AXIS = 'fleet_health';

/** NOT a display value (TESTING sub-agent finding L1, EXEC-phase review of FR-1: the prior wording
 *  here was stale narration on a load-bearing line) — this constant DETERMINES the axis STATE: see
 *  classify() below, `if (stuckCount > 0) return STATE.STALLED`. A miscalibration here changes a
 *  governance drive-score axis, not merely what gets printed. The predicate itself ships no default
 *  and throws without one (its own TR-4: the ordering is established, the cut point is not), so the
 *  caller must state a number — and this axis states it in its citation so the calibration is
 *  visible where it is consumed.
 *  RECALIBRATED (SD-LEO-INFRA-FLEET-DOWN-ALERT-001 FR-1, ~44-sample measurement): kept in sync with
 *  lib/fleet/genuine-worker.mjs's FREEZE_CUT_MINUTES and fleet-dashboard.cjs's
 *  STUCK_SEAT_CUT_POINT_MINUTES — see genuine-worker.mjs for the full calibration rationale.
 *  NOTE (L1): that same FREEZE_CUT_MINUTES is ALSO the fallback default for
 *  scripts/lib/engagement-buckets.mjs's classifySessionBucket() ZOMBIE-bucket cut point (via
 *  isKnownWedged's own `cutMinutes = FREEZE_CUT_MINUTES` default, used whenever a caller doesn't
 *  override it) — which feeds that module's engagement-ratio census. The ~44-sample study
 *  (pager-latency/false-positive framing) was never measured against that consumer; no regression
 *  was observed live at recalibration time (fleet_health STALLED at both 60m and 120m, 60–119m band
 *  empty), but the absence of measurement is the gap, not proof of safety.
 *  CONFIRMED LIVE CONSUMERS (deep-tier /ship review, independently verified — neither passes
 *  cutMinutes, so both inherit this default): scripts/adam-coordinator-health.mjs:546-550 and
 *  scripts/lib/capacity-inputs.mjs:445-449 both call classifyEngagementBuckets(...) unqualified.
 *  Any session with last_tool_at stale between 60-120min now reads ZOMBIE where it previously read
 *  ENGAGED/IDLE in whatever feeds off those two call sites (coordinator health probe, capacity
 *  forecasting inputs) — a real, live behavior change this SD shipped without measuring against
 *  those specific consumers. Re-measure before treating their output as unaffected. */
const TOOL_SILENCE_CUT_MINUTES = 60;

async function fetch(supabase, { now } = {}) {
  const { seats, truncated } = await fetchPopulation(supabase);
  const results = seats.map((row) => classifySeat(row, { cutPointMinutes: TOOL_SILENCE_CUT_MINUTES, now }));
  return {
    scanned: seats.length,
    truncated: Boolean(truncated),
    // SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 FR-3: carry window_handle/fleet_identity through
    // rather than discarding them here — classifySeat() now exposes them (FR-4) so a human-rescue
    // citation downstream can name WHICH window/terminal a STUCK seat is in.
    stuck: results.filter((r) => r.verdict === VERDICT.STUCK).map((r) => ({
      session_id: r.session_id,
      silent: r.toolSilentMinutes,
      window_handle: r.window_handle,
      fleet_identity: r.fleet_identity
    })),
    unknown: results.filter((r) => r.verdict === VERDICT.UNKNOWN).length
  };
}

/** One stuck seat's citation fragment. Identity fields are OPTIONAL — a seat classified before
 *  FR-4 shipped, or one whose metadata never carried window_handle/fleet_identity, still renders
 *  (documented fallback: the bracket is simply omitted, never a placeholder string).
 *  D1 FIX (EXEC-phase non-prospective TESTING review, 2026-08-26): fleet_identity is an OBJECT on
 *  a live census (28/28 non-null rows), never a bare string — extractFleetIdentityLabel() reads
 *  its .callsign, not the raw value (raw interpolation rendered "[object Object]"). window_handle
 *  is real-world a NUMBER (20/20) — `!= null` instead of a truthy check so window_handle=0 is not
 *  silently treated as absent. */
function renderStuckSeat(s) {
  const base = `${s.session_id.slice(0, 8)}@${s.silent}m`;
  const identity = [];
  if (s.window_handle != null) identity.push(`window=${s.window_handle}`);
  const label = extractFleetIdentityLabel(s.fleet_identity);
  if (label) identity.push(`identity=${label}`);
  return identity.length ? `${base} [${identity.join(' ')}]` : base;
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
      // SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 FR-3: list ALL stuck seats, not a slice(0, 3) —
      // a chairman recovering a wedged worker needs to see every one, not just the first three the
      // population query happened to return.
      citation: base + ' — ' + state.stuck.map(renderStuckSeat).join(', '),
      owed: stuckCount, in_motion: state.scanned - stuckCount - state.unknown, stalled: stuckCount,
      // A stuck seat is a condition nobody has demonstrably acted on; claiming otherwise would need
      // an artifact, and there is none to cite.
      action_taken: ACTION.NONE,
      // FR-4, D2 fix: the citation above is capped at 160 chars by render.cjs's safeCitation() and
      // has its newlines stripped, so a numbered recovery packet cannot live INSIDE the citation
      // string without being silently mangled. keystroke_packets is a SEPARATE field carrying one
      // full, un-truncated recovery packet per stuck seat — drive-state-owed-emitter.cjs appends
      // these (unmangled) to the fleet_health owed-action's lane-row body, the same
      // coordinator-visible surface the citation reaches. This reuses the EXISTING fleet_health
      // axis/recover_stuck_seat registration; it is not a new axis or owed-action type.
      keystroke_packets: state.stuck.map(renderKeystrokePacket)
    };
  }
  // UNKNOWN seats are reported but do not by themselves make the axis STALLED — they make the CLEAR
  // qualified, which is why the count rides in the citation rather than being dropped.
  return {
    axis: AXIS, state: STATE.CLEAR, citation: base,
    owed: 0, in_motion: state.scanned - state.unknown, stalled: 0, action_taken: ACTION.NONE,
    keystroke_packets: []
  };
}

module.exports = { AXIS, fetch, classify, TOOL_SILENCE_CUT_MINUTES };
