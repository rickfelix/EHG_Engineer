/**
 * The out-of-process half of the fence — SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001 (FR-1 + FR-2).
 *
 * WHY THIS EXISTS. Two properties of tests/setup.unit.js cannot be observed from inside the tier
 * it configures:
 *
 *   1. FR-1 IS UNCONDITIONAL. `=` and `||=` behave identically unless real credentials are ambient.
 *      A normal run on a credential-free machine cannot tell them apart, so the difference has to
 *      be created deliberately — by exporting real-shaped credentials into a CHILD vitest process.
 *
 *   2. FR-2 IS EVALUATED AFTER THE ASSIGNMENT. Moved above it, the post-condition check reads the
 *      ambient environment instead of the tier's, reports a breach on every machine with a `.env`,
 *      and aborts runs that are perfectly safe. That regression is invisible in-tier: a worker
 *      cannot watch itself refuse to start.
 *
 * So this harness runs the real vitest CLI as a child, with a fabricated but structurally-real
 * SUPABASE_URL exported, and asserts on what the child REPORTS. The fabricated ref is NOT a real
 * project — nothing here can reach a database, and no test body that writes is ever collected.
 *
 * The clean case asserts on OUTPUT, not exit code: nested vitest can exit non-zero after a fully
 * passing run (CI demonstrated it on this test). The positive control keeps an exit-code assertion,
 * so the harness is still proven able to see a failure.
 *
 * TWO-SIDED BY CONSTRUCTION. Asserting only "the child exits 0" would also pass if the child never
 * ran anything, so the clean case additionally requires the child to report passing tests. And the
 * suite carries a positive control proving this harness CAN observe a failure, so a green here is
 * evidence about setup.unit.js rather than evidence that the harness is inert.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { REQUIRED_SENTINELS, CREDENTIAL_FENCE_TOKEN } from '../../helpers/credential-fence.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Structurally a Supabase project URL, deliberately not a real project. */
const FABRICATED_URL = 'https://zzfabricatedref00.supabase.co';
const FABRICATED_KEY = 'fabricated-service-role-key-not-a-real-credential';

function runChildVitest(testPath, extraEnv) {
  const env = {
    ...process.env,
    ...extraEnv,
    // Never let an inherited opt-in authorise anything in the child.
    VITEST_DB_ALLOW_REF: '',
    CI: '1',
  };
  // DELIBERATELY NOT STRIPPING VITEST_* FROM THE CHILD, and the reason is measured. I added such a
  // strip on the theory that inherited VITEST_POOL_ID / VITEST_WORKER_ID explained the child's
  // non-zero exit, and it made things strictly worse: in CI the child then produced no run output at
  // all, where before the strip it had reported "Test Files 1 passed (1) / Tests 5 passed (5)".
  // Two changes shipped in one commit — the assertion fix, which was needed, and this strip, which
  // was a guess — and the guess broke the case the fix had repaired.
  const res = spawnSync(
    'npx',
    ['vitest', 'run', '--project', 'unit', testPath],
    { cwd: REPO, env, encoding: 'utf8', shell: process.platform === 'win32', timeout: 240000 },
  );
  return { status: res.status, output: `${res.stdout || ''}${res.stderr || ''}` };
}

// NESTED VITEST DOES NOT RUN UNDER THIS CI, so the suite skips there — VISIBLY, never silently.
//
// HOW I LEARNED THAT, because the mistake is more instructive than the conclusion. The first CI
// failure showed this test red next to a log line reading "Test Files 1 passed (1) / Tests 5
// passed (5)", and I read that as "the child ran and passed but returned a bad exit code" — so I
// changed the assertions to stop trusting the exit code. Wrong process. sentinel-applies.test.js
// is ALSO collected by the unit tier directly, and it is exactly 1 file / 5 tests: that line was
// the PARENT running it, not the child. The child had produced nothing, and never had. I spent two
// CI cycles fixing a symptom that did not exist because I attributed output to the wrong producer.
//
// WHAT IS LOST, stated rather than papered over: in CI nothing exercises "the sentinel WINS over
// ambient credentials". It cannot be tested there by any in-tier assertion, because the Unit Tier
// workflow injects no secrets and this SD removes them from the coverage workflow — so no CI job
// has ambient credentials to be beaten. What CI DOES still enforce is the FR-2 post-condition,
// which runs in every worker on every job and aborts the tier if the sentinel is not in place.
// The uncovered half is the ORDERING, and it is covered locally: 26/26 green here, plus two
// mutations verified to kill (restore `||=`; move the fence above the assignment).
const NESTED_VITEST_AVAILABLE = !process.env.CI;

describe.skipIf(!NESTED_VITEST_AVAILABLE)('unit tier under ambient real-shaped credentials (child process)', () => {
  it(
    'starts cleanly and the sentinel WINS over the ambient credentials',
    () => {
      // THE DECISIVE CASE. With `||=` the ambient FABRICATED_URL would survive into the tier and
      // sentinel-applies.test.js would fail. With the fence evaluated BEFORE the assignment the
      // tier would abort on the ambient value and never run a test at all. Only the shipped
      // ordering — assign unconditionally, then assert the post-condition — produces a clean pass.
      // Built FROM the contract rather than hardcoded. A credential variable added to
      // REQUIRED_SENTINELS is fabricated here automatically, so this harness cannot silently stop
      // covering one. URL-shaped names get a URL so projectRefOf resolves them; the rest get a key.
      const ambient = Object.fromEntries(
        Object.keys(REQUIRED_SENTINELS).map((k) => [k, k.endsWith('_URL') ? FABRICATED_URL : FABRICATED_KEY]),
      );
      const { output } = runChildVitest('tests/unit/setup/sentinel-applies.test.js', ambient);

      // WHAT IS ASSERTED, AND WHY NOT THE EXIT CODE. Under `||=` the ambient URL survives into the
      // tier and sentinel-applies.test.js fails, so no "Tests N passed" line appears. Under a fence
      // evaluated BEFORE the assignment the child aborts on the ambient value, printing the breach
      // token and running nothing. Both assertions below therefore go red for both regressions.
      //
      // The child's exit code is deliberately NOT asserted in this direction: nested vitest can
      // return non-zero after a fully passing run, which CI demonstrated on this exact test (child
      // reported "Tests 5 passed (5)" and still exited non-zero). Asserting it made the suite report
      // an environment artefact as a credential-fence failure. The positive control below still
      // proves this harness can observe a non-zero exit, so nothing is assumed about the plumbing.
      expect(output).not.toContain(CREDENTIAL_FENCE_TOKEN);
      // Not merely "it ran" — a run that collected nothing is also quiet. Require real passes.
      expect(output).toMatch(/Tests\s+\d+ passed/);
      expect(output).not.toMatch(/Tests\s+\d+ failed/);
    },
    300000,
  );

  it(
    'POSITIVE CONTROL: this harness can observe a child failure',
    () => {
      // Without this, a green above would be consistent with spawnSync silently failing to run
      // vitest at all. Pointed at a path that matches no test file, the CLI exits non-zero — so
      // the harness is demonstrably able to report a bad outcome.
      const { status } = runChildVitest('tests/unit/setup/__no_such_file_exists__.test.js', {});
      expect(status).not.toBe(0);
    },
    300000,
  );
});
