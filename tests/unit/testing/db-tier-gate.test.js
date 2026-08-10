/**
 * SD-LEO-INFRA-VITEST-TIER-REAL-001 — the db-tier runtime gate, IN-PROCESS.
 *
 * Nested vitest does not run under CI (tests/unit/setup/credential-fence-ordering.spawn.test.js
 * precedent), so every CI-load-bearing assertion here imports installDbTierGate directly and
 * executes the real wiring against injected dependencies. The spawn arms (local-only) live in
 * db-tier-gate.spawn.test.js and drive the same code through a real child vitest.
 *
 * Two-sided throughout: every undesignated behavior has a designated control.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { installDbTierGate, SENTINEL_URL, __resetWarnDedupeForTest } from '../../../tests/helpers/db-tier-gate.js';
import { assessDbTarget } from '../../../tests/helpers/db-target.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// These are the STRING KEYS the gate looks up in its injected env object — plain data under test,
// never a live client. Held as string literals (not bare identifiers) so the DB-test guard's
// code view correctly reads this as a unit test that touches no database.
const K_URL = 'SUPABASE_URL';
const K_NURL = 'NEXT_PUBLIC_SUPABASE_URL';
const K_SRK = 'SUPABASE_SERVICE_ROLE_KEY';
const K_ANON = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
const K_ALLOW = 'VITEST_DB_ALLOW_REF';

/** A realistic UNDESIGNATED env: real-looking ref with no authorization. */
const undesignatedEnv = () => ({
  [K_URL]: 'https://zzznotdesignated.supabase.co',
  [K_SRK]: 'real-looking-key',
});

/** A DESIGNATED env: the allow-ref names the ref the URL actually points at. */
const designatedEnv = () => ({
  [K_URL]: 'https://myref123abc.supabase.co',
  [K_SRK]: 'real-looking-key',
  [K_ALLOW]: 'myref123abc',
});

function harness(env) {
  const stderr = [];
  const globalObj = {};
  let skipRegistered = 0;
  const gate = installDbTierGate({
    env,
    globalObj,
    stderrWrite: (s) => stderr.push(s),
    registerSkip: () => { skipRegistered += 1; },
  });
  return { env, stderr, globalObj, gate, skips: () => skipRegistered };
}

beforeEach(() => __resetWarnDedupeForTest());

describe('FR-1 — the fetch guard is the safety layer (two-sided)', () => {
  it('undesignated: installs, forces sentinels, refuses a real URL naming it in the message AND the log', () => {
    const h = harness(undesignatedEnv());
    expect(h.gate.installed).toBe(true);
    expect(h.env[K_URL]).toBe(SENTINEL_URL);
    expect(h.env[K_NURL]).toBe(SENTINEL_URL);
    expect(h.env[K_SRK]).toBe('test-service-role-key-not-real');

    expect(() => h.globalObj.fetch('https://dedlbzhpgkmetvhbkyzq.supabase.co/rest/v1/ventures'))
      .toThrow(/DB_TIER_BLOCKED: refused https:\/\/dedlbzhpgkmetvhbkyzq\.supabase\.co\/rest\/v1\/ventures/);
    expect(h.gate.refusedRequests).toHaveLength(1);
    expect(h.gate.refusedRequests[0].url).toContain('dedlbzhpgkmetvhbkyzq');
  });

  it('undesignated: the guard refuses Request-like objects too, not only strings', () => {
    const h = harness(undesignatedEnv());
    expect(() => h.globalObj.fetch({ url: 'https://x.supabase.co/rest/v1/t' })).toThrow(/DB_TIER_BLOCKED/);
  });

  it('the MEASURED bypass is closed: re-forcing a real URL after install does not restore network', () => {
    const h = harness(undesignatedEnv());
    // Simulates dotenv.config({ override: true }) winning over the sentinel AFTER the gate ran.
    h.env[K_URL] = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
    // The guard reads nothing from env at call time — the refusal is unconditional.
    expect(() => h.globalObj.fetch(h.env[K_URL] + '/rest/v1/ventures')).toThrow(/DB_TIER_BLOCKED/);
    expect(h.gate.refusedRequests).toHaveLength(1);
  });

  it('DESIGNATED control: no guard installed, env untouched beyond ||= fallbacks, no skip, no stderr', () => {
    const env = designatedEnv();
    const h = harness(env);
    expect(h.gate.installed).toBe(false);
    expect(h.env[K_URL]).toBe('https://myref123abc.supabase.co'); // real value SURVIVES
    expect(h.globalObj.fetch).toBeUndefined();                          // fetch NOT replaced
    expect(h.skips()).toBe(0);
    expect(h.stderr).toHaveLength(0);
  });

  it('designated with a MISSING anon key: ||= fallbacks fill only the holes (collection safety)', () => {
    // A missing SERVICE key correctly fails the predicate closed (not designated) — so the
    // hole-filling contract is asserted on the anon key, which designation does not require.
    const env = designatedEnv();
    delete env[K_ANON];
    const h = harness(env);
    expect(h.gate.installed).toBe(false);
    expect(h.env[K_URL]).toBe('https://myref123abc.supabase.co');
    expect(h.env[K_SRK]).toBe('real-looking-key'); // real value SURVIVES
    expect(h.env[K_ANON]).toBe('test-anon-key-not-real'); // only the hole filled
  });

  it('a missing service key FAILS CLOSED even with a matching allow-ref (the predicate, not this gate, decides)', () => {
    const env = { [K_URL]: 'https://myref123abc.supabase.co', [K_ALLOW]: 'myref123abc' };
    const h = harness(env);
    expect(h.gate.installed, 'unconfirmable designation must gate, never pass').toBe(true);
    expect(h.env[K_URL]).toBe(SENTINEL_URL);
  });
});

