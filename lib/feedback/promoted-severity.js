/**
 * SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-5) — derive the severity a promoted QF
 * enters the belt with, instead of inheriting the reporter's own urgency wording verbatim.
 *
 * THE MEASURED PROBLEM. Severity was pure inheritance across eight hops with no reassignment point
 * anywhere: the self-declared `--severity` flag on scripts/worker-signal.cjs flows into the signal
 * payload, into the feedback row via signal-router, into group.max_severity, into the promoter's
 * --severity argument, and into the QF. feedback.severity equalled quick_fixes.severity for 61/61
 * rows of the cohort. The result: 49 of 53 promoted rows are severity=critical. critical-qf-jump
 * exists to pull genuine criticals ahead of ranked SD work on EVERY seat — when nearly everything
 * arrives critical it stops selecting and merely reorders, so the lane loses its meaning.
 *
 * THE POLICY, and why it is drawn here rather than at the promotion decision.
 * A `critical` claim that no second reporter has corroborated is an UNWITNESSED claim. It should
 * still become work immediately — it does — but it should not preempt every seat in the fleet on
 * one author's adjective. So an uncorroborated critical enters at `high`.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *  - It does NOT touch THRESHOLD or the single-critical bypass in lib/shared/content-fingerprint.cjs.
 *    The SD forbids that, and rightly: a lone worker hitting a genuine fault must not have to wait
 *    for two peers before the item exists at all. Promotion timing is unchanged — only the severity
 *    the resulting QF carries is derived.
 *  - It does NOT downgrade anything below critical. A `high`/`medium`/`low` signal is returned
 *    untouched, so no existing non-critical path changes behaviour.
 *  - It does NOT make critical unreachable. Corroboration by a second callsign, or a second
 *    occurrence of the same fingerprint, yields critical — as does any manual escalation
 *    afterwards. "Uncorroborated" is a statement about evidence, not a verdict about the defect.
 *
 * Pure and side-effect free ON PURPOSE: the promoter itself is a top-level-await ESM script, so
 * importing it to test anything executes the whole promoter. That is a large part of why it has
 * never had CI coverage. Keeping the policy in its own module makes it unit-testable under the
 * runner that actually runs (see tests/unit/feedback/promoted-severity.test.js).
 */

/** Severities that a corroborated report may retain. Anything not listed passes through unchanged. */
const CRITICAL = 'critical';
const UNCORROBORATED_CRITICAL_CEILING = 'high';

/**
 * @param {Object} input
 * @param {string} input.declared      - severity as reported (group.max_severity)
 * @param {number} [input.callsigns]   - distinct contributing callsigns (corroborating reporters)
 * @param {number} [input.occurrences] - contributing source rows in the fingerprint group
 * @returns {{severity: string, derived: boolean, reason: string}}
 *   `derived` is true only when the value differs from `declared`, so callers can log the
 *   difference rather than silently substituting — an unexplained severity change is its own
 *   observability problem.
 */
export function derivePromotedSeverity({ declared, callsigns = 0, occurrences = 0 } = {}) {
  const value = String(declared || '').toLowerCase();

  if (value !== CRITICAL) {
    return { severity: declared, derived: false, reason: 'non-critical severity passes through unchanged' };
  }

  const corroborated = Number(callsigns) >= 2 || Number(occurrences) >= 2;
  if (corroborated) {
    return {
      severity: CRITICAL,
      derived: false,
      reason: `critical retained — corroborated by ${callsigns} callsign(s) across ${occurrences} occurrence(s)`,
    };
  }

  return {
    severity: UNCORROBORATED_CRITICAL_CEILING,
    derived: true,
    reason: 'critical claimed by a single reporter with no second occurrence — promoted at high so it becomes work immediately without preempting every seat; corroboration or manual escalation restores critical',
  };
}

export default derivePromotedSeverity;
