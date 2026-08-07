/**
 * The unit-tier credential fence — SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001 (FR-2).
 *
 * WHAT WENT WRONG. tests/setup.unit.js applied its synthetic sentinel with `||=`, so the sentinel
 * took effect EXACTLY when nothing was set and was skipped EXACTLY when a real Supabase URL was
 * present. Downstream, tests/unit/lib/eva/quality-findings/fr-c-generator.test.js gated a block
 * that INSERTs/UPDATEs/DELETEs four production tables on `describe.skipIf(!HAS_REAL_DB)` — a
 * predicate derived from credential presence. The live-write suite was therefore gated on the
 * guard having FAILED: guard applies -> suite skips; guard inverts -> suite writes production.
 * Same branch, two directions.
 *
 * That is not theoretical. 11 residual production strategic_directives_v2 rows carry the suite's
 * fc000000- fixture venture_id, spanning 2026-05-04 to 2026-07-07 across 8 distinct dates. Ten
 * were cancelled by cleanup; one (SD-LEO-FIX-REMEDIATION-UNIT-TEST-006) survived non-terminal in
 * the live self-claimable belt until this SD retired it. Treat 11 as a LOWER bound: cleanup added
 * by SD-LEO-FIX-FIX-GENERATOR-INTEGRATION-001 means a successful run now leaves no residue, so
 * silence after 2026-07-07 is not evidence the suite stopped running.
 *
 * ─── WHY THIS CHECKS THE POST-CONDITION, NOT THE AMBIENT ENVIRONMENT ──────────────────────────
 *
 * The SD specified FR-2 as: abort when a real, non-sentinel SUPABASE_URL is PRESENT at unit-tier
 * start. That was built first and then MEASURED, and it aborted an ordinary local run on the first
 * try — because vitest.config.js:16-17 loads `.env` in the PARENT process for DB-target gating and
 * `pool:'forks'` means every worker inherits it. Ambient credentials are not the exceptional case
 * in this repo; they are the NORMAL case, present on every machine with a `.env`. A fence keyed on
 * their presence fires on every developer run and every fleet seat, and a guard that screams when
 * nothing is wrong is removed within a day — leaving the tier with no fence at all.
 *
 * So the trigger moved to where the harm actually is. FR-1 (unconditional assignment) already
 * neutralises ambient credentials: by the time any test body runs, process.env holds the sentinel.
 * What FR-2 must catch is that FR-1 STOPPED WORKING — a reintroduced `||=`, a reordering, a fifth
 * credential variable added and not sentinelled. That is a POST-CONDITION on the environment the
 * tier actually hands to its tests, and it is silent in normal operation precisely because it
 * asserts the thing FR-1 guarantees.
 *
 * The distinction is the same one this whole SD is about: liveness must never be DERIVED from
 * credential presence. Checking "are credentials present?" answers a question about the operator's
 * shell. Checking "does the tier hold the sentinel?" answers the question that determines whether
 * a test can write to production — and only the second one can be satisfied by fixing the defect.
 *
 * WHY A SEPARATE, PURE MODULE. The fence has to live in a vitest setupFile, and a setupFile that
 * aborts kills its own worker — so no in-tier test can watch its own tier abort. Splitting the
 * DECISION (here: pure, total, no I/O) from the ACTION (setup.unit.js: write to stderr, exit
 * non-zero) makes every branch directly assertable, while the one thing a pure test cannot prove —
 * that setup.unit.js evaluates it AFTER assignment rather than before — is covered out-of-process
 * by tests/unit/setup/credential-fence-ordering.spawn.test.js.
 *
 * ORDERING IS LOAD-BEARING, IN THE OPPOSITE DIRECTION TO THE OBVIOUS ONE. This predicate must be
 * evaluated AFTER the sentinel assignment. Evaluated before, it reads the ambient environment,
 * reports a breach on every machine with a `.env`, and is disabled by the first person it stops.
 */
import { projectRefOf } from './db-target.js';

