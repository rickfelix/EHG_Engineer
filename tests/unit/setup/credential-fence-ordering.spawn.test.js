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
 * SUPABASE_URL exported, and asserts on the child's exit code and output. The fabricated ref is
 * NOT a real project — nothing here can reach a database, and no test body that writes is ever
 * collected.
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
  const res = spawnSync(
    'npx',
    ['vitest', 'run', '--project', 'unit', testPath],
    { cwd: REPO, env, encoding: 'utf8', shell: process.platform === 'win32', timeout: 240000 },
  );
  return { status: res.status, output: `${res.stdout || ''}${res.stderr || ''}` };
}

describe('unit tier under ambient real-shaped credentials (child process)', () => {
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
      const { status, output } = runChildVitest('tests/unit/setup/sentinel-applies.test.js', ambient);

      expect(output).not.toContain(CREDENTIAL_FENCE_TOKEN);
      // Not merely "exit 0" — a run that collected nothing also exits 0. Require real passes.
      expect(output).toMatch(/Tests\s+\d+ passed/);
      expect(status).toBe(0);
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
