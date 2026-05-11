import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'create-quick-fix.js');

function runCli(args) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, SUPABASE_URL: 'http://test.invalid.local', SUPABASE_SERVICE_ROLE_KEY: 'test' }
  });
}

describe('create-quick-fix.js unknown-flag handling (QF-20260511-728)', () => {
  it('exits non-zero on --id (previously silently ignored)', () => {
    const r = runCli(['--id', 'QF-FOO', '--title', 'x']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Unknown argument/);
    expect(r.stderr).toMatch(/--id/);
  });

  it('exits non-zero on any other unknown flag', () => {
    const r = runCli(['--bogus-flag', 'value']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Unknown argument: --bogus-flag/);
  });

  it('--help still succeeds (exits 0)', () => {
    const r = runCli(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage:/);
  });
});
