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
import { readFileSync } from 'node:fs';
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

  it('accepts --allow-no-checks (QF-20260816-043) without breaking arg parsing', () => {
    const { exitCode } = runScript('999999999 --allow-no-checks', { PATH: '' });
    expect(exitCode).not.toBe(2);
  });
});

// QF-20260815-128: `sh()` shells out via execSync directly (no injectable runner), so the
// sha-pinned merge / MERGE_HEAD_MISMATCH logic below isn't unit-testable without a real `gh`
// process -- the same documented limitation this file's own header names for the rest of the
// script ("Full integration against GitHub is covered by CI's own merge workflow"). This is a
// static regression guard: it pins the SOURCE, not the behavior, against the exact class of
// silent drop measured live (PR #7060, Golf-2 signal 02302c4d): a push landing after the merge
// read its head must not be silently merged past.
describe('gh-merge-safe sha-pinned merge (QF-20260815-128, static regression guard)', () => {
  const src = readFileSync(SCRIPT, 'utf8');

  it('reads headRefOid alongside the existing pre-merge PR state fetch', () => {
    expect(src).toMatch(/gh pr view \$\{prNumber\} --json state,mergeCommit,headRefName,statusCheckRollup,headRefOid/);
  });

  it('pins the PUT merge call to that head via the sha test-and-set param', () => {
    expect(src).toMatch(/gh api --method PUT \$\{apiPath\} -f merge_method=\$\{method\} -f sha=\$\{preview\.headRefOid\}/);
  });

  it('names both SHAs and gives a recovery instruction on a detected mismatch', () => {
    expect(src).toContain('[MERGE_HEAD_MISMATCH]');
    expect(src).toMatch(/head branch was modified/i);
    expect(src).toContain('expected head');
    expect(src).toContain('current head is');
  });
});
