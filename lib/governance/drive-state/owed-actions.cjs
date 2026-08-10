/**
 * DRIVE-STATE FORCING-FUNCTION — SD-LEO-INFRA-DRIVE-STATE-FORCING-001.
 *
 * The six-axis probe MEASURES; nothing PREVENTED a silent stall — both consumers rendered the
 * verdict and discarded it, and a gauge displayed but not acted-on is, for prevention purposes,
 * indistinguishable from absent (the fleet drifted to "busy" while an axis stalled, 2026-08-08).
 * This module is the prevention half: a per-axis STALLED verdict derives an OWED ACTION that
 * withholds the summary tail (the closest thing to an all-green line this subsystem has) until
 * the axis itself moves again.
 *
 * THIS IS DELIBERATELY NOT AN EXTENSION OF verifyComplete. Completeness and stall are different
 * measurements: a STALLED axis with action_taken=NONE is a COMPLETE verdict, and folding stall
 * into the completeness refusal would render probe-broken and probe-working-and-reporting-a-stall
 * identically — the CLEAR-vs-UNMEASURABLE vocabulary collapse reproduced one layer up. Owed
 * actions are a third channel with their own lines and their own loud failure.
 *
 * DRAIN-DESCRIPTOR SAFE. Per contract.cjs:44-47 there is no DONE action and no row may be
 * compelled into being just so a counter can see it. Clearance here is keyed on GROUND-TRUTH
 * MOTION — the axis leaving STALLED at the next derivation — never on an acknowledgement stamp.
 * The emitted lane row (see scripts/lib/drive-state-owed-emitter.cjs) is the loudness mechanism,
 * not the clearance mechanism.
 *
 * DATA TRAVELS IN RETURN VALUES, NEVER ON THROWN ERRORS. Both production catch blocks stringify
 * (adam-pm-board.mjs:107-108, coordinator-hourly-review.cjs catch) — any structured payload on an
 * error object dies before it reaches a reader, so the only information a throw here carries is
 * its message string.
 */

'use strict';

const { STATE } = require('./contract.cjs');
const { renderDriveState } = require('./render.cjs');

/**
 * CLOSED PER-AXIS IMPERATIVE ACT SET — an act is a verb someone can perform, and the type system
 * says so (the modelling precedent is lib/drive-loop/sections/next-acts.js ACTS; the set is COPIED
 * as a pattern, not imported — that file is ESM and this is CJS, and require() across that
 * boundary throws ERR_REQUIRE_ESM). All six axes get an act so unpinning roadmap_motion or
 * learning_conversion later cannot make derivation throw — but note only four axes can emit
 * STALLED today (the other two classify() as pinned UNMEASURABLE constants).
 */
const OWED_ACTS = Object.freeze({
  chairman_decisions: 'route_pending_decision',
  coordinator_performance: 'restore_coordinator_cadence',
  roadmap_motion: 'unblock_roadmap_rung',
  venture_stage_motion: 'restart_stage_motion',
  fleet_health: 'recover_stuck_seat',
  learning_conversion: 'convert_learning_backlog',
});

/** Basis older than 2x the hourly persist cadence is stale — see basisStaleness. */
const BASIS_MAX_AGE_MS = 2 * 60 * 60 * 1000;

/** The rendered summary tail this module withholds. Located by CONTENT, not by position — a
 *  positional slice is a guard whose subject can move under it. */
const TAIL_PREFIX = '  axes=';

/**
 * Derive owed actions from a verdict. TWO-SIDED BY CONSTRUCTION: only state===STALLED derives;
 * CLEAR and UNMEASURABLE derive nothing on every path. action_taken NEVER suppresses — an
 * UNVERIFIABLE (the shipped value on three of six axis paths) or even a RECORDED action does not
 * un-stall the axis, so treating it as a silencer would hand every stalled axis a free pass.
 *
 * @param {object} opts
 * @param {object} opts.verdict computeDriveState's return {axes, summary, measured_at}
 * @param {Array|null} [opts.spans] currentStallSpans() output; null when the caller may not read
 *        the store (adam-pm-board — the single-writer test forbids it referencing the store), in
 *        which case `since` falls back to this verdict's measured_at.
 * @returns {ReadonlyArray<{axis, act, since, runs, truncated, run_id, citation}>}
 */
function deriveOwedActions({ verdict, spans = null } = {}) {
  if (!verdict || !Array.isArray(verdict.axes)) {
    throw new Error('deriveOwedActions(): a verdict with axes[] is required — deriving from anything else would be a second representation of the drive state');
  }
  const spanByAxis = new Map((Array.isArray(spans) ? spans : []).map((s) => [s.axis, s]));
  const out = [];
  for (const e of verdict.axes) {
    if (e.state !== STATE.STALLED) continue;
    const act = OWED_ACTS[e.axis];
    if (!act) throw new Error(`deriveOwedActions(): no owed act registered for axis '${e.axis}' — the act set is closed and must cover every axis that can stall`);
    const span = spanByAxis.get(e.axis) || null;
    out.push(Object.freeze({
      axis: e.axis,
      act,
      since: span ? span.since : verdict.measured_at,
      runs: span ? span.runs : 1,
      truncated: span ? span.truncated === true : false,
      run_id: verdict.measured_at,
      citation: e.citation,
    }));
  }
  return Object.freeze(out);
}

