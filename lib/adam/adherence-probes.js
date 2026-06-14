/**
 * Adam role-adherence probes — the audit half of the self-improving governance loop.
 * SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 (Adam-autonomy child E), FR-1.
 *
 * Each probe is PURE: it takes already-RESOLVED facts (the review script supplies the resolvers
 * that read the DB) and returns a verdict for ONE governed Adam duty. Keeping probes pure of IO
 * makes them unit-testable without a DB and keeps the data-access seam in one place (the review
 * script, FR-3).
 *
 * FAIL-LOUD contract: a fact that could NOT be resolved (null/undefined — the resolver failed or
 * the data was unavailable) yields verdict='unknown', NEVER a silent 'pass'. Drift must never be
 * masked by a missing measurement.
 *
 * Each probe returns: { probe, duty, verdict: 'pass'|'fail'|'unknown', detail }.
 */
'use strict';

const VERDICT = Object.freeze({ PASS: 'pass', FAIL: 'fail', UNKNOWN: 'unknown' });

/** A resolved fact is "unresolved" when it is null or undefined (resolver failed / no data). */
const unresolved = (v) => v === null || v === undefined;

function bar(probe, duty, verdict, detail) {
  return { probe, duty, verdict, detail };
}

/**
 * P1 — Sourcing cadence. Governed duty (CONST-002): Adam SOURCES gap-closing work for the
 * coordinator (it never builds). Drift = no work sourced within the audit window.
 * @param {{ sourcedInWindow?: number|null, windowDays?: number }} facts
 */
export function probeSourcingCadence(facts = {}) {
  const duty = 'sourcing-cadence: Adam sources gap-closing SDs/flags for the coordinator (CONST-002)';
  const n = facts.sourcedInWindow;
  if (unresolved(n) || !Number.isFinite(Number(n))) {
    return bar('sourcing_cadence', duty, VERDICT.UNKNOWN, 'sourcedInWindow unresolved — cannot confirm sourcing cadence (not a pass)');
  }
  const count = Number(n);
  return count > 0
    ? bar('sourcing_cadence', duty, VERDICT.PASS, `${count} item(s) sourced in the last ${facts.windowDays ?? '?'}d`)
    : bar('sourcing_cadence', duty, VERDICT.FAIL, `0 items sourced in the last ${facts.windowDays ?? '?'}d — sourcing cadence stalled`);
}

/**
 * P2 — Vision monitoring. Governed duty: Adam keeps a live read on the vision build-%/North-Star
 * gauge. Drift = the gauge was not read within the window.
 * @param {{ visionGaugeReadInWindow?: boolean|null }} facts
 */
export function probeVisionMonitoring(facts = {}) {
  const duty = 'vision-monitoring: Adam keeps a live read on the vision build-% / North-Star gauge';
  const read = facts.visionGaugeReadInWindow;
  if (unresolved(read)) {
    return bar('vision_monitoring', duty, VERDICT.UNKNOWN, 'visionGaugeReadInWindow unresolved — cannot confirm monitoring (not a pass)');
  }
  return read === true
    ? bar('vision_monitoring', duty, VERDICT.PASS, 'vision gauge was read within the window')
    : bar('vision_monitoring', duty, VERDICT.FAIL, 'vision gauge NOT read within the window — monitoring lapsed');
}

/**
 * P3 — Friction signaling. Governed duty (D4): Adam signals friction to the coordinator on
 * recurrence. Drift = recurrences happened but no signals were sent.
 * @param {{ recurrencesInWindow?: number|null, signalsInWindow?: number|null }} facts
 */
export function probeFrictionSignaling(facts = {}) {
  const duty = 'friction-signaling: Adam signals friction to the coordinator on recurrence (D4)';
  const recur = facts.recurrencesInWindow;
  const signals = facts.signalsInWindow;
  if (unresolved(recur) || unresolved(signals)) {
    return bar('friction_signaling', duty, VERDICT.UNKNOWN, 'recurrences/signals unresolved — cannot confirm signaling (not a pass)');
  }
  if (Number(recur) === 0) {
    return bar('friction_signaling', duty, VERDICT.PASS, 'no recurrences in the window — nothing to signal');
  }
  return Number(signals) > 0
    ? bar('friction_signaling', duty, VERDICT.PASS, `${recur} recurrence(s) and ${signals} signal(s) — signaling kept up`)
    : bar('friction_signaling', duty, VERDICT.FAIL, `${recur} recurrence(s) but 0 signals — friction went unsignalled`);
}

/**
 * P4 — Propose-only / never-build (CONST-002). Governed duty: Adam NEVER authors/builds; it only
 * sources. Drift = any Adam-authored build/PR exists in the window. This is the cardinal Adam
 * constraint — a single authored build is a fail.
 * @param {{ adamAuthoredBuildsInWindow?: number|null }} facts
 */
export function probeProposeOnly(facts = {}) {
  const duty = 'propose-only: Adam never builds/authors a fix — it only sources (CONST-002)';
  const builds = facts.adamAuthoredBuildsInWindow;
  if (unresolved(builds) || !Number.isFinite(Number(builds))) {
    return bar('propose_only', duty, VERDICT.UNKNOWN, 'adamAuthoredBuildsInWindow unresolved — cannot confirm propose-only (not a pass)');
  }
  return Number(builds) === 0
    ? bar('propose_only', duty, VERDICT.PASS, 'no Adam-authored builds in the window — propose-only upheld')
    : bar('propose_only', duty, VERDICT.FAIL, `${builds} Adam-authored build(s) detected — CONST-002 propose-only violated`);
}

/** The canonical probe set (each defined once). The review script (FR-3) resolves facts + runs these. */
export const ADHERENCE_PROBES = Object.freeze([
  probeSourcingCadence,
  probeVisionMonitoring,
  probeFrictionSignaling,
  probeProposeOnly,
]);

/**
 * Run all probes over a resolved-facts object. PURE. Returns one bar per probe; never throws — a
 * probe that errors degrades to 'unknown' (fail-loud, never silent-pass).
 * @param {Object} facts - resolved facts keyed for each probe
 * @returns {Array<{probe,duty,verdict,detail}>}
 */
export function runAdherenceProbes(facts = {}) {
  return ADHERENCE_PROBES.map((p) => {
    try {
      return p(facts);
    } catch (e) {
      return bar(p.name || 'unknown_probe', 'unknown', VERDICT.UNKNOWN, `probe errored (fail-open to unknown): ${e?.message ?? e}`);
    }
  });
}

/** True when any probe verdict is 'fail' (drift detected → the review sources a propose-only remediation). */
export function hasDrift(bars = []) {
  return bars.some((b) => b?.verdict === VERDICT.FAIL);
}

export { VERDICT };
