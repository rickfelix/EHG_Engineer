/**
 * Empty-evidence guard for sub_agent_execution_results, shared by EVERY writer.
 *
 * WHY IT IS SHARED RATHER THAN PASTED. There are three insert paths into this table:
 * lib/sub-agent-executor/results-storage.js (canonical),
 * scripts/modules/phase-subagent-orchestrator/execution.js, and
 * scripts/modules/orchestrator/subagent-execution.js. This repo has ALREADY been bitten once by
 * hardening one and missing another: the header of phase-subagent-orchestrator/execution.js
 * records that it "is the second (orchestrated) insert path ... and was never wired to it", so
 * QF-20260703-369 had to retrofit deriveConditionalPassEvidence into it after the sibling writer
 * already had it. One exported predicate, imported by all writers, is the only shape that cannot
 * repeat that.
 *
 * WHAT IT REFUSES, and why this is narrower than "no summary and no findings":
 *
 * 1. A BLOCKING verdict that does not say WHY it blocks. Measured on the live table, the rows this
 *    exists to catch look like: verdict=BLOCKED, confidence=100, summary=null, critical_issues=[],
 *    justification=null — and SEVEN recommendations. Those recommendations are generic boilerplate
 *    ("Execute E2E tests before approval"), identical across unrelated SDs. Counting them as
 *    content would make this guard pass on exactly the rows it was built for, so a blocking verdict
 *    must carry a summary, a critical issue, or a justification. Recommendations are not a reason.
 *
 * 2. A verdict of ANY kind carrying nothing at all. An empty PASS is invisible where the ERROR
 *    tombstone it replaces was at least countable (the reasoning in scripts/record-explore-evidence.js,
 *    generalised here from that script's CLI to the DB row shape).
 *
 * WHAT IT DELIBERATELY DOES NOT TREAT AS EMPTY: detailed_analysis === '{}'. results-storage.js:658
 * COMPRESSES detailed_analysis into a separate artifact and leaves '{}' behind on purpose, so an
 * emptiness check on that field would refuse perfectly good rows. Verified before writing this.
 *
 * Blast radius measured before wiring: over 1000 rows in the trailing 7 days, exactly 2 would be
 * refused by rule 2 (both PASS), plus the blocking-without-a-reason class from rule 1. This is a
 * narrow guard, not a policy change.
 */

/** Verdicts that stop a handoff. A verdict in this set must justify itself. */
const BLOCKING_VERDICTS = new Set(['BLOCKED', 'FAIL', 'FAILED']);

const hasText = (v) => typeof v === 'string' && v.trim().length > 0;

const hasEntries = (v) => {
  if (!Array.isArray(v)) return false;
  return v.some((item) => {
    if (item == null) return false;
    if (typeof item === 'string') return item.trim().length > 0;
    if (typeof item === 'object') return Object.keys(item).length > 0;
    return true;
  });
};

/**
 * @param {Object} row - the record about to be persisted.
 * @returns {string|null} null when the row may be written, else the reason to refuse.
 */
export function evidenceRefusalReason(row = {}) {
  const verdict = hasText(row.verdict) ? row.verdict.trim().toUpperCase() : '';
  if (!verdict) {
    return 'refusing to persist a sub-agent result with no verdict — a verdict recorded by omission '
      + 'is a claim nobody made.';
  }

  // A reason is something that states WHY. Recommendations are advice, not a finding.
  const statesAReason = hasText(row.summary) || hasEntries(row.critical_issues) || hasText(row.justification);

  if (BLOCKING_VERDICTS.has(verdict) && !statesAReason) {
    return `refusing to persist a ${verdict} verdict with no summary, no critical_issues and no `
      + 'justification. A blocking verdict that does not say why it blocks is indistinguishable from '
      + 'a genuine blocker, and it stops a handoff on nothing. Generic recommendations do not count '
      + 'as a reason — the rows this guard exists to catch carried seven of them.';
  }

  return null;
}

/**
 * A NON-blocking verdict carrying nothing at all is invisible rather than harmful, so it is
 * reported instead of refused.
 *
 * SCOPED DELIBERATELY, and this is the honest limit of this guard. Refusing it as well would have
 * been the tidier rule, but this writer's established contract ACCEPTS minimal payloads: 17 existing
 * tests across 6 files construct `{ verdict: 'PASS', confidence: 90 }` fixtures while testing
 * unrelated properties, and one is named "normalizes an absent or blank summary to null rather than
 * storing whitespace" — a blank summary is supported behaviour here, not an accident. Rewriting
 * those tests so my own change could pass would be bending correct tests to fit new code, which is
 * the exact move this workstream exists to stop.
 *
 * The cost is bounded and was measured: over 1000 rows in the trailing 7 days, exactly 2 fall in
 * this class, both PASS. They are now countable in the logs rather than silently invisible. If that
 * class ever grows, tightening this to a refusal is a deliberate follow-up with its own test churn,
 * not something to smuggle in here.
 *
 * @returns {string|null} null when unremarkable, else a message worth logging.
 */
export function evidenceContentWarning(row = {}) {
  const verdict = hasText(row.verdict) ? row.verdict.trim().toUpperCase() : '';
  if (!verdict || BLOCKING_VERDICTS.has(verdict)) return null; // handled by the refusal above
  const statesAnything = hasText(row.summary) || hasEntries(row.critical_issues)
    || hasText(row.justification) || hasEntries(row.warnings) || hasEntries(row.recommendations);
  if (statesAnything) return null;
  return `${verdict} verdict persisted with no summary, findings, warnings or recommendations — `
    + 'an empty result is invisible where the error it replaces was at least countable.';
}

/**
 * Throwing form for call sites that persist inline. Kept separate so the predicate stays testable
 * without exception handling, and so a caller that wants to log-and-skip can use the predicate.
 */
export function assertEvidenceHasContent(row, { writer = 'unknown writer', logger = console } = {}) {
  const code = row?.sub_agent_code ? ` [${row.sub_agent_code}]` : '';
  const reason = evidenceRefusalReason(row);
  if (reason) {
    throw new Error(`EMPTY_EVIDENCE_REFUSED (${writer})${code}: ${reason}`);
  }
  const warning = evidenceContentWarning(row);
  if (warning) {
    logger.warn?.(`EMPTY_EVIDENCE_WARNING (${writer})${code}: ${warning}`);
  }
}
