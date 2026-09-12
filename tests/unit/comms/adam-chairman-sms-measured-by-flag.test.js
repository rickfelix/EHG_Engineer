/**
 * QF-20260912-901 (FIX SHAPE (a) of QF-20260912-079) — adam-chairman-sms CLI gains --measured-by,
 * mirroring the pattern already established for --reply-to-inbound: spin the real script as a
 * subprocess to test the CLI wiring itself (flag-strict guard acceptance, malformed-JSON
 * rejection). Downstream behavior (measuredBy threaded into the consult lane, the refusal check
 * itself) is unit-tested at the lane/gate level in presend-consult-lane.test.js and
 * chairman-sms-gate-measured-by-refusal.test.js.
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

describe('adam-chairman-sms CLI --measured-by', () => {
  it('is accepted by the flag-strict guard, not rejected as unknown', () => {
    const res = run(['--dry-run', '--body', 'test', '--measured-by', '{"value":"171","instrument":"x"}']);
    expect(res.status).toBe(0);
    expect(res.stderr).not.toMatch(/Unknown flag/);
  });

  it('is documented in --help usage', () => {
    const res = run(['--help']);
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('--measured-by');
  });

  it('rejects malformed --measured-by JSON with exit code 1, nothing sent', () => {
    const res = run(['--body', 'test', '--measured-by', 'not-json']);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/not valid JSON/);
  });
});
