/**
 * QF-20260810-285 — adam-chairman-sms CLI gains --reply-to-inbound so the shipped
 * measured-presence quiet-hours carve-out (chairman-sms-gate/index.js:219,
 * presence-reply-window.js) is actually reachable. Before this fix the flag did not
 * exist: enforceCliSendGuard's flag-strict guard (QF-20260709-211) rejected
 * `--reply-to-inbound` as unknown and exited 1, so a reply-class send could never set
 * context.replyToInbound and the resolver was never consulted.
 *
 * Full context.replyToInbound -> presenceResolver behavior is already covered at the
 * gate level in tests/unit/comms/adam-outbound/presence-reply-window.test.js
 * (TS-1..TS-6). What was untested -- and what broke in production -- is the CLI
 * wiring itself, so this spins the real script as a subprocess (matching the
 * apply-migration-cli.test.js convention) rather than re-testing the gate.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'adam-chairman-sms.mjs');

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: REPO });
}

describe('adam-chairman-sms CLI --reply-to-inbound', () => {
  it('REGRESSION: is accepted by the flag-strict guard, not rejected as unknown', () => {
    // --dry-run short-circuits before any send/DB call, so this exercises exactly the
    // guard boundary that used to fail closed on this flag (QF-20260709-211 shape).
    const res = run(['--dry-run', '--body', 'test', '--reply-to-inbound']);
    expect(res.status).toBe(0);
    expect(res.stderr).not.toMatch(/Unknown flag/);
  });

  it('is documented in --help usage', () => {
    const res = run(['--help']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('--reply-to-inbound');
  });

  it('an unrelated unknown flag still fails closed (guard is not globally disabled)', () => {
    const res = run(['--dry-run', '--body', 'test', '--not-a-real-flag']);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/Unknown flag/);
  });
});
