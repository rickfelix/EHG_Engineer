import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'ci', 'audit-log-parity-check.mjs');

describe('Sibling A audit-log parity check script', () => {
  it('script exists at scripts/ci/audit-log-parity-check.mjs', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
  });

  it('uses correlation_id / audit_log_id JOIN strategy (NOT 100ms time window)', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf8');
    expect(src).toContain('audit_log_id IS NULL');
    expect(src).toContain('bypass_ledger');
    expect(src).not.toMatch(/100ms|100\s*-?\s*millisecond/i);
    expect(src).not.toMatch(/INTERVAL\s+'100\s*(milliseconds?|ms)'/i);
  });

  it('threshold defaults to 0.99', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf8');
    expect(src).toMatch(/threshold:\s*0\.99/);
  });

  it('rolling window defaults to 7 days', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf8');
    expect(src).toMatch(/window_days:\s*7/);
  });

  it('exit codes: 0 on pass, 1 on fail', () => {
    const src = readFileSync(SCRIPT_PATH, 'utf8');
    expect(src).toContain('status === \'pass\' ? 0 : 1');
  });
});
