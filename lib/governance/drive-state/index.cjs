/**
 * FULL-SPECTRUM DRIVE-STATE PROBE — the composer.
 * SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-1.
 *
 * One call, six axis entries, no axis skippable and no axis silently absent.
 *
 * WHY THE COMPOSER ITERATES THE FROZEN AXIS LIST RATHER THAN THE ADAPTER MAP.
 * If it iterated the adapters, deleting one would produce a five-axis verdict that still looked
 * complete — every entry present and well-formed, just fewer of them. Iterating AXES makes the
 * absence a throw. This is the same discipline as the shape assertions in contract.cjs: the failure
 * mode this SD exists to remove is a report that is confidently silent about what it could not see.
 *
 * FETCH IS SEPARATED FROM VERDICT throughout. Each adapter exports a pure classify(state, clock)
 * with no I/O and a separate fetch(supabase). That split is not stylistic — it is what makes the
 * WIRING independently testable. A perfectly correct classifier fed a wrongly-fetched field reports
 * CLEAR forever with a fully green suite, which is precisely how a blind detector passes review.
 */

'use strict';

const { AXES, STATE, ACTION, assertAxisEntry, summarise } = require('./contract.cjs');

/**
 * Build the drive-state verdict.
 *
 * @param {object} opts
 * @param {object} opts.adapters - {axisName: {fetch(supabase), classify(state, clock)}}
 * @param {object} [opts.supabase] - passed to each adapter's fetch()
 * @param {number|Date} [opts.now] - injected clock; adapters must not read the wall clock themselves
 * @returns {Promise<{axes: object[], summary: {clear,stalled,unmeasurable}, measured_at: string}>}
 */
async function computeDriveState({ adapters, supabase, now } = {}) {
  if (!adapters || typeof adapters !== 'object') {
    throw new Error('drive-state: adapters map is required');
  }
  const clock = now instanceof Date ? now.getTime() : Number.isFinite(now) ? now : Date.now();

  const entries = [];
  for (const axis of AXES) {
    const adapter = adapters[axis];
    if (!adapter || typeof adapter.classify !== 'function') {
      // THE THROW THAT MAKES A PARTIAL VERDICT IMPOSSIBLE. Do not soften this into a skip or a
      // synthesised UNMEASURABLE entry: an axis nobody wired and an axis that genuinely cannot be
      // measured are different facts, and collapsing them would hide a build error inside an
      // honest-looking state.
      throw new Error(`drive-state: no adapter registered for axis '${axis}' — refusing to emit a partial verdict`);
    }

    let entry;
    try {
      const state = typeof adapter.fetch === 'function' ? await adapter.fetch(supabase, { now: clock }) : null;
      entry = adapter.classify(state, clock);
    } catch (err) {
      // A THROWING ADAPTER IS UNMEASURABLE, NOT CLEAR. Fail toward "I could not see", never toward
      // health — a fetch that blew up tells us nothing about whether that axis is moving.
      entry = {
        axis,
        state: STATE.UNMEASURABLE,
        reason: 'adapter_threw',
        citation: `${axis} adapter threw: ${err && err.message ? err.message : String(err)}`,
        owed: null,
        in_motion: null,
        stalled: null,
        action_taken: ACTION.UNVERIFIABLE
      };
    }
    entries.push(assertAxisEntry(entry, axis));
  }

  return Object.freeze({
    axes: Object.freeze(entries),
    summary: summarise(entries),
    measured_at: new Date(clock).toISOString()
  });
}

module.exports = { computeDriveState };