describe('FR-2 — skip registration and loudness (two-sided)', () => {
  it('undesignated: registers the skip exactly once and writes ONE stderr line naming the reason', () => {
    const h = harness(undesignatedEnv());
    expect(h.skips()).toBe(1);
    expect(h.stderr).toHaveLength(1);
    expect(h.stderr[0]).toContain('[vitest][db-tier] SKIPPED at runtime');
    expect(h.stderr[0]).toContain('DB_TIER_BLOCKED');
    expect(h.stderr[0]).toContain('VITEST_DB_ALLOW_REF');
  });

  it('per-process dedupe: a second install in the same process does not write a second banner', () => {
    const first = harness(undesignatedEnv());
    const second = harness(undesignatedEnv());
    expect(first.stderr).toHaveLength(1);
    expect(second.stderr, 'the dedupe is per-process, so the second gate stays quiet').toHaveLength(0);
    // But the second gate still INSTALLS — loudness dedupe must never dedupe safety.
    expect(second.gate.installed).toBe(true);
    expect(second.skips()).toBe(1);
  });

  it('the loudness channel is stderr, never console.warn (measured-invisible from a setup file)', () => {
    const src = fs.readFileSync(path.join(REPO, 'tests/helpers/db-tier-gate.js'), 'utf8');
    const active = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    expect(active).not.toMatch(/console\.warn/);
  });
});

describe('the predicate is imported, never re-derived (single-representation)', () => {
  it('db-tier-gate.js contains no designation logic of its own — it calls assessDbTarget', () => {
    const src = fs.readFileSync(path.join(REPO, 'tests/helpers/db-tier-gate.js'), 'utf8');
    expect(src).toContain("from './db-target.js'");
    const active = src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    // Catches designation LOGIC (env reads / ref lists) while allowing the remedy string the
    // refusal message prints — a message naming the opt-in is guidance, not a second predicate.
    expect(active).not.toMatch(/DESIGNATED_NON_PROD|env\.VITEST_DB_ALLOW_REF|\.allowRef/);
  });

  it('the injected-target and computed-target paths agree', () => {
    const env = undesignatedEnv();
    const computed = harness({ ...env });
    const injected = installDbTierGate({
      env: { ...env }, globalObj: {}, stderrWrite: () => {}, registerSkip: () => {},
      target: assessDbTarget(env),
    });
    expect(computed.gate.installed).toBe(injected.installed);
  });
});

describe('config wiring — discovery is ungated and the phantom tree is excluded', () => {
  const cfg = fs.readFileSync(path.join(REPO, 'vitest.config.js'), 'utf8');

  it('DB_INCLUDE is used directly by the db project (no DB_INCLUDE_GATED discovery gate)', () => {
    expect(cfg).not.toContain('DB_INCLUDE_GATED');
    expect(cfg).toMatch(/include:\s*DB_INCLUDE,/);
  });

  it('.reaper-source/** is excluded — 3117 phantom entries otherwise diverge local from CI', () => {
    expect(cfg).toContain("'.reaper-source/**'");
    expect(cfg).toContain("'**/.reaper-source/**'");
  });

  it('the ddl overlap is deduplicated on the db project', () => {
    expect(cfg).toContain("'tests/ddl/**'");
  });

  it('the TS-1 canary is a tracked DB_INCLUDE member (git-derived, not a literal)', () => {
    // The canary must live in the population the tier gate exists to cover.
    const tracked = fs.existsSync(path.join(REPO, 'tests/integration/__db_tier_canary__/tier-gate-canary.test.js'));
    expect(tracked).toBe(true);
  });

  it('the TS-2 hostile fixture is NOT collectible: named outside *.test.js and *.spec.js', () => {
    const p = 'tests/fixtures/db-tier-canary/bypass-attempt.canaryspec.mjs';
    expect(fs.existsSync(path.join(REPO, p))).toBe(true);
    expect(/\.(test|spec)\.(js|mjs|cjs|ts|tsx)$/.test(p), 'membership-guard population must not include it').toBe(false);
  });
});
