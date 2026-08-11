/**
 * SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-6) — the governed CLI setter for
 * notifications.timezone. Spun as a real subprocess (matching
 * tests/unit/comms/adam-chairman-sms-cli-reply-flag.test.js's convention for these
 * top-level-executing CLI scripts) so --dry-run exercises the real flag parsing and intent
 * construction without touching a live Supabase client.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'adam-set-chairman-location.mjs');

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: REPO });
}

describe('adam-set-chairman-location CLI — flag guard', () => {
  it('--help documents every flag and exits 0', () => {
    const res = run(['--help']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('--zone');
    expect(res.stdout).toContain('--until');
    expect(res.stdout).toContain('--ruling-ref');
    expect(res.stdout).toContain('--clear');
  });

  it('an unrelated unknown flag fails closed (fail-closed for a chairman-preference-writing script)', () => {
    const res = run(['--dry-run', '--zone', 'America/Jamaica', '--ruling-ref', 'd9b5e2d6', '--not-a-real-flag']);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/Unknown flag/);
  });
});

describe('adam-set-chairman-location CLI — governance: no write without a captured ruling', () => {
  it('missing --ruling-ref: warns and exits 0 without attempting a write, even with a valid --zone', () => {
    const res = run(['--dry-run', '--zone', 'America/Jamaica']);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toMatch(/DRY RUN/); // never reaches the intent-printing branch
    expect(res.stderr).toMatch(/--ruling-ref.*required/);
  });

  // SEC-QW-04: --ruling-ref exists SOLELY to make a write traceable. Silently accepting the
  // next flag's name as the ruling-ref value (an omitted/misordered-flags accident) would
  // defeat that guarantee while looking like it succeeded.
  it('SEC-QW-04: a --ruling-ref immediately followed by another flag (no real value) is treated as MISSING, not as that flag name', () => {
    const res = run(['--dry-run', '--ruling-ref', '--zone', 'America/Jamaica']);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toMatch(/DRY RUN/);
    expect(res.stderr).toMatch(/--ruling-ref.*required/);
  });

  it('missing --zone (and not --clear): warns and exits 0 without attempting a write', () => {
    const res = run(['--dry-run', '--ruling-ref', 'd9b5e2d6']);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toMatch(/DRY RUN/);
    expect(res.stderr).toMatch(/--zone.*required/);
  });
});

describe('adam-set-chairman-location CLI — dry-run intent construction', () => {
  it('bare zone (no --until) builds the back-compat bare-string intent', () => {
    const res = run(['--dry-run', '--zone', 'America/Jamaica', '--ruling-ref', 'd9b5e2d6']);
    expect(res.status).toBe(0);
    const jsonStart = res.stdout.indexOf('{');
    const intent = JSON.parse(res.stdout.slice(jsonStart));
    expect(intent).toEqual({ action: 'set', key: 'notifications.timezone', value: 'America/Jamaica', rulingRef: 'd9b5e2d6' });
  });

  it('--zone + --until builds the composite {zone, until} intent', () => {
    const res = run(['--dry-run', '--zone', 'America/Jamaica', '--until', '2026-08-14T12:00:00Z', '--ruling-ref', 'd9b5e2d6']);
    expect(res.status).toBe(0);
    const jsonStart = res.stdout.indexOf('{');
    const intent = JSON.parse(res.stdout.slice(jsonStart));
    expect(intent).toEqual({
      action: 'set', key: 'notifications.timezone',
      value: { zone: 'America/Jamaica', until: '2026-08-14T12:00:00Z' },
      rulingRef: 'd9b5e2d6',
    });
  });

  it('--clear builds a clear intent and does not require --zone', () => {
    const res = run(['--dry-run', '--clear', '--ruling-ref', 'd9b5e2d6']);
    expect(res.status).toBe(0);
    const jsonStart = res.stdout.indexOf('{');
    const intent = JSON.parse(res.stdout.slice(jsonStart));
    expect(intent).toEqual({ action: 'clear', key: 'notifications.timezone', rulingRef: 'd9b5e2d6' });
  });

  it('--clear still requires --ruling-ref (governance applies to clears too)', () => {
    const res = run(['--dry-run', '--clear']);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toMatch(/DRY RUN/);
    expect(res.stderr).toMatch(/--ruling-ref.*required/);
  });
});
