/**
 * The sustained-zero alarm: A GATE THAT HAS NEVER BLOCKED ANYTHING IS NOT A PASSING GATE,
 * IT IS AN UNPLUGGED ONE.
 * SD-LEO-INFRA-PURE-GUARD-UNWIRED-001 FR-2 — the load-bearing deliverable.
 *
 * WHY FR-1 IS NOT ENOUGH. The wiring test answers "does a caller supply the input". Two live
 * instances slip straight past it because they are wired AND supplied AND still inert:
 *   - a predicate that was wired, was fed data, and was ITSELF broken — a shell-mangled regex that
 *     compiled to a backspace character. It reported 0/3 for 27 consecutive passes across a window
 *     in which the underlying state demonstrably changed. Nothing was missing; the answer was.
 *   - waveAlignmentTerm, wired and supplied, but 0 of 261 roadmap_wave_items carry the linkage it
 *     reads, so it silently fails CLOSED.
 * Neither is visible to a static check. Only the RECORD OF WHAT THE GUARD ACTUALLY DID over time
 * separates "evaluated and passed, repeatedly" from "never evaluated anything".
 *
 * THREE STATES, NOT TWO — and this is the design constraint the FR itself names as its known
 * failure mode. A sustained-zero alarm that cannot SEE the blocking events reports diligence as
 * neglect: a guard nobody observed and a guard that observed nothing both present as zero, and
 * flagging both manufactures false alarms that get muted, which recreates the silence it exists to
 * break. So:
 *   HEALTHY   — blocked at least once in the window. It demonstrably can.
 *   SUSPECT   — OBSERVED, and blocked zero times. This is the alarm.
 *   UNKNOWN   — no observations at all. NOT an alarm and NOT health: we cannot tell.
 *
 * The count is emitted UNCONDITIONALLY, including zero — reusing the shape of
 * lib/coordinator/worker-signal-starvation.cjs, whose docblock records why: a counter that appears
 * only when non-zero renders measured-and-empty identically to not-measured, which is the same
 * family of defect one level up.
 *
 * Pure: no DB, no clock, no fs. Observations are injected so the judgment is testable without a
 * live corpus — and so a caller cannot accidentally make it score an empty read as health.
 */
'use strict';

export const GUARD_HEALTH = Object.freeze({
  HEALTHY: 'healthy',
  SUSPECT: 'suspect',
  UNKNOWN: 'unknown',
  // FR-3 pairing (AC-4): a sustained zero from a predicate PROVEN unable to produce its blocking
  // verdict is not the same finding as a sustained zero from one that simply had nothing to block.
  // The first is broken; the second may be a quiet week. Reporting both as SUSPECT would send an
  // operator hunting for a cause in the wrong half of the cases, which is how an alarm loses trust.
  INERT: 'inert',
});

/**
 * Classify one guard from its observation record over a window.
 *
 * @param {object} record
 * @param {string} record.guard                 guard name
 * @param {number|null} record.observations     times the guard RAN in the window (null = unmeasured)
 * @param {number|null} record.blocked          times it took its BLOCKING branch (null = unmeasured)
 * @param {number} [record.permissiveNoData]    times it took the no-data permissive branch
 * @param {string|null} [record.missingInput]   which input was absent on that branch (AC-4)
 * @param {string} windowLabel                  human-readable window, e.g. '7d'
 */
export function classifyGuard(record = {}, windowLabel = 'window') {
  const guard = record.guard || '(unnamed)';
  const observations = numOrNull(record.observations);
  const blocked = numOrNull(record.blocked);

  // UNKNOWN FIRST. Deciding health before establishing that anything was observed is precisely how
  // a gauge reports diligence as neglect — or worse, reports an unobserved guard as healthy.
  if (observations === null || blocked === null || observations === 0) {
    return {
      guard,
      state: GUARD_HEALTH.UNKNOWN,
      observations: observations ?? 0,
      blocked: blocked ?? 0,
      window: windowLabel,
      missingInput: record.missingInput ?? null,
      detail: observations === 0
        ? `${guard}: OBSERVED 0 times in ${windowLabel} — the guard did not run, so nothing can be concluded about it (this is NOT health)`
        : `${guard}: NOT MEASURED in ${windowLabel} — no observation record exists (this is NOT health)`,
    };
  }

  if (blocked > 0) {
    return {
      guard,
      state: GUARD_HEALTH.HEALTHY,
      observations,
      blocked,
      window: windowLabel,
      missingInput: record.missingInput ?? null,
      detail: `${guard}: blocked ${blocked}/${observations} in ${windowLabel} — demonstrably able to block`,
    };
  }

  // Observed, ran, never blocked. The alarm — but WHICH alarm depends on FR-3.
  const missing = record.missingInput ? ` Missing input on the permissive branch: '${record.missingInput}'.` : '';
  const noData = Number.isFinite(record.permissiveNoData) ? ` no-data branch taken ${record.permissiveNoData}x.` : '';

  // AC-4: if a self-test has PROVEN the predicate cannot produce its blocking verdict, the zero is
  // explained — the guard is inert, not quiet. Saying so turns "go investigate why this never
  // fired" into "this cannot fire; fix the predicate", which is a different and much shorter job.
  if (record.selfTest && record.selfTest.capable === false) {
    return {
      guard,
      state: GUARD_HEALTH.INERT,
      observations,
      blocked: 0,
      window: windowLabel,
      missingInput: record.missingInput ?? null,
      detail: `${guard}: INERT — ran ${observations}x in ${windowLabel}, blocked 0 times, AND its self-test `
        + `shows it cannot produce its blocking verdict (${record.selfTest.missingVerdict ?? 'unknown'}). `
        + `The zero is explained: this guard could not have blocked.${noData}${missing}`,
    };
  }

  return {
    guard,
    state: GUARD_HEALTH.SUSPECT,
    observations,
    blocked: 0,
    window: windowLabel,
    missingInput: record.missingInput ?? null,
    detail: `${guard}: SUSPECT — ran ${observations}x in ${windowLabel} and blocked 0 times. `
      + `A gate that has never blocked anything is not a passing gate, it is an unplugged one.${noData}${missing}`,
  };
}

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Classify a whole population and render a report line per guard.
 * Every guard appears in the output — including the zero ones. Omitting a zero is how the count
 * that "appears only when non-zero" reproduces the ambiguity this module exists to remove.
 */
export function assessGuards(records = [], windowLabel = 'window') {
  const results = (Array.isArray(records) ? records : []).map((r) => classifyGuard(r, windowLabel));
  const by = (s) => results.filter((r) => r.state === s);
  return {
    window: windowLabel,
    results,
    suspect: by(GUARD_HEALTH.SUSPECT),
    unknown: by(GUARD_HEALTH.UNKNOWN),
    healthy: by(GUARD_HEALTH.HEALTHY),
    inert: by(GUARD_HEALTH.INERT),
    // Unconditional counts, zeros included — see the module docblock.
    summary: `GUARD SUSTAINED-ZERO (${windowLabel}): healthy=${by(GUARD_HEALTH.HEALTHY).length} `
      + `suspect=${by(GUARD_HEALTH.SUSPECT).length} inert=${by(GUARD_HEALTH.INERT).length} `
      + `unknown=${by(GUARD_HEALTH.UNKNOWN).length}`,
  };
}