/**
 * Is the persisted history too old to be a trustworthy basis? `priorNewestRecordedAt` is the
 * newest recorded_at measured BEFORE this tick persists — measured after, the basis is always
 * ~0s old and the guard can never fire (the defect the PLAN TESTING pass caught in the first
 * draft of this FR). null means no prior history exists at all (first-ever run): not stale,
 * there is nothing to be stale about, and the live verdict is this tick's own fresh compute.
 */
function basisStaleness({ priorNewestRecordedAt = null, now, maxAgeMs = BASIS_MAX_AGE_MS } = {}) {
  if (!priorNewestRecordedAt) return Object.freeze({ stale: false, gapMs: null });
  const nowMs = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now();
  const priorMs = Date.parse(priorNewestRecordedAt);
  if (!Number.isFinite(priorMs)) return Object.freeze({ stale: false, gapMs: null });
  const gapMs = nowMs - priorMs;
  return Object.freeze({ stale: gapMs > maxAgeMs, gapMs });
}

/**
 * Compose the drive-state section: the existing render, plus owed-action hard lines, with the
 * summary tail WITHHELD whenever anything is owed or the basis is stale. When nothing is owed and
 * the basis is fresh the output is BYTE-IDENTICAL to renderDriveState — the render is unchanged
 * when there is nothing to force.
 *
 * renderDriveState still THROWS on an incomplete verdict; that refusal channel is untouched.
 */
function composeDriveStateReport({ verdict, spans = null, priorNewestRecordedAt = null, now } = {}) {
  const rendered = renderDriveState(verdict);
  const owedActions = deriveOwedActions({ verdict, spans });
  const basis = basisStaleness({ priorNewestRecordedAt, now });

  if (owedActions.length === 0 && !basis.stale) {
    return { lines: rendered, owedActions, staleBasis: false };
  }

  const tailIdx = rendered.findIndex((l) => typeof l === 'string' && l.startsWith(TAIL_PREFIX));
  if (tailIdx === -1) {
    throw new Error("composeDriveStateReport(): could not locate the summary tail line ('  axes=') to withhold — renderDriveState changed shape and the forcing-function would silently stop blocking");
  }
  const lines = rendered.slice(0, tailIdx).concat(rendered.slice(tailIdx + 1));

  lines.push('  ── FORCING-FUNCTION: SUMMARY WITHHELD — a stalled axis owes an action ──');
  for (const oa of owedActions) {
    lines.push(
      '  !! OWED-ACTION ' + oa.axis.padEnd(24) + oa.act.padEnd(30) +
      'since ' + oa.since + '  runs' + (oa.truncated ? '>=' : '=') + oa.runs
    );
  }
  if (basis.stale) {
    lines.push(
      '  !! STALE-BASIS — newest persisted drive-state run is ' + (basis.gapMs / 3600000).toFixed(1) +
      'h old (cadence 1h). The history basis is unverifiable over that gap. NOT an all-clear.'
    );
  }
  return { lines, owedActions, staleBasis: basis.stale };
}

/**
 * META-CONTROL — the forcing-function observes itself. RE-DERIVES from the verdict, deliberately
 * refusing to accept a precomputed owed list for the decision: a cached list computed from an
 * older verdict silently agrees with whatever emission happened, which is exactly the blind
 * self-check this clause exists to prevent (recheck = rerun). The emission evidence is the
 * POST-INSERT READBACK, never the insert's return value — success-return is not persistence.
 *
 * Scope claimed honestly: THIS tick, the axes this verdict says are stalled. A tick that never
 * ran cannot be caught here — cadence liveness is the separate reevaluation-cadence control.
 *
 * @throws {Error} code DRIVE_STATE_FORCING_MISS, axes named IN THE MESSAGE (catches stringify).
 */
function assertForcingRan({ verdict, emittedReadback } = {}) {
  const owed = deriveOwedActions({ verdict });
  const seen = new Set(
    (Array.isArray(emittedReadback) ? emittedReadback : [])
      .map((r) => (r && r.payload ? r.payload.owed_axis : null))
      .filter(Boolean)
  );
  const missed = owed.filter((oa) => !seen.has(oa.axis));
  if (missed.length) {
    const err = new Error(
      'DRIVE_STATE_FORCING_MISS: verdict computed with stalled axes but NO owed-action emission was read back for: ' +
      missed.map((m) => m.axis).join(', ') +
      ' — the forcing-function missed its own firing. This tick is NOT all-green.'
    );
    err.code = 'DRIVE_STATE_FORCING_MISS';
    throw err;
  }
  return Object.freeze({ checked: owed.length });
}

module.exports = {
  OWED_ACTS,
  BASIS_MAX_AGE_MS,
  deriveOwedActions,
  basisStaleness,
  composeDriveStateReport,
  assertForcingRan,
};
