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

/**
 * Own-property read — an inherited property is indistinguishable from a supplied one, and
 * `Object.prototype.predicate = () => …` would let selfTestPredicate({name:'missing'}) report
 * capable:true, i.e. manufacture the citation this module exists to withhold.
 */
const own = (o, k) => {
  // The READ itself is wrapped: `{ get name() { throw … } }` throws at property access, and these
  // accesses happen BEFORE the try/catch around the predicate run — so a hostile spec escaped a
  // function whose docblock promises it never throws. A field that cannot be read is a field that
  // was not supplied.
  try {
    return o != null && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
};

/** Describe a thrown value without ever throwing again — `String(Object.create(null))` throws. */
function describeThrown(err) {
  try {
    if (err instanceof Error && typeof err.message === 'string') return err.message;
    if (typeof err === 'string') return err;
    const m = own(err, 'message');
    if (typeof m === 'string') return m;
    return Object.prototype.toString.call(err);
  } catch {
    return '(unrepresentable thrown value)';
  }
}

/**
 * Default reading of "this result is the blocking verdict".
 *
 * THE OBJECT ARM IS THE LIVE ONE. This module is scoped to predicates feeding gates, alarms and
 * handoff evidence, and in this codebase those return VERDICT OBJECTS, not bare booleans. If the
 * object shapes were dropped, a real gate predicate returning `{blocked:true}` would read as
 * PASSING, and the self-test would declare a working guard incapable of blocking — a false alarm,
 * which FR-2's own docblock identifies as the failure that gets an alarm muted.
 */
function defaultIsBlocking(result) {
  if (result === true) return true;
  if (result && typeof result === 'object') {
    if (own(result, 'blocked') === true) return true;
    if (own(result, 'ok') === false) return true;
    const verdict = own(result, 'verdict');
    if (verdict === 'fail' || verdict === 'block') return true;
  }
  return false;
}

/** A thenable result cannot be judged synchronously — see the run() comment below. */
function isThenable(v) {
  if (v == null || (typeof v !== 'object' && typeof v !== 'function')) return false;
  try { return typeof v.then === 'function'; } catch { return false; }
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
  // EVERY field is read EXACTLY ONCE, up front. `spec.predicate` was previously read three times
  // (once to type-check, once per run), so a getter could return a blocking-only predicate and then
  // a passing-only one and the pair would be certified as having "demonstrated BOTH verdicts" —
  // a citation assembled from two different functions, neither of which can discriminate. Reading
  // once turns a time-of-check/time-of-use gap into no gap.
  const nameRaw = own(spec, 'name');
  const name = (typeof nameRaw === 'string' && nameRaw) || '(unnamed predicate)';
  const isBlockingRaw = own(spec, 'isBlocking');
  const isBlocking = typeof isBlockingRaw === 'function' ? isBlockingRaw : defaultIsBlocking;
  const predicate = own(spec, 'predicate');
  const blockingInput = own(spec, 'blockingInput');
  const passingInput = own(spec, 'passingInput');
  const out = { name, capable: false, produced: { blocking: false, passing: false }, missingVerdict: null, threw: null, asyncResult: false, detail: '' };

  if (typeof predicate !== 'function') {
    out.missingVerdict = 'both';
    out.detail = `${name}: no predicate supplied — nothing was demonstrated, which is NOT the same as passing`;
    return out;
  }

  const run = (input, label) => {
    try {
      const result = predicate(input);
      // AN ASYNC PREDICATE CANNOT BE SELF-TESTED HERE, and silently trying was the worse of the two
      // failures available. A returned Promise is an object without `.blocked`, so it read as the
      // PASSING verdict; and when it later rejected, nothing was attached to catch it, so an
      // async-throwing predicate returned a clean `{capable:false, threw:null}` and then killed the
      // process at the microtask checkpoint — the throw neither recorded nor surfaced, in a module
      // whose docblock promises it never throws. Swallow the rejection, and report the shape as the
      // finding it is.
      if (isThenable(result)) {
        try { Promise.resolve(result).catch(() => {}); } catch { /* not a real promise; nothing to settle */ }
        out.asyncResult = true;
        out.threw = `${label}: predicate returned a thenable — this self-test is synchronous and cannot judge it`;
        return { ok: false, blocking: false };
      }
      return { ok: true, blocking: isBlocking(result) === true };
    } catch (err) {
      // A throw is a finding, not a pass. Recorded and surfaced rather than absorbed.
      out.threw = `${label}: ${describeThrown(err)}`;
      return { ok: false, blocking: false };
    }
  };

  const b = run(blockingInput, 'blockingInput');
  const p = run(passingInput, 'passingInput');
  out.produced.blocking = b.ok && b.blocking === true;
  out.produced.passing = p.ok && p.blocking === false;

  if (out.asyncResult) {
    out.detail = `${name}: returned a PROMISE, which this synchronous self-test cannot judge (${out.threw}) — `
      + 'undemonstrated is not the same as passing, so it still cannot be cited';
    return out;
  }
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
