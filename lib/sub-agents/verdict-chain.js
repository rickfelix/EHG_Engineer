/**
 * VERDICT CHAIN — the declared mutation seam for the sub-agent evidence path.
 * SD-LEO-INFRA-WRITER-SUB-AGENT-001, FR-3.
 *
 * WHY THIS FILE EXISTS. A completed CRITICAL SD
 * (SD-LEO-INFRA-SUBAGENT-VERDICT-LAUNDERED-001) fixed ONE verdict-mutating writer, and the class
 * survived its own fix. Its scope field says so outright — "SCOPE IS ROWS FROM THIS WRITER, NOT THE
 * WHOLE TABLE" — so a second mutator passes every criterion it shipped, untouched. The FR-1
 * enumeration then found 14 in-process mutators, including the predecessor's LITERAL defect
 * (`verdict: result.verdict || 'WARNING'`) alive and unfixed in two more files.
 *
 * THE STRUCTURAL PROBLEM, which is not "N bad defaults": `verdict` is a plain property that any
 * function holding the results object may overwrite, and the audit snapshot was taken at STORAGE
 * time — i.e. DOWNSTREAM of mutation. So `metadata.original_verdict` recorded the last mutator's
 * output rather than the caller's input. Measured: 91 live rows carry verdict='CONDITIONAL_PASS'
 * AND original_verdict='CONDITIONAL_PASS' AND (repo_resolved=false OR probe_exists=false) — zero
 * recorded divergence, because the mutation happened before the field that was supposed to witness
 * it. The predecessor's criterion "the original verdict is recorded for EVERY row this writer
 * produces" passes on those rows WHILE RECORDING A FALSEHOOD.
 *
 * WHAT THIS FIXES, AND WHAT IT DELIBERATELY DOES NOT. This module does not stop mutation — several
 * mutators are correct and must stay. lib/sub-agents/resolve-repo.js degrades a PASS to
 * CONDITIONAL_PASS when the repo could not be resolved, because a sub-agent that scanned an empty
 * tree found zero violations and its PASS is VACUOUS. Removing that would not just re-open a
 * reporting hole: a DB trigger completes deliverables only on verdict='PASS', so it would start
 * auto-completing deliverables off checks that never executed. What this module does is make every
 * such mutation DECLARED, ATTRIBUTED and ORDERED, so the caller's verdict survives and the audit
 * field stops lying.
 *
 * DIRECTION IS THE DISCRIMINATOR THE ORIGINAL FRAMING MISSED. The predecessor's defect was
 * UPGRADE-direction (rejections rewritten toward acceptance, defeating a gate). resolve-repo's is
 * DEGRADE-direction and fail-closed. Same class structurally, opposite hazard semantically — which
 * is exactly why fixing one by name could never have caught the other, and why a
 * legitimate-vs-illegitimate binary mis-sorts them. Upgrade-direction mutators are removed;
 * degrade-direction ones come through here.
 */

/** The 8 values sub_agent_execution_results.verdict accepts (CHECK valid_verdict). */
export const VERDICT_VALUES = Object.freeze([
  'PASS', 'FAIL', 'BLOCKED', 'CONDITIONAL_PASS',
  'WARNING', 'MANUAL_REQUIRED', 'PENDING', 'ERROR'
]);

/** Sentinel mirroring results-storage.js — "the agent returned nothing" as a queryable fact. */
export const ABSENT_VERDICT = '(absent)';

/**
 * Record a verdict mutation and apply it.
 *
 * APPEND-ONLY AND ORDERED: entry [0] is the verdict as it ENTERED the evidence path. That ordering
 * is the whole contract — it is what lets `original_verdict` be derived from something captured
 * upstream of every mutator rather than downstream of all of them.
 *
 * @param {object} results - the sub-agent results object (mutated in place, as callers expect)
 * @param {string} newVerdict - the verdict to apply
 * @param {object} opts
 * @param {string} opts.mutator - REQUIRED. Module path + symbol, e.g.
 *   'lib/sub-agents/resolve-repo.js:applySubAgentRepoVerdict'. Required and unvalidated-against-a-list
 *   deliberately: an anonymous mutation is the thing this SD exists to abolish, but hard-coding the
 *   permitted set here would rebuild the receipt-for-a-list defect one layer down.
 * @param {string} opts.reason - REQUIRED. Why, in terms a gate reader can act on.
 * @returns {object} the same results object
 */
export function recordVerdictMutation(results, newVerdict, opts = {}) {
  if (!results || typeof results !== 'object') {
    throw new TypeError('recordVerdictMutation: results must be an object');
  }
  const mutator = typeof opts.mutator === 'string' ? opts.mutator.trim() : '';
  const reason = typeof opts.reason === 'string' ? opts.reason.trim() : '';
  if (!mutator) throw new TypeError('recordVerdictMutation: opts.mutator is REQUIRED — an anonymous mutation is the defect');
  if (!reason) throw new TypeError('recordVerdictMutation: opts.reason is REQUIRED — a mutation nobody can explain is not explicit');
  if (!VERDICT_VALUES.includes(newVerdict)) {
    throw new TypeError(
      `recordVerdictMutation: '${newVerdict}' is not one of ${VERDICT_VALUES.join(', ')}. ` +
      'An out-of-enum verdict is rejected by the CHECK constraint and the row never lands — ' +
      'which the evidence gate reads as ABSENT evidence, i.e. acceptance. Fail here, loudly, instead.'
    );
  }

  if (!results.metadata || typeof results.metadata !== 'object') results.metadata = {};
  if (!Array.isArray(results.metadata.verdict_chain)) results.metadata.verdict_chain = [];

  const from = (results.verdict === undefined || results.verdict === null)
    ? ABSENT_VERDICT
    : String(results.verdict);

  results.metadata.verdict_chain.push({ from, to: newVerdict, mutator, reason });
  results.verdict = newVerdict;
  return results;
}

/**
 * The verdict as it ENTERED the path — what `original_verdict` is supposed to mean.
 *
 * Falls back to the current verdict when no chain exists, so rows produced with no mutation are
 * byte-identical to today's. That fallback is also why this is safe to land before every mutator is
 * converted: an unconverted mutator simply reproduces the OLD (wrong) value rather than throwing,
 * and the fence in FR-4 is what stops new ones from being added unconverted.
 *
 * @param {object} results
 * @returns {string}
 */
export function originalVerdictFor(results) {
  const chain = results?.metadata?.verdict_chain;
  if (Array.isArray(chain) && chain.length > 0 && typeof chain[0]?.from === 'string') {
    return chain[0].from;
  }
  return (results?.verdict === undefined || results?.verdict === null)
    ? ABSENT_VERDICT
    : String(results.verdict);
}
