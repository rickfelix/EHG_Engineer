/**
 * SD-LEO-INFRA-E2E-DBTIER-PROD-REF-GUARD-001 — FR-4: the exit predicate proven end-to-end
 * through a REAL child `playwright test` process, for every one of the five playwright*.config.js
 * entry points. Mirrors tests/unit/testing/db-tier-gate.spawn.test.js's spawnSync pattern.
 *
 * ============================================================================================
 * SAFETY INVARIANT — READ BEFORE EDITING THIS FILE. Both `--list` and a NON-MATCHING positional
 * spec filter are MANDATORY on every invocation of the child process below. Together they
 * guarantee ZERO spec files are ever loaded, in EITHER branch (refused or not-refused) --
 * `--list` alone still runs spec module scope for matching files, and a bare `playwright test`
 * (missing either flag) on the not-refused branch runs the WHOLE suite against whatever target
 * is configured. A naive version of this exact regression test IS the incident on its failure
 * path. Do not remove `--list`. Do not remove or widen the filter pattern below.
 * ============================================================================================
 *
 * Discrimination is by STDERR CONTENT (the guard's own refusal string), not exit code --
 * measured empirically: both branches exit non-zero (the refused branch because the config
 * itself throws; the not-refused branch because Playwright's own reporting layer expects
 * artifacts that were never produced when zero tests matched the filter).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const IS_CI = !!process.env.CI;

const PRODUCTION_REF = 'dedlbzhpgkmetvhbkyzq';
const GUARD_REFUSAL_TOKEN = '[e2e-db-target-guard] Refused';

// MANDATORY on every invocation -- see the safety invariant in the file header.
const NO_MATCH_FILTER = '__leo_guard_probe_no_such_spec__';

const CONFIGS = [
  'playwright.config.js',
  'playwright-uat.config.js',
  'playwright-uat-nosetup.config.js',
  'playwright-test.config.js',
  'playwright.diagnostic.config.js',
];

/**
 * Spawns `npx playwright test --config <cfg> --list <NO_MATCH_FILTER>` with the given env.
 * The --list + non-matching filter combination is NON-NEGOTIABLE (see file header).
 */
function runGuardedProbe({ configFile, env }) {
  const r = spawnSync(
    'npx',
    ['playwright', 'test', '--config', configFile, '--list', NO_MATCH_FILTER],
    {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
      shell: true,
      env: { ...env, FORCE_COLOR: '0', NO_COLOR: '1' },
    }
  );
  return { code: r.status ?? 1, out: `${r.stdout || ''}\n${r.stderr || ''}` };
}

/** Env with a resolved target of the production ref -- the SD's exit predicate. */
function poisonedProdEnv() {
  const env = { ...process.env };
  delete env.VITEST_DB_ALLOW_REF;
  env.SUPABASE_URL = `https://${PRODUCTION_REF}.supabase.co`;
  env.SUPABASE_SERVICE_ROLE_KEY = 'k';
  return env;
}

/**
 * Env with no resolvable target. Empirically verified (not assumed): a spawned
 * playwright.config.js self-loads dotenv.config(), which reloads the real on-disk .env's
 * production URL UNLESS the var is already present (even as an empty string) -- dotenv only
 * fills in vars that are absent. Setting both to '' is what actually produces a credential-less
 * resolved target in a spawned child; simply omitting/deleting the vars does not, because dotenv
 * fills them back in from the file.
 */
function safeNoTargetEnv() {
  const env = { ...process.env };
  delete env.VITEST_DB_ALLOW_REF;
  env.SUPABASE_URL = '';
  env.NEXT_PUBLIC_SUPABASE_URL = '';
  env.SUPABASE_SERVICE_ROLE_KEY = '';
  return env;
}

describe.skipIf(IS_CI)('e2e-db-target-guard spawn regression (real child playwright process)', () => {
  for (const configFile of CONFIGS) {
    describe(configFile, () => {
      it(`TS-1: production-ref target aborts before any spec loads (${configFile})`, () => {
        const { code, out } = runGuardedProbe({ configFile, env: poisonedProdEnv() });
        expect(out).toContain(GUARD_REFUSAL_TOKEN);
        expect(out).toContain(PRODUCTION_REF);
        expect(code).not.toBe(0);
      });

      it(`not-refused control: a genuinely credential-less target is never treated as refused (${configFile})`, () => {
        const { out } = runGuardedProbe({ configFile, env: safeNoTargetEnv() });
        expect(out).not.toContain(GUARD_REFUSAL_TOKEN);
      });
    });
  }

  it('TS-5: the child_process write path (tests/e2e/phase-handoffs.spec.ts shells out to scripts/handoff.js) is covered transitively -- zero spec files load on the refused branch, so its own child_process shell-out can never execute', () => {
    const { out } = runGuardedProbe({ configFile: 'playwright.config.js', env: poisonedProdEnv() });
    // The guard throws at config module-scope (empirically confirmed at
    // configLoader.js loadUserConfig, in manual verification during PLAN-TO-EXEC) -- strictly
    // before Playwright's test collection phase, so no spec file (phase-handoffs.spec.ts
    // included) is ever loaded, and therefore its own child_process.execSync/spawn call to
    // scripts/handoff.js can never run. No spec-execution output of any kind should appear.
    expect(out).toContain(GUARD_REFUSAL_TOKEN);
    expect(out).not.toMatch(/phase-handoffs/i);
    expect(out).not.toMatch(/handoff\.js execute/i);
  });
});
