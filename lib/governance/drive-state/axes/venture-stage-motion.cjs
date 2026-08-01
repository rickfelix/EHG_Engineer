/**
 * AXIS 4 — VENTURE / STAGE MOTION. SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001.
 *
 * Three genuine stall detectors already exist in three disconnected sinks (a stdout line, a snapshot
 * JSON, a cron exit code) with no per-venture state object. This axis aggregates them; it invents
 * nothing.
 *
 * This is also the axis that already articulates the SD's whole thesis, in its own words at
 * lib/eva/stage-line-closure.js: "Liveness answers 'is the process up'. CLOSURE answers 'did the
 * work happen'." That distinction was written after eleven days of zero stage executions behind
 * all-green liveness signals.
 *
 * THE ONE ADAPTATION THAT MATTERS — A FAIL-SAFE FOR AN ALARM IS A FAIL-OPEN FOR A DRIVE AXIS.
 * evaluateRealBuildStall deliberately returns {alarm:false, reason:'no-stall-signal'} when
 * lastStageAdvanceAt is null, so that missing data cannot produce a false alarm. That is exactly
 * right for an alarm and exactly wrong here: "we have no motion signal" is not "the venture is
 * moving". This adapter therefore translates that specific no-alarm reason into UNMEASURABLE rather
 * than CLEAR. Reusing the discriminator without re-reading its null contract would have shipped an
 * axis that reports healthy precisely when it is blind — the defect this SD exists to detect.
 */

'use strict';

const { STATE, ACTION } = require('../contract.cjs');

const AXIS = 'venture_stage_motion';

/** The no-alarm reason that means "I could not tell", as opposed to "it is fine". */
const NO_SIGNAL_REASON = 'no-stall-signal';

async function fetch(supabase, { now } = {}) {
  const { data, error } = await supabase
    .from('ventures')
    .select('id, name, status, orchestrator_state, current_lifecycle_stage, metadata')
    .in('status', ['active']);
  if (error) throw new Error('venture-stage-motion: query failed: ' + error.message);
  return { ventures: data || [], now };
}

/**
 * Pure. Accepts the already-evaluated per-venture verdicts so the discriminator can be exercised
 * without importing the ESM alarm module into a unit test.
 *
 * @param {object} state {evaluated: [{id, name, alarm, reason, elapsed_days, clock_days}], scanned}
 */
function classify(state, clock) {
  if (!state || !Array.isArray(state.evaluated)) {
    return {
      axis: AXIS, state: STATE.UNMEASURABLE, reason: 'no_venture_evaluations',
      citation: 'venture-stage-motion: nothing evaluated',
      owed: null, in_motion: null, stalled: null, action_taken: ACTION.UNVERIFIABLE
    };
  }
  if (state.evaluated.length === 0) {
    // No active ventures is a legitimate CLEAR — there is nothing that could be stalling. This is
    // deliberately different from fleet-health's zero-seats case, where a zero population means the
    // query failed to see a fleet that certainly exists.
    return {
      axis: AXIS, state: STATE.CLEAR, citation: 'venture-stage-motion: 0 active ventures — nothing to stall',
      owed: 0, in_motion: 0, stalled: 0, action_taken: ACTION.NONE
    };
  }

  const stalled = state.evaluated.filter((v) => v.alarm === true);
  // THE TRANSLATION. no-stall-signal means the venture has no forward-motion timestamp at all, so we
  // cannot say whether it moved. Counting it as CLEAR would be reporting health from an absence.
  const blind = state.evaluated.filter((v) => v.alarm !== true && v.reason === NO_SIGNAL_REASON);
  const moving = state.evaluated.length - stalled.length - blind.length;

  if (stalled.length > 0) {
    return {
      axis: AXIS, state: STATE.STALLED,
      citation: `venture-stage-motion: ${stalled.length} of ${state.evaluated.length} active ventures divergent-and-stalled past their tier clock — ` +
        stalled.slice(0, 3).map((v) => `${v.name || v.id}@${v.elapsed_days}d/${v.clock_days}d`).join(', '),
      owed: stalled.length, in_motion: moving, stalled: stalled.length, action_taken: ACTION.NONE
    };
  }
  if (blind.length === state.evaluated.length) {
    return {
      axis: AXIS, state: STATE.UNMEASURABLE, reason: 'no_motion_signal_on_any_venture',
      citation: `venture-stage-motion: all ${state.evaluated.length} active ventures lack a forward-motion timestamp — ` +
        'the stall evaluator fail-safes to no-alarm on missing data, which is not evidence of motion',
      owed: null, in_motion: null, stalled: null, action_taken: ACTION.UNVERIFIABLE
    };
  }
  return {
    axis: AXIS, state: STATE.CLEAR,
    citation: `venture-stage-motion: ${moving} of ${state.evaluated.length} active ventures moving, 0 stalled` +
      (blind.length ? `, ${blind.length} with no motion signal` : ''),
    owed: 0, in_motion: moving, stalled: 0, action_taken: ACTION.NONE
  };
}

module.exports = { AXIS, fetch, classify, NO_SIGNAL_REASON };
