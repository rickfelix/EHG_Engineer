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
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
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

  const content_hash = createHash('sha256')
    .update(stableStringify({
      suite_version: SUITE_VERSION,
      checks: input.checks.map((c) => c.id).sort(),
      cases: cases.map((c) => ({ id: c.id, expectedBroken: Boolean(c.expectedBroken), organization: c.organization })),
    }))
    .digest('hex');

  return {
    suite_version: SUITE_VERSION,
    run_id: randomUUID(),
    content_hash,
    pass_rate,
    catch_rate,
    findings,
  };
}
