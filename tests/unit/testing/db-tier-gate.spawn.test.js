/**
 * SD-LEO-INFRA-VITEST-TIER-REAL-001 — spawn arms: the gate through a REAL child vitest.
 *
 * LOCAL-ONLY (skipIf CI): nested vitest does not run under this CI — the precedent and the
 * reason every CI-load-bearing assertion lives in db-tier-gate.test.js (in-process). These arms
 * exist because only a real child run can prove the END-TO-END shape: collection resolves the
 * canary, the setup gate fires inside the worker, tests REPORT skipped, and the exit code is
 * what the pre-commit hook would actually see.
 *
 * The throwaway config IMPORTS the real vitest.config.js and overrides ONLY include — never the
 * predicate, never the setup file. Re-declaring either is how gates drift from what they guard.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const IS_CI = !!process.env.CI;

/** Child env with designation stripped or granted; PATH etc. inherited. */
function childEnv(overrides) {
  const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
  delete env.VITEST_DB_ALLOW_REF;
  delete env.CI; // the child must behave like the local runs it models
  return { ...env, ...overrides };
}

function runChild({ configFile, env }) {
  // spawnSync, not execFileSync: the tier banner rides STDERR, which execFileSync silently
  // drops on a zero exit — the banner assertion would be unsatisfiable on the success path.
  const r = spawnSync('npx', ['vitest', 'run', '--config', configFile], {
    cwd: REPO, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024, shell: true,
    env,
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}\n${r.stderr || ''}` };
}

function writeThrowawayConfig({ include }) {
  // Under the REPO (not os.tmpdir()): module resolution walks UP from the config file's own
  // location, and an OS-temp config has no node_modules above it — 'vitest/config' unresolvable.
  // .artifacts/ is the repo's untracked-scratch convention.
  fs.mkdirSync(path.join(REPO, '.artifacts'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(REPO, '.artifacts', 'db-tier-gate-spawn-'));
  const file = path.join(dir, 'vitest.throwaway.config.mjs');
  // RELATIVE paths only: a bare 'C:/...' string is not a valid ESM specifier, and an absolute
  // setupFiles entry is silently dropped (measured: the child ran with the gate never installed
  // — which let the hostile fixture reach its unguarded shape). The config sits two levels below
  // the repo root; setupFiles resolve against the child's cwd (the repo root).
  fs.writeFileSync(file, `
import base from '../../vitest.config.js';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    projects: undefined,
    setupFiles: ['./tests/setup.db.js'],
    include: ${JSON.stringify(include)},
    passWithNoTests: false,
  },
});
`);
  return { dir, file };
}

describe.skipIf(IS_CI)('spawn: undesignated tier run — canary skips, exit 0, banner on stderr', () => {
  it('TS-1: the no-guard-import canary reports skipped with exit 0', () => {
    const { dir, file } = writeThrowawayConfig({
      include: ['tests/integration/__db_tier_canary__/tier-gate-canary.test.js'],
    });
    try {
      const r = runChild({
        configFile: file,
        env: childEnv({ SUPABASE_URL: 'https://zzznotdesignated.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }),
      });
      expect(r.out).toMatch(/skipped/i);
      expect(r.out).toContain('[vitest][db-tier] SKIPPED at runtime');
      expect(r.out).not.toMatch(/\bpassed\b.*\b[1-9]\d* passed/);
      expect(r.code, 'a cleanly-skipped tier run must exit 0 — the pre-commit contract').toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('TS-2: the hostile bypass fixture is REFUSED — zero live traffic, loud DB_TIER_BLOCKED failure', () => {
    const { dir, file } = writeThrowawayConfig({
      include: ['tests/fixtures/db-tier-canary/bypass-attempt.canaryspec.mjs'],
    });
    try {
      const r = runChild({
        configFile: file,
        env: childEnv({ SUPABASE_URL: 'https://zzznotdesignated.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }),
      });
      // The beforeAll DB call is refused BEFORE any socket opens; the file fails LOUDLY —
      // a hook that demands a DB is unrunnable here, and green-over-broken would hide it.
      expect(r.out).toMatch(/DB_TIER_BLOCKED: refused http/);
      expect(r.out).toMatch(/skipped|failed/i);
      expect(r.code, 'a refused hook is a loud failure, not a silent green').not.toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('TS-1 designated control: the canary EXECUTES when the ref is authorized', () => {
    const { dir, file } = writeThrowawayConfig({
      include: ['tests/integration/__db_tier_canary__/tier-gate-canary.test.js'],
    });
    try {
      const r = runChild({
        configFile: file,
        env: childEnv({
          SUPABASE_URL: 'https://myref123abc.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'k',
          VITEST_DB_ALLOW_REF: 'myref123abc',
        }),
      });
      expect(r.out).toMatch(/2 passed/);
      expect(r.out).not.toContain('[vitest][db-tier] SKIPPED at runtime');
      expect(r.code).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
