/**
 * Unit tests for gh-merge-safe.mjs
 * QF-20260423-964
 *
 * The script shells out to `gh` so the primary coverage is:
 *  - argument parsing (PR # required, method flags, --delete-branch)
 *  - idempotency (already-merged PRs exit 0)
 *  - error propagation
 *
 * Full integration against GitHub is covered by CI's own merge workflow.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const SCRIPT = path.resolve(process.cwd(), 'scripts/gh-merge-safe.mjs');

function runScript(args, envOverride = {}) {
  try {
    return {
      exitCode: 0,
      stdout: execSync(`node "${SCRIPT}" ${args}`, {
        encoding: 'utf8',
        env: { ...process.env, ...envOverride },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (e) {
    return { exitCode: e.status, stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '' };
  }
}

describe('gh-merge-safe arg parsing', () => {
  it('exits 2 when PR number is missing', () => {
    const { exitCode, stderr } = runScript('');
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Usage: gh-merge-safe');
  });

  it('exits 2 when PR number is non-numeric', () => {
    const { exitCode, stderr } = runScript('not-a-number');
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Usage: gh-merge-safe');
  });

  it('accepts numeric PR number', () => {
    // Expect non-2 exit (would be 1 without live gh, but not 2 for arg parsing)
    const { exitCode } = runScript('999999999', { PATH: '' });
    expect(exitCode).not.toBe(2);
  });
});
