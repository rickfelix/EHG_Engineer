/**
 * A CHECK THAT HAS NEVER BEEN SHOWN TO FAIL CANNOT BE CITED.
 * SD-LEO-INFRA-PURE-GUARD-UNWIRED-001 FR-3.
 *
 * WHERE THIS COMES FROM. A predicate was wired, was fed real data, and reported 0/3 for 27
 * consecutive passes across a window in which the underlying state demonstrably changed. Nothing
 * was missing. The predicate itself was inert: a shell-mangled regex that had compiled to a
 * BACKSPACE CHARACTER and could never match anything. Every pass was honest and every pass was
 * meaningless, and because "no matches" is the permissive answer, it read as health for 27 passes.
 *
 * ONE TEST WOULD HAVE CAUGHT IT: run the predicate against a string KNOWN to match. That is all
 * this module is. It generalises the codebase's own repeated lesson — "a check that compares a
 * value to itself cannot fail" — one step outward: a check that has never been DEMONSTRATED to
 * return its blocking verdict has not been shown to be a check at all.
 *
 * DELIBERATELY SCOPED to predicates feeding gates, alarms and handoff evidence. Applying it to
 * every boolean in the tree would be noise, and noise is what gets a signal muted.
 *
 * Pure and total: it never throws. A predicate that throws on a known input is itself a finding,
 * and swallowing that into a pass would be the exact defect this module exists to remove.
 */
'use strict';

export const VERDICT_KIND = Object.freeze({ BLOCKING: 'blocking', PASSING: 'passing' });

/** Default reading of "this result is the blocking verdict". */
function defaultIsBlocking(result) {
  if (result === true) return true;
  if (result && typeof result === 'object') {
    if (result.blocked === true) return true;
    if (result.ok === false) return true;
    if (result.verdict === 'fail' || result.verdict === 'block') return true;
  }
  return false;
}

/**
 * Demonstrate that a predicate can produce BOTH of its verdicts against known inputs.
 *
 * @param {object} spec
 * @param {string} spec.name
 * @param {Function} spec.predicate          the predicate under test
 * @param {*} spec.blockingInput             an input that MUST produce the blocking verdict
 * @param {*} spec.passingInput              an input that MUST produce the passing verdict
 * @param {(r:*)=>boolean} [spec.isBlocking] how to read the result
 * @returns {{name, capable, produced, missingVerdict, threw, detail}} never throws
 */
export function selfTestPredicate(specArg = {}) {
  // `= {}` only defaults on undefined, so an explicit null still reaches the body and throws on
  // property access. Caught by the never-throws test, which is exactly what it is there for.
  const spec = specArg && typeof specArg === 'object' ? specArg : {};
  const name = spec.name || '(unnamed predicate)';
  const isBlocking = typeof spec.isBlocking === 'function' ? spec.isBlocking : defaultIsBlocking;
  const out = { name, capable: false, produced: { blocking: false, passing: false }, missingVerdict: null, threw: null, detail: '' };

  if (typeof spec.predicate !== 'function') {
    out.missingVerdict = 'both';
    out.detail = `${name}: no predicate supplied — nothing was demonstrated, which is NOT the same as passing`;
    return out;
  }

  const run = (input, label) => {
    try {
      return { ok: true, blocking: isBlocking(spec.predicate(input)) };
    } catch (err) {
      // A throw is a finding, not a pass. Recorded and surfaced rather than absorbed.
      out.threw = `${label}: ${err?.message || String(err)}`;
      return { ok: false, blocking: false };
    }
  };

  const b = run(spec.blockingInput, 'blockingInput');
  const p = run(spec.passingInput, 'passingInput');
  out.produced.blocking = b.ok && b.blocking === true;
  out.produced.passing = p.ok && p.blocking === false;

  if (out.threw) {
    out.detail = `${name}: THREW during the self-test (${out.threw}) — a predicate that cannot run cannot be cited`;
    return out;
  }
  if (!out.produced.blocking && !out.produced.passing) {
    out.missingVerdict = 'both';
    out.detail = `${name}: produced NEITHER verdict against known inputs — it is not discriminating at all`;
    return out;
  }
  if (!out.produced.blocking) {
    // The instance-5 shape: it can say "fine" and has never been shown able to say anything else.
    out.missingVerdict = VERDICT_KIND.BLOCKING;
    out.detail = `${name}: could NOT produce its BLOCKING verdict against an input known to trigger it — `
      + 'it can only ever return the permissive answer, so its zeros mean nothing';
    return out;
  }
  if (!out.produced.passing) {
    out.missingVerdict = VERDICT_KIND.PASSING;
    out.detail = `${name}: could NOT produce its PASSING verdict against an input known to be clean — `
      + 'it blocks unconditionally, so its blocks mean nothing';
    return out;
  }

  out.capable = true;
  out.detail = `${name}: demonstrated BOTH verdicts against known inputs`;
  return out;
}

/** Run a suite of predicate self-tests; returns the incapable ones first — they are the finding. */
export function selfTestAll(specs = []) {
  const results = (Array.isArray(specs) ? specs : []).map((s) => selfTestPredicate(s));
  const incapable = results.filter((r) => !r.capable);
  return {
    results,
    incapable,
    // Unconditional counts, zeros included — same reasoning as the sustained-zero report.
    summary: `PREDICATE SELF-TEST: capable=${results.length - incapable.length} incapable=${incapable.length}`,
  };
}