/**
 * The synthetic values the unit tier runs on. Exported so tests/setup.unit.js and this fence share
 * ONE definition — two copies of a sentinel is how the fence and the thing it guards drift apart.
 */
export const SENTINEL_URL = 'https://test.invalid.local';
export const SENTINEL_SERVICE_ROLE_KEY = 'test-service-role-key-not-real';
export const SENTINEL_ANON_KEY = 'test-anon-key-not-real';

/**
 * The single named, greppable token emitted on abort. Tests assert on THIS, not on the surrounding
 * prose, so the explanation can be reworded without silently disarming the check.
 */
export const CREDENTIAL_FENCE_TOKEN = 'UNIT_TIER_SENTINEL_BREACH';

/**
 * Every credential variable the unit tier is responsible for neutralising, and the value it must
 * hold once setup has run. Adding a variable here without also assigning it in setup.unit.js makes
 * this fence fail loudly — which is the intended way to notice.
 */
export const REQUIRED_SENTINELS = Object.freeze({
  SUPABASE_URL: SENTINEL_URL,
  NEXT_PUBLIC_SUPABASE_URL: SENTINEL_URL,
  SUPABASE_SERVICE_ROLE_KEY: SENTINEL_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: SENTINEL_ANON_KEY,
});

/**
 * Describe a breaching value WITHOUT reproducing it. A fence that prints the secret it caught has
 * copied that secret into CI logs, which is a worse outcome than the leak it was reporting.
 */
function describeBreach(actual) {
  if (actual === undefined) return '(unset)';
  if (typeof actual !== 'string') return `(non-string: ${typeof actual})`;
  const ref = projectRefOf(actual);
  if (ref) return `a live Supabase project ref: ${ref}`;
  return '(a non-sentinel value — withheld)';
}

/**
 * Assert the post-condition: after setup has run, the tier holds the sentinel for every credential
 * variable it is responsible for.
 *
 * Pure and total — takes the env bag as a parameter, reads no globals, performs no I/O, never
 * throws. Both arms are therefore directly provable with no module-cache games.
 *
 * @param {Record<string,string|undefined>} envAfterSetup process.env AFTER the sentinel assignment.
 * @returns {{abort: boolean, token: string|null, breaches: Array<{key: string, detail: string}>}}
 */
export function evaluateSentinelPostCondition(envAfterSetup) {
  const env = envAfterSetup || {};
  const breaches = [];

  for (const [key, expected] of Object.entries(REQUIRED_SENTINELS)) {
    if (env[key] !== expected) {
      breaches.push({ key, detail: describeBreach(env[key]) });
    }
  }

  return {
    abort: breaches.length > 0,
    token: breaches.length > 0 ? CREDENTIAL_FENCE_TOKEN : null,
    breaches,
  };
}

/**
 * The operator-facing explanation. Kept beside the predicate so the message and the decision that
 * produces it cannot drift, and returned as a string rather than printed so this module stays free
 * of I/O.
 */
export function formatCredentialFenceError(fence) {
  return [
    `${fence.token}: the unit tier refused to start because it does not hold the synthetic credential sentinel.`,
    '',
    ...fence.breaches.map((b) => `  ${b.key} holds ${b.detail} — expected the sentinel.`),
    '',
    'This is a DRIFT alarm, not a report about your shell. tests/setup.unit.js assigns these four',
    'variables unconditionally, so reaching this point means that assignment stopped working —',
    'typically a reintroduced `||=`, a reordering that evaluates this check before the assignment,',
    'or a new credential variable added without a sentinel.',
    '',
    'Why it matters: suites that derive "is a real database available?" from credential presence',
    'would read this environment as permission to WRITE. That inversion put 11 rows into production',
    'before SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001 closed it.',
    '',
    'Fix the assignment in tests/setup.unit.js — do not silence this check. Suites that genuinely',
    'need a database belong in the db tier, authorised explicitly with VITEST_DB_ALLOW_REF=<ref>',
    'naming the ref your SUPABASE_URL actually points at. Never name production.',
  ].join('\n');
}
