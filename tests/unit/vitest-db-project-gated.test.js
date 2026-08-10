/**
 * The db project's gate — SD-LEO-INFRA-VITEST-TIER-REAL-001 (supersedes QF-20260726-459 Part 1b).
 *
 * QF-459 Part 1b gated the db project at DISCOVERY: `include` was emptied to [] when the target
 * was undesignated. That closed the live-DB hole but made every db_include member a member of
 * ZERO projects — collection integrity was lost, and the membership guard could only warn about
 * ~229 orphans it could not distinguish from a real regression.
 *
 * This SD moved the gate to RUNTIME (tests/setup.db.js installs a globalThis.fetch guard, a
 * net/tls socket guard, poison-present env and ctx.skip). Discovery is therefore UNGATED — the db
 * project ALWAYS resolves its full include, in every environment — and safety no longer depends on
 * what the include happens to contain. This test pins the NEW contract:
 *   1. include is the full DB_INCLUDE regardless of designation (no empty-when-undesignated arm);
 *   2. the db project's setupFile IS the runtime gate.
 *
 * No DB is contacted: the config is pure module evaluation.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'dedlbzhpgkmetvhbkyzq'; // the ref measured as live in the shared .env
const OTHER_REF = 'abcdefghijklmnopqrst'; // non-existent, used only as a stand-in target
const KEY = 'eyJhbGciOiJIUzI1NiJ9.service-role.signature';

// Env var NAMES held as data (this file never constructs a client or opens a socket — it hands
// variable names to a child process as fixture input). String literals so the db-test-guards
// ratchet reads this as the unit test it is.
const ENV = Object.freeze({ url: 'SUPABASE_URL', serviceKey: 'SUPABASE_SERVICE_ROLE_KEY', optIn: 'VITEST_DB_ALLOW_REF' });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Evaluate vitest.config.js in a FRESH node process under `env` and return the db project shape. */
function dbProject(env) {
  const script =
    "const c=(await import('./vitest.config.js')).default;" +
    "const d=(c.test.projects||[]).find(p=>p?.test?.name==='db');" +
    "process.stdout.write('<<<INC'+JSON.stringify({include:d?.test?.include??null,setupFiles:d?.test?.setupFiles??null})+'INC>>>');";
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, [ENV.url]: undefined, [ENV.serviceKey]: undefined, [ENV.optIn]: undefined, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const m = out.match(/<<<INC([\s\S]*?)INC>>>/);
  expect(m, `config probe produced no payload; raw output:\n${out}`).toBeTruthy();
  return JSON.parse(m[1]);
}

describe('db project: discovery is UNGATED, safety is at runtime (SD-LEO-INFRA-VITEST-TIER-REAL-001)', () => {
  it('resolves the FULL include when the target is a non-designated production ref (was [] before)', () => {
    // The state the shared root runs in: real credentials, production ref, no opt-in. The db
    // project now still RESOLVES every file — the runtime gate, not an empty include, is what keeps
    // those files from touching production.
    const { include } = dbProject({ [ENV.url]: `https://${PROD_REF}.supabase.co`, [ENV.serviceKey]: KEY, [ENV.optIn]: undefined });
    expect(include).toContain('**/*.db.test.js');
    expect(include.length).toBeGreaterThan(0);
  });

  it('resolves the SAME include whether designated or not — discovery does not branch on the target', () => {
    const undesignated = dbProject({ [ENV.url]: `https://${PROD_REF}.supabase.co`, [ENV.serviceKey]: KEY });
    const designated = dbProject({ [ENV.url]: `https://${OTHER_REF}.supabase.co`, [ENV.serviceKey]: KEY, [ENV.optIn]: OTHER_REF });
    expect(undesignated.include).toEqual(designated.include);
    expect(undesignated.include.length).toBeGreaterThan(0);
  });

  it('the db project loads tests/setup.db.js — the runtime gate is wired', () => {
    const { setupFiles } = dbProject({ [ENV.url]: `https://${PROD_REF}.supabase.co`, [ENV.serviceKey]: KEY });
    expect(Array.isArray(setupFiles) ? setupFiles.join(',') : String(setupFiles)).toMatch(/setup\.db\.js/);
  });

  it('setup.db.js installs the runtime gate (fetch + socket guards), not a discovery gate', () => {
    const setup = fs.readFileSync(path.join(ROOT, 'tests/setup.db.js'), 'utf8');
    expect(setup).toMatch(/installDbTierGate/);
    const gate = fs.readFileSync(path.join(ROOT, 'tests/helpers/db-tier-gate.js'), 'utf8');
    expect(gate).toMatch(/globalThis|globalObj/);
    expect(gate).toMatch(/net\.Socket\.prototype\.connect/);
  });
});
