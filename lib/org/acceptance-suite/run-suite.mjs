/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 (FR-1): the Organization Acceptance Suite
 * runner. Design feedback 20b858dc section 5 (A1-A6): a versioned, self-testing suite whose
 * results carry provenance (suite version, run id, content hash) -- "the organization never
 * grades itself" (A4).
 *
 * INVOCATION SHAPES:
 *   runSuite({ organization, checks })
 *     -- convenience form: runs `checks` against ONE organization object. Sugar for a single
 *        case with expectedBroken=false. catch_rate is null (nothing seeded-broken in this run).
 *   runSuite({ cases: [{ id, organization, expectedBroken }], checks })
 *     -- the A3 self-test form: a mixed battery of clean cases (expectedBroken:false) and
 *        deliberately-broken MAST fixtures (expectedBroken:true). pass_rate is computed over the
 *        clean cases (did every check pass?); catch_rate is computed over the broken cases (was
 *        at least one check caught?) -- "every run must fail every fixture; catch rate reported
 *        beside pass rate" (A3).
 *
 * A check function has signature (organization) => { passed: boolean, findings?: Array } and
 * MUST NOT throw for a well-formed organization; a malformed organization may cause a check to
 * throw, which the runner catches and records as a failed check with an error finding (TS-8) --
 * never a silent crash of the whole run.
 */
import { randomUUID, createHash } from 'node:crypto';

export const SUITE_VERSION = '1.0.0';

/**
 * Deterministic stringify -- recursive sorted keys, stable across key insertion order. Same
 * algorithm as lib/sub-agent-executor/evidence-provenance.js's private stableStringify (not
 * exported there, so re-implemented here per the proven pattern rather than a fresh hand-roll --
 * PLAN-TO-EXEC TESTING review TR-6).
 *
 * EXEC-TO-PLAN SECURITY review finding: `cases[].organization` is caller-supplied and this
 * function is used to compute content_hash OUTSIDE runOneCheck's per-check try/catch, so an
 * unguarded recursive walk of a circular object (e.g. `org.self = org`) previously crashed the
 * entire runSuite() call with an uncaught RangeError ("Maximum call stack size exceeded") instead
 * of degrading to a reported failure -- violating this suite's own TS-8 contract ("never a silent
 * crash of the whole run"). The `seen` WeakSet tracks the current ancestor chain (added on entry,
 * removed on exit) so a true cycle renders as the literal string "[Circular]" while a
 * non-cyclic shared reference (the same object appearing twice at unrelated positions, not a
 * cycle) still stringifies normally.
 */
function stableStringify(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (seen.has(value)) return '"[Circular]"';
  seen.add(value);
  try {
    if (Array.isArray(value)) return '[' + value.map((v) => stableStringify(v, seen)).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k], seen)).join(',') + '}';
  } finally {
    seen.delete(value);
  }
}

function normalizeCases(input) {
  if (Array.isArray(input.cases)) return input.cases;
  return [{ id: 'default', organization: input.organization, expectedBroken: false }];
}

/** Checks may be sync or async (the 2 integrity checks query a live database) -- always awaited. */
async function runOneCheck(check, organization) {
  try {
    const result = await check.check(organization);
    return {
      check_id: check.id,
      passed: Boolean(result?.passed),
      reason: result?.passed ? undefined : (result?.reason ?? 'check reported failure with no reason'),
    };
  } catch (err) {
    return { check_id: check.id, passed: false, reason: `check threw: ${err.message}` };
  }
}

/**
 * @param {object} input
 * @param {object} [input.organization] single-case convenience form
 * @param {Array<{id: string, organization: object, expectedBroken: boolean}>} [input.cases] batch/self-test form
 * @param {Array<{id: string, check: Function}>} input.checks
 * @returns {Promise<{suite_version: string, run_id: string, content_hash: string, pass_rate: number, catch_rate: number|null, findings: Array}>}
 */
export async function runSuite(input) {
  if (!input || !Array.isArray(input.checks) || input.checks.length === 0) {
    throw new Error('runSuite: input.checks must be a non-empty array of {id, check}');
  }
  const cases = normalizeCases(input);
  if (cases.length === 0) throw new Error('runSuite: at least one case is required');

  const findings = [];
  let cleanTotal = 0;
  let cleanPassedAll = 0;
  let brokenTotal = 0;
  let brokenCaught = 0;

  for (const c of cases) {
    const expectedBroken = Boolean(c.expectedBroken);
    const caseResults = await Promise.all(input.checks.map((check) => runOneCheck(check, c.organization)));
    for (const r of caseResults) findings.push({ case_id: c.id, ...r });

    if (expectedBroken) {
      brokenTotal += 1;
      if (caseResults.some((r) => !r.passed)) brokenCaught += 1;
    } else {
      cleanTotal += 1;
      if (caseResults.every((r) => r.passed)) cleanPassedAll += 1;
    }
  }

  const pass_rate = cleanTotal > 0 ? Math.round((cleanPassedAll / cleanTotal) * 100) : 100;
  const catch_rate = brokenTotal > 0 ? Math.round((brokenCaught / brokenTotal) * 100) : null;

  // EXEC-TO-PLAN SECURITY review finding: content_hash computation is the one step in this
  // function that is NOT already covered by runOneCheck's per-check try/catch. stableStringify's
  // cycle guard (above) closes the realistic crash vector, but this try/catch is a deliberate
  // backstop for any other stringify-time throw (e.g. a caller-supplied organization containing a
  // BigInt, which JSON.stringify rejects) -- content_hash degrades to null with a findings[] entry
  // instead of the whole run throwing uncaught.
  let content_hash;
  try {
    content_hash = createHash('sha256')
      .update(stableStringify({
        suite_version: SUITE_VERSION,
        checks: input.checks.map((c) => c.id).sort(),
        cases: cases.map((c) => ({ id: c.id, expectedBroken: Boolean(c.expectedBroken), organization: c.organization })),
      }))
      .digest('hex');
  } catch (err) {
    content_hash = null;
    findings.push({ case_id: null, check_id: '__content_hash__', passed: false, reason: `content_hash computation failed: ${err.message}` });
  }

  return {
    suite_version: SUITE_VERSION,
    run_id: randomUUID(),
    content_hash,
    pass_rate,
    catch_rate,
    findings,
  };
}
