/**
 * progress-tick CLI — argument-validation unit tests.
 * SD-LEO-INFRA-SD-INTRAPHASE-PROGRESS-001
 *
 * Covers the argument-validation and env-guard branches, which are pure and do
 * not depend on a DB connection. Happy-path + monotonicity + unknown-SD behavior
 * is covered by the integration suite (requires a live DB fixture).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', '..', 'scripts', 'progress-tick.js');

function run(args, env = {}) {
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

describe('progress-tick CLI — argument validation', () => {
  it('exits 1 when no args provided', () => {
    const r = run([]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Usage:/);
  });

  it('exits 1 when only SD-KEY provided', () => {
    const r = run(['SD-FOO-001']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Usage:/);
  });

  it('exits 1 for negative pct', () => {
    const r = run(['SD-FOO-001', '-5']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pct must be an integer in \[0,100\]/);
  });

  it('exits 1 for pct > 100', () => {
    const r = run(['SD-FOO-001', '150']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pct must be an integer in \[0,100\]/);
  });

  it('exits 1 for non-integer pct', () => {
    const r = run(['SD-FOO-001', '50.5']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pct must be an integer in \[0,100\]/);
  });

  it('exits 1 for non-numeric pct', () => {
    const r = run(['SD-FOO-001', 'abc']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pct must be an integer in \[0,100\]/);
  });

  it('accepts boundary value pct=0 at arg-validation stage', () => {
    const r = run(['SD-NONEXISTENT-999', '0']);
    expect(r.stderr).not.toMatch(/pct must be an integer/);
  });

  it('accepts boundary value pct=100 at arg-validation stage', () => {
    const r = run(['SD-NONEXISTENT-999', '100']);
    expect(r.stderr).not.toMatch(/pct must be an integer/);
  });

  it('exits 2 when SUPABASE credentials are unset', () => {
    const r = run(['SD-FOO-001', '50'], {
      SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: ''
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set/);
  });
});
