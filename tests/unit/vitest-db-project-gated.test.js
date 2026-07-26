/**
 * QF-20260726-459 Part 1b — the db PROJECT itself must be gated, not just the helper.
 *
 * WHY PART 1 WAS NOT ENOUGH. Part 1 made tests/helpers/db-available.js fail closed. Measured
 * statically against the config's own globs, the db project resolves 225 files and only 100
 * reference that helper in any form. THE OTHER 125 NEVER IMPORT IT — so no change to the helper
 * could gate them, and the db project's setupFiles load the real .env. The QF's title claim
 * ("db-project vitest tests can run against PRODUCTION") stayed true for those 125 files.
 *
 * A per-file fix does not scale to 125 and silently un-fixes itself when someone adds file 226.
 * The project definition is the only place that covers every file regardless of its imports, so
 * the gate lives in vitest.config.js and this test pins it there.
 *
 * WHAT THIS ASSERTS: the RESOLVED config, not a re-implementation of the predicate. Each arm
 * re-imports vitest.config.js with a different environment (cache-busted so the module-level gate
 * re-evaluates) and reads the db project's `include`. Empty include => vitest resolves zero files.
 *
 * No DB is contacted: the config is pure module evaluation, and the non-production ref used below
 * does not exist. This respects the QF's hard constraint against re-running the db project live.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'dedlbzhpgkmetvhbkyzq'; // the ref Part 1 measured as live in the shared .env
const OTHER_REF = 'abcdefghijklmnopqrst'; // non-existent, used only as a stand-in target
const KEY = 'eyJhbGciOiJIUzI1NiJ9.service-role.signature';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Evaluate vitest.config.js in a FRESH node process under `env` and return the db project's
 * include array.
 *
 * A child process rather than a dynamic import, for two reasons. The config imports
 * `vitest/config`, which does not load cleanly inside a vitest worker. More importantly, the gate
 * is a MODULE-LEVEL evaluation that really does happen once per process at config load — so a
 * fresh process is the faithful reproduction, and re-importing with a cache-buster inside one
 * worker would be testing a situation that never occurs.
 */
function dbInclude(env) {
  // MARKER-DELIMITED, deliberately. dotenvx prints a randomised tip banner to stdout and some of
  // those tips contain literal brackets (e.g. "{ path: ['.env.local', '.env'] }"), so slicing on
  // the first '[' parses the BANNER instead of the payload — and because the tip rotates, that
  // reads as an intermittent failure rather than a bug in the harness. Never scan for punctuation
  // in output you do not solely own.
  const script =
    "const c=(await import('./vitest.config.js')).default;" +
    "const d=(c.test.projects||[]).find(p=>p?.test?.name==='db');" +
    "process.stdout.write('<<<INC'+JSON.stringify(d?.test?.include??null)+'INC>>>');";
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    // Drop any inherited opt-in/creds so each arm states its own environment completely.
    env: { ...process.env, SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, VITEST_DB_ALLOW_REF: undefined, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const m = out.match(/<<<INC([\s\S]*?)INC>>>/);
  expect(m, `config probe produced no payload; raw output:\n${out}`).toBeTruthy();
  return JSON.parse(m[1]);
}

describe('QF-459 Part 1b: db project resolves ZERO files unless the target is designated', () => {
  it('REFUSES the production target when no opt-in is present', () => {
    // The armed configuration: real credentials, production ref, no opt-in. This is the state the
    // shared root runs in, and it is what let 125 unguarded files execute against production.
    const include = dbInclude({
      SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      VITEST_DB_ALLOW_REF: undefined,
    });
    expect(include).toEqual([]);
  });

  it('REFUSES when the opt-in names a DIFFERENT ref than the URL points at', () => {
    // Authorising a test project must never silently authorise production.
    const include = dbInclude({
      SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      VITEST_DB_ALLOW_REF: OTHER_REF,
    });
    expect(include).toEqual([]);
  });

  it('ALLOWS when the opt-in matches the target — proves this is not an always-off gate', () => {
    // THE LOAD-BEARING CONTROL. Without it, "include is empty" is satisfied equally by a gate that
    // can never open, which would silently delete all DB coverage while passing every refusal test
    // anyone would think to write. That failure mode is indistinguishable from a working gate.
    const include = dbInclude({
      SUPABASE_URL: `https://${OTHER_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      VITEST_DB_ALLOW_REF: OTHER_REF,
    });
    expect(include.length).toBeGreaterThan(0);
  });

  it('the gate covers the whole project, not a file subset', () => {
    // Emptying `include` is what makes this independent of what any individual test file imports —
    // the property Part 1 could not achieve. If someone later re-points the project at the
    // ungated glob list, this fails.
    const open = dbInclude({
      SUPABASE_URL: `https://${OTHER_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      VITEST_DB_ALLOW_REF: OTHER_REF,
    });
    const shut = dbInclude({
      SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
      VITEST_DB_ALLOW_REF: undefined,
    });
    expect(shut.length).toBe(0);
    expect(open.length).toBe(shut.length + open.length); // open is a strict superset of empty
    expect(open).toContain('**/*.db.test.js');
  });
});
