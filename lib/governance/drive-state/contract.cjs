/**
 * FULL-SPECTRUM DRIVE LAW — the shape contract.
 * SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-1.
 *
 * Chairman-ratified (terminal, 2026-07-31): "my definition of drive includes your definition but
 * also needs to include driving the orchestrator to perform its job. driving progress to achieve
 * completion of the roadmap" → six axes proposed → "I like those six".
 *
 * THE ONE INVARIANT THIS FILE EXISTS TO ENFORCE: an axis that cannot be measured says so.
 * A probe that reports CLEAR for an axis it cannot see is the exact defect this SD was written to
 * detect, one level up — so UNMEASURABLE is a first-class state carrying a mandatory reason and
 * citation, and it is never foldable into CLEAR. The vocabulary is lifted from the one axis that
 * already got this right (scripts/adam-coordinator-health.mjs, whose runProbe returns first-class
 * no_cohort / unmeasurable_until_linkage / unavailable / unverifiable states) rather than reinvented.
 */

'use strict';

/**
 * THE SIX AXES ARE FROZEN AND ORDERED. The composer iterates THIS, not whatever adapters happen to
 * be registered — so a missing adapter is a throw rather than a five-axis verdict. "All axes clear"
 * is only meaningful if the set of axes is fixed and known.
 */
const AXES = Object.freeze([
  'chairman_decisions',
  'coordinator_performance',
  'roadmap_motion',
  'venture_stage_motion',
  'fleet_health',
  'learning_conversion'
]);

/** Closed set. Asserted directly in tests, never by not.toContain — which cannot catch an omission. */
const STATE = Object.freeze({ CLEAR: 'CLEAR', STALLED: 'STALLED', UNMEASURABLE: 'UNMEASURABLE' });
const STATES = Object.freeze(Object.values(STATE));

/**
 * action_taken IS A CLOSED DOMAIN TOO, and that is a correction from review. The first draft
 * specified the closed set for `state` alone, gave action_taken no acceptance criterion and no test,
 * and left it out of the renderer's refusal — so the one field that reads as evidence-something-was-
 * done was the one field nothing checked. RECORDED requires a citation; UNVERIFIABLE is the honest
 * answer when no already-existing artifact can evidence it.
 *
 * Note the deliberate absence of a "DONE" value. Per the drain-descriptor prohibition, forcing
 * judgment work to emit a row purely so a counter can see it is forbidden — so action_taken is
 * satisfiable only by an artifact that already exists, never by compelling one into being.
 */
const ACTION = Object.freeze({ NONE: 'NONE', RECORDED: 'RECORDED', UNVERIFIABLE: 'UNVERIFIABLE' });
const ACTIONS = Object.freeze(Object.values(ACTION));

/**
 * Validate one axis entry. Throws rather than returning a partial — the composer must not be able to
 * emit a verdict with a hole in it, because a hole renders identically to an all-clear.
 * @returns {object} the same entry, frozen
 */
function assertAxisEntry(entry, axis) {
  const where = `drive-state axis '${axis}'`;
  if (!entry || typeof entry !== 'object') throw new Error(`${where}: adapter returned no entry`);
  if (entry.axis !== axis) throw new Error(`${where}: entry.axis is '${entry.axis}', expected '${axis}'`);
  if (!STATES.includes(entry.state)) {
    throw new Error(`${where}: state '${entry.state}' is not one of ${STATES.join(' | ')}`);
  }
  // A citation is mandatory on EVERY state, not only on UNMEASURABLE. "All axes clear" is
  // assertable only when each axis was individually checked AND is citable — that is the whole
  // difference between a checked all-clear and an unchecked one.
  if (typeof entry.citation !== 'string' || entry.citation.trim() === '') {
    throw new Error(`${where}: citation is required on every state, including ${entry.state}`);
  }
  if (entry.state === STATE.UNMEASURABLE && (typeof entry.reason !== 'string' || !entry.reason.trim())) {
    throw new Error(`${where}: UNMEASURABLE requires a reason token`);
  }
  if (!ACTIONS.includes(entry.action_taken)) {
    throw new Error(`${where}: action_taken '${entry.action_taken}' is not one of ${ACTIONS.join(' | ')}`);
  }
  if (entry.action_taken === ACTION.RECORDED && (typeof entry.action_citation !== 'string' || !entry.action_citation.trim())) {
    throw new Error(`${where}: action_taken=RECORDED requires an action_citation naming the existing artifact`);
  }
  return Object.freeze(entry);
}

/**
 * THE ONLY SANCTIONED SUMMARISER, and the reason it is the only one.
 * A reviewer showed the trivial fold that defeated the first design:
 *   axes.filter(a => a.state !== 'STALLED').length === 6
 * merges CLEAR and UNMEASURABLE, reads as "all six checked, none stalled", passes a completeness
 * check and satisfies any phrase ban — while the probe is blind. The original acceptance criterion
 * ("no consumer helper may count UNMEASURABLE as clear") cannot be quantified over helpers that do
 * not exist yet, so the defence is structural instead: this module exports THREE SEPARATE COUNTS
 * and deliberately exports NO boolean allClear(). There is nothing to fold.
 */
function summarise(entries) {
  const counts = { clear: 0, stalled: 0, unmeasurable: 0 };
  for (const e of entries) {
    if (e.state === STATE.CLEAR) counts.clear += 1;
    else if (e.state === STATE.STALLED) counts.stalled += 1;
    else counts.unmeasurable += 1;
  }
  return Object.freeze(counts);
}

module.exports = { AXES, STATE, STATES, ACTION, ACTIONS, assertAxisEntry, summarise };
