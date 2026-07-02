import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, 'singleton-relaunch-restore.cjs');

function run(args) {
  const r = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', timeout: 20000 });
  return { status: r.status, stdout: r.stdout.trim(), stderr: r.stderr };
}

describe('singleton-relaunch-restore.cjs CLI (FR-2)', () => {
  it('exits 0 and prints valid JSON with an error field when --predecessor-session-id is missing', () => {
    const { status, stdout } = run([]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.items).toEqual([]);
    expect(parsed.error).toMatch(/missing --predecessor-session-id/);
  });

  it('exits 0 and prints a valid empty-but-valid JSON shape for a non-existent predecessor session', () => {
    const { status, stdout } = run(['--predecessor-session-id', 'definitely-does-not-exist-' + Date.now()]);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed.items)).toBe(true);
  });
});
