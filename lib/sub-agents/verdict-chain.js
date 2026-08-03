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

  const from = (results.verdict === undefined || results.verdict === null)
    ? ABSENT_VERDICT
    : String(results.verdict);

  // CONTINUITY IS WHAT MAKES THE CHAIN EVIDENCE RATHER THAN A CLAIM.
  //
  // The first version simply appended to whatever `verdict_chain` was already on results.metadata —
  // and that metadata comes from the CALLER. Two independent reviewers drove the real storage path
  // and defeated it the same way: pre-seed `[{from:'CONDITIONAL_PASS'}]`, let a genuine mutation
  // append at index 1, and `chain[0].from` reports the forged head forever. A caller returning PASS
  // could make the stored row read CONDITIONAL_PASS/CONDITIONAL_PASS — byte-identical to the 91-row
  // population this SD exists to eliminate. The audit anchor had MOVED, not hardened, and this
  // module's own docblock convicted it.
  //
  // A genuine chain LINKS: each entry's `to` is the next entry's `from`, and the last `to` is the
  // verdict currently on the object. A pre-seeded head cannot satisfy that without already knowing
  // the run's real verdict — and if it does know it, it is not lying about it. So a chain that fails
  // to link is not this run's chain, and is DISCARDED rather than extended. That preserves the real
  // caller verdict (the discarded head is replaced by a fresh entry whose `from` is the live value)
  // instead of merely refusing to record.
  const existing = results.metadata.verdict_chain;
  results.metadata.verdict_chain = chainLinksTo(existing, from) ? existing : [];

  results.metadata.verdict_chain.push({ from, to: newVerdict, mutator, reason });
  results.verdict = newVerdict;
  return results;
}

/**
 * Is `chain` a well-formed, continuous chain terminating at `currentVerdict`?
 *
 * An empty/absent chain is NOT continuous — there is nothing to extend, so a caller gets a fresh
 * one. Anything else must be an array of {from,to} entries where each `to` equals the next `from`,
 * and the final `to` equals the verdict on the object right now.
 */
function chainLinksTo(chain, currentVerdict) {
  if (!Array.isArray(chain) || chain.length === 0) return false;
  for (let i = 0; i < chain.length; i++) {
    const e = chain[i];
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') return false;
    const nextFrom = i + 1 < chain.length ? chain[i + 1]?.from : currentVerdict;
    if (e.to !== nextFrom) return false;
  }
  return true;
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
  const current = (results?.verdict === undefined || results?.verdict === null)
    ? ABSENT_VERDICT
    : String(results.verdict);

  // TRUST THE CHAIN ONLY IF IT LINKS ALL THE WAY TO THE VERDICT ON THE OBJECT. A chain that does not
  // terminate at `current` was not produced by this run's mutations — it is stale, hand-assembled, or
  // forged — and reading `chain[0].from` off it is exactly how the pre-seeding attack reported a
  // verdict the caller never returned. Falling back to `current` is the SAFE direction: it reports
  // the verdict actually being stored rather than an unverifiable claim about an earlier one.
  const chain = results?.metadata?.verdict_chain;
  if (chainLinksTo(chain, current)) return chain[0].from;
  return current;
}
